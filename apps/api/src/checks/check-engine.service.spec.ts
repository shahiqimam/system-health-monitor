import { ConfigService } from '@nestjs/config';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { CheckErrorType, CheckResultStatus, HttpMethod } from '../common/enums';
import { AppConfig, loadConfig } from '../config/configuration';
import { CheckEngineService } from './check-engine.service';
import { CheckableTarget } from './check-engine.types';
import { UrlValidatorService } from './ssrf/url-validator.service';

const buildValidator = (allowPrivateTargets: boolean): UrlValidatorService => {
  const config = loadConfig();
  config.ssrf.allowPrivateTargets = allowPrivateTargets;
  return new UrlValidatorService({
    get: (key: keyof AppConfig) => config[key],
  } as unknown as ConfigService<AppConfig, true>);
};

type Handler = (url: string) => {
  status: number;
  headers?: Record<string, string>;
  delayMs?: number;
};

describe('CheckEngineService', () => {
  let server: Server;
  let baseUrl: string;
  let handler: Handler;
  // The local test server lives on 127.0.0.1, so the engine under test runs
  // with the documented local-lab override enabled.
  const engine = new CheckEngineService(buildValidator(true));

  beforeAll(async () => {
    server = createServer((req, res) => {
      const response = handler(req.url ?? '/');
      const send = () => {
        res.writeHead(response.status, { 'content-type': 'text/plain', ...response.headers });
        res.end('ok');
      };
      if (response.delayMs) setTimeout(send, response.delayMs);
      else send();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await engine.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const target = (overrides: Partial<CheckableTarget> = {}): CheckableTarget => ({
    url: `${baseUrl}/health`,
    method: HttpMethod.GET,
    expectedStatusMin: 200,
    expectedStatusMax: 399,
    timeoutMs: 2000,
    followRedirects: false,
    maxRedirects: 3,
    ...overrides,
  });

  it('records SUCCESS and a latency for a 200 response', async () => {
    handler = () => ({ status: 200 });
    const result = await engine.checkTarget(target());
    expect(result.status).toBe(CheckResultStatus.SUCCESS);
    expect(result.httpStatus).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.errorType).toBeNull();
  });

  it('accepts a 3xx when it falls inside the configured range', async () => {
    handler = () => ({ status: 301, headers: { location: '/moved' } });
    const result = await engine.checkTarget(target());
    expect(result.status).toBe(CheckResultStatus.SUCCESS);
    expect(result.httpStatus).toBe(301);
  });

  it('fails with INVALID_STATUS on an unexpected 500', async () => {
    handler = () => ({ status: 500 });
    const result = await engine.checkTarget(target());
    expect(result.status).toBe(CheckResultStatus.FAILURE);
    expect(result.errorType).toBe(CheckErrorType.INVALID_STATUS);
    expect(result.httpStatus).toBe(500);
  });

  it('fails when a 200 falls outside a narrowed expected range', async () => {
    handler = () => ({ status: 200 });
    const result = await engine.checkTarget(
      target({ expectedStatusMin: 201, expectedStatusMax: 204 }),
    );
    expect(result.errorType).toBe(CheckErrorType.INVALID_STATUS);
  });

  it('classifies a slow endpoint as TIMEOUT', async () => {
    handler = () => ({ status: 200, delayMs: 800 });
    const result = await engine.checkTarget(target({ timeoutMs: 200 }));
    expect(result.status).toBe(CheckResultStatus.FAILURE);
    expect(result.errorType).toBe(CheckErrorType.TIMEOUT);
  });

  it('classifies a closed port as CONNECTION', async () => {
    const result = await engine.checkTarget(target({ url: 'http://127.0.0.1:1/health' }));
    expect(result.errorType).toBe(CheckErrorType.CONNECTION);
  });

  it('rejects a blocked scheme as BLOCKED_TARGET', async () => {
    const result = await engine.checkTarget(target({ url: 'file:///etc/passwd' }));
    expect(result.errorType).toBe(CheckErrorType.BLOCKED_TARGET);
  });

  it('follows an allowed redirect when configured', async () => {
    handler = (url) =>
      url === '/health' ? { status: 302, headers: { location: '/final' } } : { status: 200 };
    const result = await engine.checkTarget(
      target({ followRedirects: true, expectedStatusMax: 299 }),
    );
    expect(result.status).toBe(CheckResultStatus.SUCCESS);
    expect(result.redirectCount).toBe(1);
  });

  it('fails with REDIRECT_LIMIT when the hop cap is exceeded', async () => {
    handler = () => ({ status: 302, headers: { location: '/loop' } });
    const result = await engine.checkTarget(
      target({ followRedirects: true, maxRedirects: 2, expectedStatusMax: 299 }),
    );
    expect(result.errorType).toBe(CheckErrorType.REDIRECT_LIMIT);
  });

  it('rejects a redirect that points at a blocked scheme', async () => {
    handler = () => ({ status: 302, headers: { location: 'file:///etc/passwd' } });
    const result = await engine.checkTarget(
      target({ followRedirects: true, expectedStatusMax: 299 }),
    );
    expect(result.errorType).toBe(CheckErrorType.BLOCKED_TARGET);
  });
});

describe('CheckEngineService with SSRF defaults (ALLOW_PRIVATE_TARGETS=false)', () => {
  const engine = new CheckEngineService(buildValidator(false));

  afterAll(async () => {
    await engine.onModuleDestroy();
  });

  const base: CheckableTarget = {
    url: 'http://127.0.0.1:9/health',
    method: HttpMethod.GET,
    expectedStatusMin: 200,
    expectedStatusMax: 399,
    timeoutMs: 2000,
    followRedirects: false,
    maxRedirects: 3,
  };

  it('blocks a loopback target', async () => {
    const result = await engine.checkTarget(base);
    expect(result.errorType).toBe(CheckErrorType.BLOCKED_TARGET);
    expect(result.errorMessage).toMatch(/blocked/i);
  });

  it('blocks a private RFC1918 target', async () => {
    const result = await engine.checkTarget({ ...base, url: 'http://10.0.0.5/health' });
    expect(result.errorType).toBe(CheckErrorType.BLOCKED_TARGET);
  });

  it('blocks the cloud metadata address', async () => {
    const result = await engine.checkTarget({ ...base, url: 'http://169.254.169.254/' });
    expect(result.errorType).toBe(CheckErrorType.BLOCKED_TARGET);
  });
});
