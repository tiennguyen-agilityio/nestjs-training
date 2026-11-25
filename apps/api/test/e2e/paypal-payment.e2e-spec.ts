import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import { UserRole } from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { PayPalHttpClient } from './../../src/modules/payment/gateways/paypal-http.client.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface PaymentRow {
  status: string;
  checkout_session_id: string | null;
  transaction_id: string | null;
  completed_at: Date | null;
  failure_reason: string | null;
  updated_at: Date;
}

interface OrderRow {
  status: string;
  updated_at: Date;
}

interface PayPalCall {
  method: string;
  path: string;
}

const HEADERS = {
  'paypal-transmission-id': 'tx-e2e',
  'paypal-transmission-time': '2026-11-24T10:00:00Z',
  'paypal-transmission-sig': 'sig',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
};

/**
 * PayPal is never called: PayPalHttpClient.request answers by path. Each test
 * sets what the capture and the signature check answer.
 */
describe('PayPal payments (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let paypal: Mock;
  let calls: PayPalCall[];
  let captureAnswer: { status: number; body: unknown };
  let orderAnswers: Record<string, { status: number; body: unknown }>;
  let createHeaders: (Record<string, string> | undefined)[];
  let verification: string;

  const ORDERS = `${API_BASE_PATH}/orders`;
  const ORDER_EXPIRES_AT = new Date(Date.now() + 12 * 60 * 60 * 1000);

  const suffix = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const execute = async <T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> => (await orm.em.getConnection().execute(sql, params)) as T;

  const signIn = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const createUser = (): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-paypal-${suffix()}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Pay',
        lastName: 'Pal',
        role: UserRole.USER,
      });
      return { id: user.id, clerkId };
    });

  const seedOrder = async (
    userId: string,
    paypalOrderId: string | null = null,
  ): Promise<{ orderId: string; paymentId: string }> => {
    const methodId = randomUUID();
    const orderId = randomUUID();
    const paymentId = randomUUID();
    const tag = suffix();
    await execute(
      `insert into shipping_methods (id, name, description, price, status, created_at, updated_at)
       values (?, ?, 'A method', 12, 'ACTIVE', now(), now())`,
      [methodId, `PayPal Method ${tag}`],
    );
    await execute(
      `insert into orders (id, user_id, shipping_method_id, order_number,
         recipient_name, recipient_phone, address_line, ward, district, city,
         postal_code, shipping_method_name, shipping_fee, tax, total_amount,
         expires_at, created_at, updated_at)
       values (?, ?, ?, ?, 'Lan Nguyen', '0901234567', '12 Le Loi', 'Ben Nghe',
         'District 1', 'Ho Chi Minh City', '700000', 'Roast Express', 12, 2, 34,
         ?, now(), now())`,
      [orderId, userId, methodId, `PP-${tag}`.slice(0, 20), ORDER_EXPIRES_AT],
    );
    await execute(
      `insert into payments (id, order_id, type, method, status, amount,
         checkout_session_id, created_at, updated_at)
       values (?, ?, 'CHARGE', 'PAYPAL', 'PENDING', 34, ?, now(), now())`,
      [paymentId, orderId, paypalOrderId],
    );
    return { orderId, paymentId };
  };

  const paymentRow = async (paymentId: string): Promise<PaymentRow> =>
    (
      await execute<PaymentRow[]>(
        `select status, checkout_session_id, transaction_id, completed_at,
           failure_reason, updated_at from payments where id = ?`,
        [paymentId],
      )
    )[0];

  const orderRow = async (orderId: string): Promise<OrderRow> =>
    (
      await execute<OrderRow[]>(
        'select status, updated_at from orders where id = ?',
        [orderId],
      )
    )[0];

  const webhookEvents = (eventId: string) =>
    execute<{ provider: string; status: string }[]>(
      'select provider, status from webhook_events where event_id = ?',
      [eventId],
    );

  const completedCapture = (captureId: string) => ({
    status: 201,
    body: {
      id: 'ignored',
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: captureId,
                status: 'COMPLETED',
                create_time: '2026-11-24T10:05:00Z',
              },
            ],
          },
        },
      ],
    },
  });

  const deliver = (event: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set(HEADERS)
      .send(JSON.stringify(event));

  const captureEvent = (
    type: string,
    paymentId: string,
    paypalOrderId: string,
    captureId = `CAPTURE-${suffix()}`,
  ) => ({
    id: `WH-${suffix()}`,
    event_type: type,
    resource: {
      id: captureId,
      status: type === 'PAYMENT.CAPTURE.COMPLETED' ? 'COMPLETED' : 'DECLINED',
      custom_id: paymentId,
      create_time: '2026-11-24T10:05:00Z',
      supplementary_data: { related_ids: { order_id: paypalOrderId } },
    },
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture, { rawBody: true });
    orm = app.get(MikroORM);
    userService = app.get(UserService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signIn(null);
    calls = [];
    orderAnswers = {};
    createHeaders = [];
    verification = 'SUCCESS';
    captureAnswer = completedCapture(`CAPTURE-${suffix()}`);
    const client = app.get(PayPalHttpClient);
    paypal = vi
      .spyOn(client, 'request')
      .mockImplementation(
        (
          method: string,
          path: string,
          options?: { headers?: Record<string, string> },
        ) => {
          calls.push({ method, path });
          if (method === 'POST' && path === '/v2/checkout/orders') {
            createHeaders.push(options?.headers);
          }
          const orderAnswer = method === 'GET' ? orderAnswers[path] : undefined;
          if (orderAnswer) return Promise.resolve(orderAnswer);
          if (path === '/v1/notifications/verify-webhook-signature') {
            return Promise.resolve({
              status: 200,
              body: { verification_status: verification },
            });
          }
          if (path.endsWith('/capture')) return Promise.resolve(captureAnswer);
          if (method === 'POST' && path === '/v2/checkout/orders') {
            const id = `PP-E2E-${suffix()}`;
            return Promise.resolve({
              status: 201,
              body: {
                id,
                status: 'CREATED',
                links: [
                  {
                    rel: 'approve',
                    href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
                  },
                ],
              },
            });
          }
          return Promise.resolve({ status: 404, body: {} });
        },
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a PAYPAL payment: 200 with the approval URL, payment PENDING (AC1)', async () => {
    const user = await createUser();
    const { orderId, paymentId } = await seedOrder(user.id);
    signIn(user.clerkId);

    const response = await request(app.getHttpServer())
      .post(`${ORDERS}/${orderId}/payments`)
      .expect(200);

    const data = (
      response.body as {
        data: { paymentId: string; checkoutId: string; checkoutUrl: string };
      }
    ).data;
    const row = await paymentRow(paymentId);
    expect(data.paymentId).toBe(paymentId);
    expect(data.checkoutId).toBe(row.checkout_session_id);
    expect(data.checkoutUrl).toBe(
      `https://www.sandbox.paypal.com/checkoutnow?token=${data.checkoutId}`,
    );
    expect(row.status).toBe('PENDING');
    const detail = await request(app.getHttpServer())
      .get(`${ORDERS}/${orderId}`)
      .expect(200);
    expect(
      (detail.body as { data: { paymentStatus: string } }).data.paymentStatus,
    ).toBe('PENDING');
  });

  it('captures an approved PayPal order: payment PAID with the capture id, order CONFIRMED (AC2)', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    captureAnswer = completedCapture('CAPTURE-AC2');
    signIn(user.clerkId);

    const response = await request(app.getHttpServer())
      .post(`${ORDERS}/${orderId}/payments/capture`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        paymentId,
        paymentStatus: 'PAID',
        failureReason: null,
        retryable: false,
      },
    });
    const row = await paymentRow(paymentId);
    expect(row.status).toBe('PAID');
    expect(row.transaction_id).toBe('CAPTURE-AC2');
    expect(new Date(row.completed_at as Date).toISOString()).toBe(
      '2026-11-24T10:05:00.000Z',
    );
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
    expect(calls).toContainEqual({
      method: 'POST',
      path: `/v2/checkout/orders/${paypalOrderId}/capture`,
    });
  });

  it('records a declined capture: payment FAILED with the reason, order PENDING (AC3)', async () => {
    const user = await createUser();
    const { orderId, paymentId } = await seedOrder(user.id, `PP-${suffix()}`);
    captureAnswer = {
      status: 422,
      body: {
        details: [
          {
            issue: 'INSTRUMENT_DECLINED',
            description: 'The instrument presented was declined.',
          },
        ],
      },
    };
    signIn(user.clerkId);

    const response = await request(app.getHttpServer())
      .post(`${ORDERS}/${orderId}/payments/capture`)
      .expect(200);

    expect(
      (response.body as { data: { paymentStatus: string; retryable: boolean } })
        .data,
    ).toMatchObject({ paymentStatus: 'FAILED', retryable: true });
    const row = await paymentRow(paymentId);
    expect(row.status).toBe('FAILED');
    expect(row.failure_reason).toBe('The instrument presented was declined.');
    expect((await orderRow(orderId)).status).toBe('PENDING');
  });

  it('refuses an event PayPal does not verify: 401, nothing changes (AC4)', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    verification = 'FAILURE';
    const event = captureEvent(
      'PAYMENT.CAPTURE.COMPLETED',
      paymentId,
      paypalOrderId,
    );

    await deliver(event).expect(401);

    expect((await paymentRow(paymentId)).status).toBe('PENDING');
    expect((await orderRow(orderId)).status).toBe('PENDING');
    expect(await webhookEvents(event.id)).toEqual([]);
  });

  it('PAYMENT.CAPTURE.COMPLETED sets PAID and confirms the order', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    const event = captureEvent(
      'PAYMENT.CAPTURE.COMPLETED',
      paymentId,
      paypalOrderId,
      'CAPTURE-HOOK',
    );

    await deliver(event).expect(200);

    const row = await paymentRow(paymentId);
    expect(row.status).toBe('PAID');
    expect(row.transaction_id).toBe('CAPTURE-HOOK');
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
    expect(await webhookEvents(event.id)).toEqual([
      { provider: 'PAYPAL', status: 'PROCESSED' },
    ]);
  });

  it('a COMPLETED event after the return capture changes nothing and is recorded IGNORED (AC5)', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    captureAnswer = completedCapture('CAPTURE-AC5');
    signIn(user.clerkId);
    await request(app.getHttpServer())
      .post(`${ORDERS}/${orderId}/payments/capture`)
      .expect(200);
    const paymentBefore = await paymentRow(paymentId);
    const orderBefore = await orderRow(orderId);
    const event = captureEvent(
      'PAYMENT.CAPTURE.COMPLETED',
      paymentId,
      paypalOrderId,
      'CAPTURE-AC5',
    );

    await deliver(event).expect(200);

    expect(await paymentRow(paymentId)).toEqual(paymentBefore);
    expect(await orderRow(orderId)).toEqual(orderBefore);
    expect(await webhookEvents(event.id)).toEqual([
      { provider: 'PAYPAL', status: 'IGNORED' },
    ]);
  });

  it('a repeated event id is skipped', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { paymentId } = await seedOrder(user.id, paypalOrderId);
    const event = captureEvent(
      'PAYMENT.CAPTURE.DENIED',
      paymentId,
      paypalOrderId,
    );

    await deliver(event).expect(200);
    const first = await paymentRow(paymentId);
    await deliver(event).expect(200);

    expect(first.status).toBe('FAILED');
    expect(await paymentRow(paymentId)).toEqual(first);
    expect(await webhookEvents(event.id)).toHaveLength(1);
  });

  it('CHECKOUT.ORDER.APPROVED captures the order', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    captureAnswer = completedCapture('CAPTURE-APPROVED');

    await deliver({
      id: `WH-${suffix()}`,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: paypalOrderId, status: 'APPROVED' },
    }).expect(200);

    expect(calls).toContainEqual({
      method: 'POST',
      path: `/v2/checkout/orders/${paypalOrderId}/capture`,
    });
    const row = await paymentRow(paymentId);
    expect(row.status).toBe('PAID');
    expect(row.transaction_id).toBe('CAPTURE-APPROVED');
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
  });

  it('an approved webhook after a PAID capture changes nothing', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    signIn(user.clerkId);
    await request(app.getHttpServer())
      .post(`${ORDERS}/${orderId}/payments/capture`)
      .expect(200);
    const before = await paymentRow(paymentId);
    calls = [];
    const eventId = `WH-${suffix()}`;

    await deliver({
      id: eventId,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: paypalOrderId, status: 'APPROVED' },
    }).expect(200);

    expect(calls.filter((call) => call.path.endsWith('/capture'))).toEqual([]);
    expect(await paymentRow(paymentId)).toEqual(before);
    expect(await webhookEvents(eventId)).toEqual([
      { provider: 'PAYPAL', status: 'IGNORED' },
    ]);
  });

  it('an event for an unknown payment is ignored', async () => {
    const event = captureEvent(
      'PAYMENT.CAPTURE.COMPLETED',
      randomUUID(),
      `PP-${suffix()}`,
    );

    await deliver(event).expect(200);
    await deliver({
      ...captureEvent('PAYMENT.CAPTURE.DENIED', 'not-a-uuid', 'PP-x'),
    }).expect(200);

    expect(await webhookEvents(event.id)).toEqual([
      { provider: 'PAYPAL', status: 'IGNORED' },
    ]);
    expect(paypal).toHaveBeenCalled();
  });

  it('an approved order PayPal no longer has is recorded IGNORED and stays unpaid', async () => {
    const user = await createUser();
    const paypalOrderId = `PP-${suffix()}`;
    const { orderId, paymentId } = await seedOrder(user.id, paypalOrderId);
    captureAnswer = { status: 404, body: { name: 'RESOURCE_NOT_FOUND' } };
    const eventId = `WH-${suffix()}`;

    await deliver({
      id: eventId,
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: paypalOrderId, status: 'APPROVED' },
    }).expect(200);

    expect((await paymentRow(paymentId)).status).toBe('PENDING');
    expect((await orderRow(orderId)).status).toBe('PENDING');
    expect(await webhookEvents(eventId)).toEqual([
      { provider: 'PAYPAL', status: 'IGNORED' },
    ]);
  });

  describe('retry', () => {
    const declinedOrder = (id: string) => ({
      status: 200,
      body: {
        id,
        status: 'COMPLETED',
        links: [],
        purchase_units: [
          { payments: { captures: [{ id: 'C1', status: 'DECLINED' }] } },
        ],
      },
    });

    const seedFailed = async (userId: string) => {
      const oldId = `PP-OLD-${suffix()}`;
      const seeded = await seedOrder(userId, oldId);
      await execute(
        `update payments set status = 'FAILED', failure_reason = 'Declined' where id = ?`,
        [seeded.paymentId],
      );
      orderAnswers[`/v2/checkout/orders/${oldId}`] = declinedOrder(oldId);
      return { ...seeded, oldId };
    };

    const start = (orderId: string) =>
      request(app.getHttpServer()).post(`${ORDERS}/${orderId}/payments`);

    it('retries a FAILED PayPal payment whose PayPal order closed with a new PayPal order on the same row (retry AC1)', async () => {
      const user = await createUser();
      const { orderId, paymentId, oldId } = await seedFailed(user.id);
      signIn(user.clerkId);

      const response = await start(orderId).expect(200);

      const { checkoutId } = (response.body as { data: { checkoutId: string } })
        .data;
      expect(checkoutId).toMatch(/^PP-E2E-/);
      expect(createHeaders).toEqual([
        { 'PayPal-Request-Id': `create-${paymentId}-after-${oldId}` },
      ]);
      const row = await paymentRow(paymentId);
      expect(row.status).toBe('FAILED');
      expect(row.checkout_session_id).toBe(checkoutId);
    });

    it('a retry of a PayPal order with no deadline sets one 24 h ahead', async () => {
      const user = await createUser();
      const { orderId } = await seedFailed(user.id);
      await execute('update orders set expires_at = null where id = ?', [
        orderId,
      ]);
      signIn(user.clerkId);

      await start(orderId).expect(200);

      const [{ expires_at }] = await execute<{ expires_at: Date }[]>(
        'select expires_at from orders where id = ?',
        [orderId],
      );
      const expected = Date.now() + 24 * 60 * 60 * 1000;
      expect(Math.abs(new Date(expires_at).getTime() - expected)).toBeLessThan(
        60_000,
      );
    });
  });
});
