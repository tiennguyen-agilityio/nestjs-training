import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import type Stripe from 'stripe';
import { UserRole } from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { STRIPE_CLIENT } from './../../src/modules/payment/gateways/stripe-client.provider.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';

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
  expires_at: Date | null;
  updated_at: Date;
}

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let stripe: Stripe;
  let create: Mock;
  let retrieve: Mock;
  let webhookSecret: string;

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
      const clerkId = `clerk-pay-${suffix()}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Pay',
        lastName: 'Shopper',
        role: UserRole.USER,
      });
      return { id: user.id, clerkId };
    });

  const seedOrder = async (
    userId: string,
    {
      method = 'CARD',
      sessionId = null,
    }: { method?: string; sessionId?: string | null } = {},
  ): Promise<{ orderId: string; paymentId: string }> => {
    const methodId = randomUUID();
    const orderId = randomUUID();
    const paymentId = randomUUID();
    const tag = suffix();
    await execute(
      `insert into shipping_methods (id, name, description, price, status, created_at, updated_at)
       values (?, ?, 'A method', 12, 'ACTIVE', now(), now())`,
      [methodId, `Payment Method ${tag}`],
    );
    await execute(
      `insert into orders (id, user_id, shipping_method_id, order_number,
         recipient_name, recipient_phone, address_line, ward, district, city,
         postal_code, shipping_method_name, shipping_fee, tax, total_amount,
         expires_at, created_at, updated_at)
       values (?, ?, ?, ?, 'Lan Nguyen', '0901234567', '12 Le Loi', 'Ben Nghe',
         'District 1', 'Ho Chi Minh City', '700000', 'Roast Express', 12, 2, 34,
         ?, now(), now())`,
      [
        orderId,
        userId,
        methodId,
        `ORD-${tag}`.slice(0, 20),
        method === 'COD' ? null : ORDER_EXPIRES_AT,
      ],
    );
    await execute(
      `insert into payments (id, order_id, type, method, status, amount,
         checkout_session_id, created_at, updated_at)
       values (?, ?, 'CHARGE', ?, 'PENDING', 34, ?, now(), now())`,
      [paymentId, orderId, method, sessionId],
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
        'select status, expires_at, updated_at from orders where id = ?',
        [orderId],
      )
    )[0];

  const start = (orderId: string) =>
    request(app.getHttpServer()).post(`${ORDERS}/${orderId}/payments`);

  const stripeEvent = (type: string, object: Record<string, unknown>) =>
    JSON.stringify({
      id: `evt_${suffix()}`,
      object: 'event',
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object },
    });

  const deliver = (
    payload: string,
    secret = webhookSecret,
    path = '/webhooks/stripe',
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .set(
        'stripe-signature',
        stripe.webhooks.generateTestHeaderString({ payload, secret }),
      )
      .send(payload);

  const completed = (
    paymentId: string,
    transactionId: string,
    sessionId: string,
  ) =>
    stripeEvent('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: transactionId,
      metadata: { paymentId },
    });

  const fakeSession = (id: string, expiresAt: number) =>
    ({
      id,
      url: `https://checkout.stripe.com/c/pay/${id}`,
      status: 'open',
      expires_at: expiresAt,
    }) as Stripe.Checkout.Session;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture, { rawBody: true });
    orm = app.get(MikroORM);
    userService = app.get(UserService);
    stripe = app.get<Stripe>(STRIPE_CLIENT);
    webhookSecret = app
      .get(ConfigService)
      .getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signIn(null);
    create = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockImplementation(((params: { expires_at: number }) => {
        return Promise.resolve(
          fakeSession(`cs_test_e2e_${suffix()}`, params.expires_at),
        );
      }) as never);
    retrieve = vi
      .spyOn(stripe.checkout.sessions, 'retrieve')
      .mockImplementation(((id: string) =>
        Promise.resolve(
          fakeSession(id, Math.floor(ORDER_EXPIRES_AT.getTime() / 1000)),
        )) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /orders/:id/payments', () => {
    it('POST /orders/:id/payments returns the checkout URL and the payment becomes PENDING (AC1)', async () => {
      const user = await createUser();
      const { orderId, paymentId } = await seedOrder(user.id);
      expect((await paymentRow(paymentId)).checkout_session_id).toBeNull();
      signIn(user.clerkId);

      const response = await start(orderId).expect(200);

      const data = (
        response.body as {
          data: { paymentId: string; checkoutUrl: string; expiresAt: string };
        }
      ).data;
      const row = await paymentRow(paymentId);
      expect(data.paymentId).toBe(paymentId);
      expect(data.checkoutUrl).toBe(
        `https://checkout.stripe.com/c/pay/${row.checkout_session_id}`,
      );
      expect(row.checkout_session_id).toMatch(/^cs_test_e2e_/);
      expect(row.status).toBe('PENDING');
      expect(
        new Date((await orderRow(orderId)).expires_at as Date).toISOString(),
      ).toBe(new Date(data.expiresAt).toISOString());
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('POST /orders/:id/payments by another user returns 404 (AC2)', async () => {
      const owner = await createUser();
      const other = await createUser();
      const { orderId, paymentId } = await seedOrder(owner.id);
      signIn(other.clerkId);

      await start(orderId).expect(404);

      expect((await paymentRow(paymentId)).checkout_session_id).toBeNull();
      expect(create).not.toHaveBeenCalled();
    });

    it('POST /orders/:id/payments for a COD order returns 400 and the payment is unchanged (AC3)', async () => {
      const user = await createUser();
      const { orderId, paymentId } = await seedOrder(user.id, {
        method: 'COD',
      });
      const before = await paymentRow(paymentId);
      signIn(user.clerkId);

      const response = await start(orderId).expect(400);

      expect(
        (response.body as { errors: { errCode: string }[] }).errors[0].errCode,
      ).toBe(ERROR_CODES.PAYMENT.METHOD_NOT_ONLINE);
      expect(await paymentRow(paymentId)).toEqual(before);
      expect(create).not.toHaveBeenCalled();
    });

    it('two concurrent starts create one session', async () => {
      const user = await createUser();
      const { orderId } = await seedOrder(user.id);
      signIn(user.clerkId);
      create.mockImplementation(
        ((params: { expires_at: number }) =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(
                  fakeSession(`cs_test_e2e_${suffix()}`, params.expires_at),
                ),
              150,
            ),
          )) as never,
      );

      const [first, second] = await Promise.all([
        start(orderId),
        start(orderId),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const urlOf = (response: { body: unknown }) =>
        (response.body as { data: { checkoutUrl: string } }).data.checkoutUrl;
      expect(urlOf(first)).toBe(urlOf(second));
      expect(create).toHaveBeenCalledTimes(1);
      expect(retrieve).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /orders/:id/payments retry', () => {
    const OLD_SESSION = 'cs_test_old';

    const seedFailed = async (
      userId: string,
      status = 'FAILED',
    ): Promise<{ orderId: string; paymentId: string }> => {
      const seeded = await seedOrder(userId);
      await execute(
        `update payments set status = ?, failure_reason = 'Card declined',
           checkout_session_id = ? where id = ?`,
        [status, `${OLD_SESSION}_${suffix()}`, seeded.paymentId],
      );
      return seeded;
    };

    const closedAs = (status: 'expired' | 'complete') =>
      retrieve.mockImplementation(((id: string) =>
        Promise.resolve({
          ...fakeSession(id, Math.floor(ORDER_EXPIRES_AT.getTime() / 1000)),
          status,
        })) as never);

    const errCodeOf = (response: { body: unknown }) =>
      (response.body as { errors: { errCode: string }[] }).errors[0].errCode;

    it('retries a FAILED card payment whose session expired on the same payment row (retry AC1)', async () => {
      const user = await createUser();
      const { orderId, paymentId } = await seedFailed(user.id);
      const before = await paymentRow(paymentId);
      const orderBefore = await orderRow(orderId);
      closedAs('expired');
      signIn(user.clerkId);

      await start(orderId).expect(200);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][1]).toEqual({
        idempotencyKey: `checkout-${paymentId}-after-${before.checkout_session_id}`,
      });
      const row = await paymentRow(paymentId);
      expect(row.checkout_session_id).toMatch(/^cs_test_e2e_/);
      expect(row.status).toBe('FAILED');
      expect(row.failure_reason).toBe('Card declined');
      const [{ count }] = await execute<{ count: string }[]>(
        'select count(*) from payments where order_id = ?',
        [orderId],
      );
      expect(Number(count)).toBe(1);
      expect(
        new Date((await orderRow(orderId)).expires_at as Date).toISOString(),
      ).toBe(new Date(orderBefore.expires_at as Date).toISOString());
    });

    it('a FAILED card payment whose session is complete returns 409 and creates no session', async () => {
      const user = await createUser();
      const { orderId, paymentId } = await seedFailed(user.id);
      const before = await paymentRow(paymentId);
      closedAs('complete');
      signIn(user.clerkId);

      const response = await start(orderId).expect(409);

      expect(errCodeOf(response)).toBe(ERROR_CODES.PAYMENT.NOT_PAYABLE);
      expect(create).not.toHaveBeenCalled();
      expect(await paymentRow(paymentId)).toEqual(before);
    });

    it('POST /orders/:id/payments for a PAID payment returns 409 and creates no session (retry AC2)', async () => {
      const user = await createUser();
      const { orderId } = await seedFailed(user.id, 'PAID');
      signIn(user.clerkId);

      const response = await start(orderId).expect(409);

      expect(errCodeOf(response)).toBe(ERROR_CODES.PAYMENT.NOT_PAYABLE);
      expect(create).not.toHaveBeenCalled();
    });

    it('POST /orders/:id/payments retry by another user returns 404 (retry AC3)', async () => {
      const owner = await createUser();
      const other = await createUser();
      const { orderId, paymentId } = await seedFailed(owner.id);
      const before = await paymentRow(paymentId);
      closedAs('expired');
      signIn(other.clerkId);

      const response = await start(orderId).expect(404);

      expect(errCodeOf(response)).toBe(ERROR_CODES.ORDER.NOT_FOUND);
      expect(create).not.toHaveBeenCalled();
      expect(await paymentRow(paymentId)).toEqual(before);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('cancelling a card order with a checkout session expires the session through the outbox', async () => {
      const user = await createUser();
      const sessionId = `cs_test_e2e_${suffix()}`;
      const { orderId, paymentId } = await seedOrder(user.id, { sessionId });
      const expire = vi
        .spyOn(stripe.checkout.sessions, 'expire')
        .mockImplementation(((id: string) =>
          Promise.resolve({
            ...fakeSession(id, Math.floor(ORDER_EXPIRES_AT.getTime() / 1000)),
            status: 'expired',
          })) as never);
      signIn(user.clerkId);

      await request(app.getHttpServer())
        .post(`${ORDERS}/${orderId}/cancel`)
        .expect(200);

      const row = await paymentRow(paymentId);
      expect(row.status).toBe('FAILED');
      expect(row.failure_reason).toBe('Cancelled');
      await vi.waitFor(() => expect(expire).toHaveBeenCalledWith(sessionId), {
        timeout: 10_000,
      });
    });
  });

  describe('POST /webhooks/stripe', () => {
    it('POST /webhooks/stripe completed marks the payment PAID and the order CONFIRMED (AC4)', async () => {
      const user = await createUser();
      const sessionId = `cs_test_e2e_${suffix()}`;
      const { orderId, paymentId } = await seedOrder(user.id, { sessionId });
      const transactionId = `pi_e2e_${suffix()}`;

      await deliver(completed(paymentId, transactionId, sessionId)).expect(
        200,
        {
          data: { received: true },
        },
      );

      const row = await paymentRow(paymentId);
      expect(row).toMatchObject({
        status: 'PAID',
        transaction_id: transactionId,
        failure_reason: null,
      });
      expect(row.completed_at).not.toBeNull();
      expect(await orderRow(orderId)).toMatchObject({
        status: 'CONFIRMED',
        expires_at: null,
      });
    });

    it('POST /webhooks/stripe decline and expiry mark the payment FAILED and the order stays PENDING (AC5)', async () => {
      const user = await createUser();
      const declined = await seedOrder(user.id, {
        sessionId: `cs_test_e2e_${suffix()}`,
      });
      const expiredSessionId = `cs_test_e2e_${suffix()}`;
      const expired = await seedOrder(user.id, {
        sessionId: expiredSessionId,
      });

      await deliver(
        stripeEvent('payment_intent.payment_failed', {
          object: 'payment_intent',
          metadata: { paymentId: declined.paymentId },
          last_payment_error: { message: 'Your card was declined.' },
        }),
      ).expect(200);
      await deliver(
        stripeEvent('checkout.session.expired', {
          id: expiredSessionId,
          object: 'checkout.session',
          metadata: { paymentId: expired.paymentId },
        }),
      ).expect(200);

      expect(await paymentRow(declined.paymentId)).toMatchObject({
        status: 'FAILED',
        failure_reason: 'Your card was declined.',
      });
      expect(await paymentRow(expired.paymentId)).toMatchObject({
        status: 'FAILED',
        failure_reason: 'Checkout session expired',
      });
      expect((await orderRow(declined.orderId)).status).toBe('PENDING');
      expect((await orderRow(expired.orderId)).status).toBe('PENDING');
    });

    it('POST /webhooks/stripe with a bad signature returns 401 and changes nothing (AC6)', async () => {
      const user = await createUser();
      const sessionId = `cs_test_e2e_${suffix()}`;
      const { orderId, paymentId } = await seedOrder(user.id, { sessionId });
      const payload = completed(paymentId, `pi_e2e_${suffix()}`, sessionId);
      const before = await paymentRow(paymentId);

      await deliver(payload, 'whsec_forged').expect(401);
      await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(401);

      expect(await paymentRow(paymentId)).toEqual(before);
      expect((await orderRow(orderId)).status).toBe('PENDING');
    });

    it('POST /webhooks/stripe repeated success event changes nothing (AC7)', async () => {
      const user = await createUser();
      const sessionId = `cs_test_e2e_${suffix()}`;
      const { orderId, paymentId } = await seedOrder(user.id, { sessionId });
      const payload = completed(paymentId, `pi_e2e_${suffix()}`, sessionId);

      await deliver(payload).expect(200);
      const paidPayment = await paymentRow(paymentId);
      const confirmedOrder = await orderRow(orderId);
      await deliver(payload).expect(200);
      const resent = completed(paymentId, `pi_e2e_${suffix()}`, sessionId);
      await deliver(resent).expect(200);

      expect(await paymentRow(paymentId)).toEqual(paidPayment);
      expect(await orderRow(orderId)).toEqual(confirmedOrder);
      expect(paidPayment.status).toBe('PAID');
      expect(confirmedOrder.status).toBe('CONFIRMED');
      expect(
        await execute('select status from webhook_events where event_id = ?', [
          (JSON.parse(resent) as { id: string }).id,
        ]),
      ).toEqual([{ status: 'IGNORED' }]);
    });

    it('POST /webhooks/stripe ignores an event from another checkout session', async () => {
      const user = await createUser();
      const { orderId, paymentId } = await seedOrder(user.id, {
        sessionId: `cs_test_e2e_${suffix()}`,
      });
      const payload = completed(
        paymentId,
        `pi_e2e_${suffix()}`,
        `cs_test_stray_${suffix()}`,
      );

      await deliver(payload).expect(200);

      expect((await paymentRow(paymentId)).status).toBe('PENDING');
      expect((await orderRow(orderId)).status).toBe('PENDING');
      expect(
        await execute('select status from webhook_events where event_id = ?', [
          (JSON.parse(payload) as { id: string }).id,
        ]),
      ).toEqual([{ status: 'IGNORED' }]);
    });

    it('POST /webhooks/stripe needs no sign-in and sits outside the api prefix', async () => {
      signIn(null);
      const payload = stripeEvent('customer.created', { object: 'customer' });

      await deliver(payload).expect(200, { data: { received: true } });
      await deliver(
        payload,
        webhookSecret,
        `${API_BASE_PATH}/webhooks/stripe`,
      ).expect(404);
    });

    it('POST /webhooks/stripe processes one event id once', async () => {
      const user = await createUser();
      const { paymentId } = await seedOrder(user.id, {
        sessionId: `cs_test_e2e_${suffix()}`,
      });
      const eventId = `evt_once_${suffix()}`;
      const declined = (message: string) =>
        JSON.stringify({
          id: eventId,
          object: 'event',
          type: 'payment_intent.payment_failed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              object: 'payment_intent',
              metadata: { paymentId },
              last_payment_error: { message },
            },
          },
        });

      await deliver(declined('A')).expect(200);
      await deliver(declined('B')).expect(200);

      expect((await paymentRow(paymentId)).failure_reason).toBe('A');
      expect(
        await execute(
          'select provider, type, status from webhook_events where event_id = ?',
          [eventId],
        ),
      ).toEqual([
        {
          provider: 'STRIPE',
          type: 'payment_intent.payment_failed',
          status: 'PROCESSED',
        },
      ]);
    });

    it('POST /webhooks/stripe records an unhandled event as IGNORED', async () => {
      const payload = stripeEvent('customer.created', { object: 'customer' });
      const eventId = (JSON.parse(payload) as { id: string }).id;

      await deliver(payload).expect(200);

      expect(
        await execute(
          'select provider, status from webhook_events where event_id = ?',
          [eventId],
        ),
      ).toEqual([{ provider: 'STRIPE', status: 'IGNORED' }]);
    });
  });
});
