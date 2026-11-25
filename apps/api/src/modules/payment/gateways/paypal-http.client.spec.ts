import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';
import {
  PayPalHttpClient,
  PayPalUnavailableError,
} from './paypal-http.client.js';

const BASE_URL = 'https://api-m.sandbox.paypal.com';
const CONFIG: Record<string, string> = {
  PAYPAL_API_URL: BASE_URL,
  PAYPAL_CLIENT_ID: 'client-id',
  PAYPAL_CLIENT_SECRET: 'client-secret',
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const token = (accessToken = 'token-1', expiresIn = 32400): Response =>
  json(200, { access_token: accessToken, expires_in: expiresIn });

describe('PayPalHttpClient', () => {
  let fetchMock: Mock;
  let client: PayPalHttpClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const config = {
      getOrThrow: vi.fn((key: string) => CONFIG[key]),
    } as unknown as ConfigService;
    client = new PayPalHttpClient(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('PayPalHttpClient targets PAYPAL_API_URL with a client-credentials token', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(201, { id: 'PP-1' }));

    const response = await client.request<{ id: string }>(
      'POST',
      '/v2/checkout/orders',
      { body: { intent: 'CAPTURE' }, headers: { 'PayPal-Request-Id': 'k1' } },
    );

    expect(response).toEqual({ status: 201, body: { id: 'PP-1' } });
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(tokenUrl).toBe(`${BASE_URL}/v1/oauth2/token`);
    expect(tokenInit.method).toBe('POST');
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(tokenInit.body).toBe('grant_type=client_credentials');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v2/checkout/orders`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': 'k1',
    });
    expect(init.body).toBe('{"intent":"CAPTURE"}');
  });

  it('request reuses the token until shortly before it expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    fetchMock
      .mockResolvedValueOnce(token('token-1', 600))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(token('token-2', 600))
      .mockResolvedValueOnce(json(200, {}));

    await client.request('GET', '/v2/checkout/orders/A');
    await client.request('GET', '/v2/checkout/orders/B');
    vi.setSystemTime(new Date('2026-11-24T10:09:30Z'));
    await client.request('GET', '/v2/checkout/orders/C');

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.filter((url) => url.endsWith('/v1/oauth2/token'))).toHaveLength(
      2,
    );
    const [, lastInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    expect(lastInit.headers).toMatchObject({
      Authorization: 'Bearer token-2',
    });
  });

  it('request refreshes the token once on a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(token('stale'))
      .mockResolvedValueOnce(json(401, { error: 'invalid_token' }))
      .mockResolvedValueOnce(token('fresh'))
      .mockResolvedValueOnce(json(200, { status: 'CREATED' }));

    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).resolves.toEqual({ status: 200, body: { status: 'CREATED' } });
    const [, retryInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(retryInit.headers).toMatchObject({ Authorization: 'Bearer fresh' });
  });

  it('request returns 4xx answers with their body', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(422, { name: 'UNPROCESSABLE_ENTITY' }));

    await expect(
      client.request('POST', '/v2/checkout/orders/A/capture'),
    ).resolves.toEqual({ status: 422, body: { name: 'UNPROCESSABLE_ENTITY' } });
  });

  it('request maps a network error, a timeout or a 5xx to PayPalUnavailableError', async () => {
    fetchMock.mockResolvedValueOnce(token());
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).rejects.toBeInstanceOf(PayPalUnavailableError);

    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );
    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).rejects.toBeInstanceOf(PayPalUnavailableError);

    fetchMock.mockResolvedValueOnce(
      new Response('<html>Service Unavailable</html>', { status: 503 }),
    );
    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).rejects.toBeInstanceOf(PayPalUnavailableError);
  });

  it('request maps a timeout while reading the body to PayPalUnavailableError', async () => {
    const stalled = json(200, {});
    vi.spyOn(stalled, 'text').mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(stalled);

    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).rejects.toBeInstanceOf(PayPalUnavailableError);
  });

  it('request maps a failed token call to PayPalUnavailableError', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));

    await expect(
      client.request('GET', '/v2/checkout/orders/A'),
    ).rejects.toBeInstanceOf(PayPalUnavailableError);
  });

  it('request sends a timeout signal with every call', async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(200, {}));

    await client.request('GET', '/v2/checkout/orders/A');

    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('request sends rawBody unchanged', async () => {
    const rawBody = '{"webhook_event":{"id":"WH-1","a":1.10}}';
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(json(200, { verification_status: 'SUCCESS' }));

    await client.request('POST', '/v1/notifications/verify-webhook-signature', {
      rawBody,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.body).toBe(rawBody);
  });
});
