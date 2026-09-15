import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/common/enums';
import { E2EContext, FakeTargetServer, auth, bootstrapE2E } from './e2e-utils';

/**
 * Authorization is enforced server-side on every mutating route. The UI only
 * hides controls, so these specs assert the API refuses the call regardless.
 */
describe('RBAC (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  const target = new FakeTargetServer();
  let targetId: string;
  let incidentId: string;

  const headers = (role: UserRole) => auth(ctx.tokens[role]);

  beforeAll(async () => {
    await target.start();
    target.succeed();
    ctx = await bootstrapE2E();
    app = ctx.app;

    const created = await request(app.getHttpServer())
      .post('/api/v1/targets')
      .set(headers(UserRole.ADMIN))
      .send({ name: 'RBAC target', url: target.url, intervalSeconds: 30 })
      .expect(201);
    targetId = created.body.id;

    // Drive one incident into existence so acknowledge/notes can be exercised.
    target.fail();
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/check-now`)
        .set(headers(UserRole.OPERATOR))
        .expect(200);
    }
    const incidents = await request(app.getHttpServer())
      .get(`/api/v1/incidents?targetId=${targetId}`)
      .set(headers(UserRole.ADMIN))
      .expect(200);
    incidentId = incidents.body.items[0].id;
  });

  afterAll(async () => {
    await app.close();
    await target.stop();
  });

  describe('unauthenticated', () => {
    it.each([
      '/api/v1/targets',
      '/api/v1/incidents',
      '/api/v1/dashboard/summary',
      '/api/v1/auth/me',
    ])('rejects GET %s with 401', async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    });

    it('rejects a garbage token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/targets')
        .set({ Authorization: 'Bearer not-a-real-token' })
        .expect(401);
    });

    it('does not reveal whether an email exists', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@e2e.local', password: 'WrongPassword1!' })
        .expect(401);
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@e2e.local', password: 'WrongPassword1!' })
        .expect(401);
      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('VIEWER is read-only', () => {
    it('can read targets, incidents, metrics and the dashboard', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/targets')
        .set(headers(UserRole.VIEWER))
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/incidents')
        .set(headers(UserRole.VIEWER))
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set(headers(UserRole.VIEWER))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/targets/${targetId}/metrics?window=24h`)
        .set(headers(UserRole.VIEWER))
        .expect(200);
    });

    it('cannot create, edit, pause, check or archive a target', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/targets')
        .set(headers(UserRole.VIEWER))
        .send({ name: 'nope', url: 'https://example.com/health' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/targets/${targetId}`)
        .set(headers(UserRole.VIEWER))
        .send({ name: 'renamed' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/pause`)
        .set(headers(UserRole.VIEWER))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/check-now`)
        .set(headers(UserRole.VIEWER))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/archive`)
        .set(headers(UserRole.VIEWER))
        .expect(403);
    });

    it('cannot acknowledge an incident or add a note', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/acknowledge`)
        .set(headers(UserRole.VIEWER))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/notes`)
        .set(headers(UserRole.VIEWER))
        .send({ content: 'should not be allowed' })
        .expect(403);
    });

    it('cannot manage users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set(headers(UserRole.VIEWER))
        .expect(403);
    });
  });

  describe('OPERATOR', () => {
    it('can acknowledge, note, check-now, pause and resume', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/acknowledge`)
        .set(headers(UserRole.OPERATOR))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/incidents/${incidentId}/notes`)
        .set(headers(UserRole.OPERATOR))
        .send({ content: 'Operator acknowledged and is investigating.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/check-now`)
        .set(headers(UserRole.OPERATOR))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/pause`)
        .set(headers(UserRole.OPERATOR))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/targets/${targetId}/resume`)
        .set(headers(UserRole.OPERATOR))
        .expect(200);
    });

    it('cannot create or edit a target', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/targets')
        .set(headers(UserRole.OPERATOR))
        .send({ name: 'nope', url: 'https://example.com/health' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/targets/${targetId}`)
        .set(headers(UserRole.OPERATOR))
        .send({ name: 'renamed' })
        .expect(403);
    });

    it('cannot manage users', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set(headers(UserRole.OPERATOR))
        .send({
          name: 'Sneaky',
          email: 'sneaky@e2e.local',
          password: 'LongEnoughPassword1!',
          role: 'ADMIN',
        })
        .expect(403);
    });
  });

  describe('ADMIN', () => {
    it('can edit a target', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/targets/${targetId}`)
        .set(headers(UserRole.ADMIN))
        .send({ name: 'RBAC target renamed', intervalSeconds: 45 })
        .expect(200);
      expect(response.body.name).toBe('RBAC target renamed');
      expect(response.body.intervalSeconds).toBe(45);
    });

    it('rejects an interval below the configured minimum', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/targets/${targetId}`)
        .set(headers(UserRole.ADMIN))
        .send({ intervalSeconds: 5 })
        .expect(400);
    });

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/targets/${targetId}`)
        .set(headers(UserRole.ADMIN))
        .send({ totallyUnknownField: true })
        .expect(400);
    });

    it('can list and create users without leaking the password hash', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set(headers(UserRole.ADMIN))
        .expect(200);
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set(headers(UserRole.ADMIN))
        .send({
          name: 'New Viewer',
          email: 'new.viewer@e2e.local',
          password: 'LongEnoughPassword1!',
          role: 'VIEWER',
        })
        .expect(201);
      expect(created.body.passwordHash).toBeUndefined();
      expect(created.body.role).toBe('VIEWER');
    });
  });
});
