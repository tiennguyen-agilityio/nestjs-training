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
  STRIPE_SECRET_KEY: 'sk_test_unit',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_unit',
  WEB_APP_URL: 'http://localhost:3101',
  PAYPAL_CLIENT_ID: 'paypal-client',
  PAYPAL_CLIENT_SECRET: 'paypal-secret',
  PAYPAL_WEBHOOK_ID: 'WH-ID',
  PAYPAL_API_URL: 'https://api-m.sandbox.paypal.com',
};

describe('validate (PayPal)', () => {
  it.each([
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
    'PAYPAL_API_URL',
  ])('env validation requires %s', (name) => {
    const env = { ...base };
    delete env[name];

    expect(() => validate(env)).toThrow(new RegExp(name));
  });

  it('env validation rejects a PAYPAL_API_URL that is not a URL', () => {
    expect(() => validate({ ...base, PAYPAL_API_URL: 'not a url' })).toThrow(
      /PAYPAL_API_URL/,
    );
  });

  it('env validation keeps the PayPal values', () => {
    const env = validate(base);

    expect(env.PAYPAL_CLIENT_ID).toBe('paypal-client');
    expect(env.PAYPAL_API_URL).toBe('https://api-m.sandbox.paypal.com');
  });
});

describe('validate (Stripe)', () => {
  it.each(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WEB_APP_URL'])(
    'validate rejects a missing Stripe variable (%s)',
    (name) => {
      const env = { ...base };
      delete env[name];

      expect(() => validate(env)).toThrow(new RegExp(name));
    },
  );

  it('validate rejects a WEB_APP_URL that is not a URL', () => {
    expect(() => validate({ ...base, WEB_APP_URL: 'not a url' })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('validate accepts http://localhost:3101 as WEB_APP_URL', () => {
    const env = validate(base);

    expect(env.WEB_APP_URL).toBe('http://localhost:3101');
    expect(env.STRIPE_SECRET_KEY).toBe('sk_test_unit');
    expect(env.STRIPE_WEBHOOK_SECRET).toBe('whsec_test_unit');
  });
});

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
