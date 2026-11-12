import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import type { HealthCheckResult } from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { AppModule } from './../../src/app.module.js';
import { AuthProvider } from './../../src/common/providers/auth.provider.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';
import { DATABASE_PING_CACHE_MS } from './../../src/modules/health/indicators/database-health.indicator.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

type HealthBody = {
  data: HealthCheckResult;
};

type ErrorBody = {
  statusCode: number;
  errors: { errCode: string }[];
};

// Probes live at the root: no API prefix, no version (design #10).
const LIVE = '/health/live';
const READY = '/health/ready';

describe('Health probes (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;

  // The readiness result is cached for DATABASE_PING_CACHE_MS; move the (faked)
  // clock past it so the next probe runs a new query.
  const expireHealthCache = () =>
    vi.setSystemTime(Date.now() + DATABASE_PING_CACHE_MS + 1);

  const failDatabase = () => {
    vi.spyOn(orm.em.getConnection(), 'execute').mockRejectedValue(
      new Error('connect ECONNREFUSED'),
    );
    expireHealthCache();
  };

  beforeAll(async () => {
    // Only Date is faked, for the whole file: it is frozen except for the
    // forward jumps of expireHealthCache, which move past the readiness cache.
    // setTimeout and sockets stay real. Tests here must not rely on elapsed time.
    vi.useFakeTimers({ toFake: ['Date'] });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await initTestApp(moduleFixture);
    // Terminus logs each failed check on purpose; keep it out of the test output.
    app.useLogger(false);
    // Listen once on 127.0.0.1 (the OS picks the port once): supertest
    // otherwise opens a new ephemeral port per request, and over the hundreds
    // of requests below one can land on a port another local process holds on
    // 127.0.0.1.
    await app.listen(0, '127.0.0.1');
    orm = app.get(MikroORM);
  });

  afterAll(async () => {
    await app.close();
    vi.useRealTimers();
  });

  beforeEach(() => {
    (getAuth as Mock).mockReturnValue({ userId: null });
    expireHealthCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ready answers 200 and lists the database indicator', async () => {
    const response = await request(app.getHttpServer()).get(READY).expect(200);

    const { data } = response.body as HealthBody;
    expect(data.status).toBe('ok');
    expect(data.info?.database.status).toBe('up');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('the probes are not under the API prefix or a version', async () => {
    await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health/live`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/health/ready`)
      .expect(404);
  });

  it('live answers 200 with no indicators', async () => {
    const response = await request(app.getHttpServer()).get(LIVE).expect(200);

    const { data } = response.body as HealthBody;
    expect(data.status).toBe('ok');
    expect(data.details).toEqual({});
  });

  it('ready answers 503 and live 200 when the database indicator fails', async () => {
    failDatabase();

    const ready = await request(app.getHttpServer()).get(READY).expect(503);
    const body = ready.body as ErrorBody;
    expect(body.statusCode).toBe(503);
    expect(body.errors[0].errCode).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);

    await request(app.getHttpServer()).get(LIVE).expect(200);
  });

  it('both probes answer without a session', async () => {
    for (const path of [LIVE, READY]) {
      await request(app.getHttpServer()).get(path).expect(200);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer invalid')
        .expect(200);
    }
  });

  it('neither probe runs the user-resolution middleware', async () => {
    const getSessionUserId = vi.spyOn(
      app.get(AuthProvider),
      'getSessionUserId',
    );

    for (const path of [LIVE, READY]) {
      await request(app.getHttpServer()).get(path).expect(200);
      // Some probes and uptime checkers send HEAD.
      await request(app.getHttpServer()).head(path).expect(200);
    }
    expect(getSessionUserId).not.toHaveBeenCalled();

    // Control: the spy does see the middleware on any other route.
    await request(app.getHttpServer()).get(`${API_BASE_PATH}/categories`);
    expect(getSessionUserId).toHaveBeenCalled();
  });

  it('neither probe is rate-limited', async () => {
    const limit = Number(process.env.THROTTLE_LIMIT);

    for (const path of [LIVE, READY]) {
      for (let i = 0; i <= limit; i++) {
        const response = await request(app.getHttpServer()).get(path);
        expect(response.status).toBe(200);
      }
    }
  }, 60_000);

  it('no probe response exposes a connection string, a version or a stack trace', async () => {
    const responses = [
      await request(app.getHttpServer()).get(LIVE),
      await request(app.getHttpServer()).get(READY),
    ];
    failDatabase();
    responses.push(await request(app.getHttpServer()).get(READY));

    expect(responses.map((r) => r.status)).toEqual([200, 200, 503]);

    const secrets = [
      process.env.DB_HOST,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      process.env.DB_NAME,
    ].filter((value): value is string => Boolean(value));

    for (const response of responses) {
      const text = response.text;
      for (const secret of secrets) {
        expect(text).not.toContain(secret);
      }
      expect(text).not.toContain('postgres://');
      expect(text).not.toContain(packageJson.version);
      expect(text).not.toMatch(/stack/i);
      expect(text).not.toMatch(/\bat \S+[/\\]\S+:\d+/);
    }
  });
});
