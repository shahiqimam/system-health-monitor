import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/common/enums';
import { E2EContext, FakeTargetServer, auth, bootstrapE2E } from './e2e-utils';

/**
 * Full monitoring lifecycle against a real PostgreSQL database and a local
 * HTTP target: login -> create target -> check -> failure threshold opens an
 * incident -> acknowledge -> recovery resolves it -> metrics -> pause/resume
 * -> archive.
 */
describe('Monitoring lifecycle (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let dataSource: DataSource;
  const target = new FakeTargetServer();
  let targetId: string;
  let incidentId: string;

  const adminHeaders = () => auth(ctx.tokens[UserRole.ADMIN]);
  const operatorHeaders = () => auth(ctx.tokens[UserRole.OPERATOR]);

  const checkNow = () =>
    request(app.getHttpServer())
      .post(`/api/v1/targets/${targetId}/check-now`)
      .set(operatorHeaders())
      .expect(200);

  const readTarget = async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/targets/${targetId}`)
      .set(adminHeaders())
      .expect(200);
    return response.body;
  };

  beforeAll(async () => {
    await target.start();
    ctx = await bootstrapE2E();
    app = ctx.app;
    dataSource = ctx.dataSource;
  });

  afterAll(async () => {
    await app.close();
    await target.stop();
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/v1/targets').expect(401);
  });

  it('exposes liveness without a token', async () => {
    const live = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(live.body.status).toBe('ok');
  });

  it('reports readiness honestly with the scheduler disabled', async () => {
    // The scheduler is intentionally off for these specs, so readiness must
    // say so rather than claiming the instance is fully ready.
    const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(ready.body.checks.database).toBe(true);
    expect(ready.body.checks.scheduler).toBe(false);
  });

  it('creates a target as ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/targets')
      .set(adminHeaders())
      .send({
        name: 'E2E local target',
        url: target.url,
        intervalSeconds: 30,
        timeoutMs: 3000,
        expectedStatusMin: 200,
        expectedStatusMax: 299,
      })
      .expect(201);

    targetId = response.body.id;
    expect(response.body.status).toBe('UNKNOWN');
    expect(response.body.consecutiveFailures).toBe(0);
  });

  it('refuses a target whose scheme is not http(s)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/targets')
      .set(adminHeaders())
      .send({ name: 'blocked', url: 'file:///etc/passwd' })
      .expect(400);
  });

  it('refuses a target URL containing credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/targets')
      .set(adminHeaders())
      .send({ name: 'creds', url: 'https://user:pass@example.com/health' })
      .expect(400);
  });

  it('records a successful check and marks the target UP', async () => {
    target.succeed();
    const response = await checkNow();
    expect(response.body.result.status).toBe('SUCCESS');
    expect(response.body.result.httpStatus).toBe(200);
    expect(response.body.result.latencyMs).toBeGreaterThanOrEqual(0);
    expect((await readTarget()).status).toBe('UP');
  });

  it('exposes the stored check result', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/targets/${targetId}/checks?limit=10`)
      .set(adminHeaders())
      .expect(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0].status).toBe('SUCCESS');
  });

  it('degrades on the first two failures without opening an incident', async () => {
    target.fail();

    await checkNow();
    expect((await readTarget()).status).toBe('DEGRADED');

    await checkNow();
    const degraded = await readTarget();
    expect(degraded.status).toBe('DEGRADED');
    expect(degraded.consecutiveFailures).toBe(2);

    const incidents = await request(app.getHttpServer())
      .get(`/api/v1/incidents?targetId=${targetId}`)
      .set(adminHeaders())
      .expect(200);
    expect(incidents.body.total).toBe(0);
  });

  it('goes DOWN and opens exactly one incident at the failure threshold', async () => {
    await checkNow();
    const down = await readTarget();
    expect(down.status).toBe('DOWN');
    expect(down.consecutiveFailures).toBe(3);

    const incidents = await request(app.getHttpServer())
      .get(`/api/v1/incidents?targetId=${targetId}&status=OPEN`)
      .set(adminHeaders())
      .expect(200);
    expect(incidents.body.total).toBe(1);
    incidentId = incidents.body.items[0].id;
    expect(incidents.body.items[0].failureCountAtOpen).toBe(3);
  });

  it('reuses the same incident on further failures', async () => {
    await checkNow();
    const incidents = await request(app.getHttpServer())
      .get(`/api/v1/incidents?targetId=${targetId}`)
      .set(adminHeaders())
      .expect(200);
    expect(incidents.body.total).toBe(1);
    expect(incidents.body.items[0].id).toBe(incidentId);
  });

  it('acknowledges the incident and accepts a note', async () => {
    const acknowledged = await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set(operatorHeaders())
      .expect(200);
    expect(acknowledged.body.status).toBe('ACKNOWLEDGED');

    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/notes`)
      .set(operatorHeaders())
      .send({ content: 'Investigating the e2e target.' })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set(operatorHeaders())
      .expect(200);
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.timeline.length).toBeGreaterThan(0);
  });

  it('rejects acknowledging an already acknowledged incident', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set(operatorHeaders())
      .expect(409);
  });

  it('stays DOWN on the first success while recovery is pending', async () => {
    target.succeed();
    await checkNow();
    const recovering = await readTarget();
    expect(recovering.status).toBe('DOWN');
    expect(recovering.consecutiveSuccesses).toBe(1);
  });

  it('recovers to UP and resolves the incident at the recovery threshold', async () => {
    await checkNow();
    expect((await readTarget()).status).toBe('UP');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/incidents/${incidentId}`)
      .set(adminHeaders())
      .expect(200);
    expect(detail.body.status).toBe('RESOLVED');
    expect(detail.body.resolvedAt).not.toBeNull();
  });

  it('reports metrics derived from the stored samples', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/targets/${targetId}/metrics?window=24h`)
      .set(adminHeaders())
      .expect(200);

    const { uptime, latency } = response.body;
    // 3 successes (initial UP, then the two recovery checks) and 4 failures.
    expect(uptime.totalChecks).toBe(7);
    expect(uptime.successfulChecks).toBe(3);
    expect(uptime.failedChecks).toBe(4);
    expect(uptime.uptimePercent).toBe(42.86);
    expect(latency.sampleCount).toBe(3);
    expect(latency.p95Ms).not.toBeNull();
  });

  it('rejects an unsupported metrics window', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/targets/${targetId}/metrics?window=all`)
      .set(adminHeaders())
      .expect(400);
  });

  it('pauses the target and refuses to check it', async () => {
    const paused = await request(app.getHttpServer())
      .post(`/api/v1/targets/${targetId}/pause`)
      .set(operatorHeaders())
      .expect(200);
    expect(paused.body.status).toBe('PAUSED');
    expect(paused.body.enabled).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/targets/${targetId}/check-now`)
      .set(operatorHeaders())
      .expect(409);
  });

  it('excludes a paused target from the scheduler due query', async () => {
    const due = await dataSource.query(
      "SELECT id FROM monitor_targets WHERE enabled = true AND archived = false AND status <> 'PAUSED'",
    );
    expect(due.map((row: { id: string }) => row.id)).not.toContain(targetId);
  });

  it('resumes the target back to UNKNOWN with reset counters', async () => {
    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/targets/${targetId}/resume`)
      .set(operatorHeaders())
      .expect(200);
    expect(resumed.body.status).toBe('UNKNOWN');
    expect(resumed.body.enabled).toBe(true);
    expect(resumed.body.consecutiveFailures).toBe(0);
  });

  it('archives the target as ADMIN and hides it from the default list', async () => {
    const archived = await request(app.getHttpServer())
      .post(`/api/v1/targets/${targetId}/archive`)
      .set(adminHeaders())
      .expect(200);
    expect(archived.body.archived).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/v1/targets')
      .set(adminHeaders())
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(targetId);
  });

  it('keeps incidents after archiving', async () => {
    const incidents = await request(app.getHttpServer())
      .get(`/api/v1/incidents?targetId=${targetId}`)
      .set(adminHeaders())
      .expect(200);
    expect(incidents.body.total).toBe(1);
  });
});
