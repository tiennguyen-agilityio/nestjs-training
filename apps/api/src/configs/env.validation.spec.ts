import { validate } from './env.validation.js';

const base: Record<string, unknown> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'db',
  DB_USER: 'user',
  DB_PASSWORD: 'password',
  CORS_ORIGIN: 'http://localhost:3001',
  THROTTLE_TTL: '60000',
  THROTTLE_LIMIT: '100',
  CLERK_SECRET_KEY: 'sk_test',
  CLERK_WEBHOOK_SECRET: 'whsec_test',
  CLERK_PUBLISHABLE_KEY: 'pk_test',
};

describe('validate (GRACEFUL_SHUTDOWN_TIMEOUT_MS)', () => {
  it('treats a missing GRACEFUL_SHUTDOWN_TIMEOUT_MS as unset', () => {
    expect(validate(base).GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBeUndefined();
  });

  it('treats an empty GRACEFUL_SHUTDOWN_TIMEOUT_MS as unset', () => {
    const env = { ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '' };

    expect(validate(env).GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBeUndefined();
  });

  it('treats a whitespace-only GRACEFUL_SHUTDOWN_TIMEOUT_MS as unset', () => {
    const env = { ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '  ' };

    expect(validate(env).GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBeUndefined();
  });

  it('parses GRACEFUL_SHUTDOWN_TIMEOUT_MS as an integer', () => {
    expect(
      validate({ ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '8000' })
        .GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    ).toBe(8000);
    expect(
      validate({ ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '0' })
        .GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    ).toBe(0);
  });

  it('rejects a negative GRACEFUL_SHUTDOWN_TIMEOUT_MS', () => {
    expect(() =>
      validate({ ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: '-1' }),
    ).toThrow(/Invalid environment variables/);
    expect(() =>
      validate({ ...base, GRACEFUL_SHUTDOWN_TIMEOUT_MS: 'abc' }),
    ).toThrow(/Invalid environment variables/);
  });
});
