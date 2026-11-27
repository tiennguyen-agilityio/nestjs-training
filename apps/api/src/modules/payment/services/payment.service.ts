import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  VALIDATION_RULES,
} from '@repo/constants';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { OrderRepository } from '../../order/repositories/order.repository.js';
import { PaymentGateways } from '../gateways/payment-gateways.js';
import type {
  CheckoutRequest,
  CheckoutSession,
  CaptureOutcome,
  GatewayEvent,
  PaymentGateway,
  RefundEvent,
  VerifiedWebhook,
} from '../gateways/payment-gateway.js';
import { ResponsePaymentCheckoutDto } from '../dto/response-payment-checkout.dto.js';
import { ResponsePaymentCaptureDto } from '../dto/response-payment-capture.dto.js';
import { paymentStatusOf } from '../../order/utils/payment-status.util.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import type { Payment } from '../../order/entities/payment.entity.js';
import { RefundService } from '../../order/services/refund.service.js';
import type { Order } from '../../order/entities/order.entity.js';
import type {
  PaymentCheckoutExpirePayload,
  PaymentRefundPayload,
} from '../../../common/interfaces/outbox-payload.interface.js';
import {
  InvalidRequestException,
  InvalidStateException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const MINUTE_MS = 60_000;
const MIN_SESSION_MS = 31 * MINUTE_MS;
const MAX_SESSION_MS = 24 * 60 * MINUTE_MS - MINUTE_MS;
const CURRENCY = 'usd';

const paymentIdSchema = z.uuid();

const centsOf = (amount: string): number => Math.round(Number(amount) * 100);

const toWholeSecond = (ms: number): Date =>
  new Date(Math.floor(ms / 1000) * 1000);

const isUnsent = (refund: Payment): boolean =>
  (refund.status as PaymentStatus) === PaymentStatus.PENDING &&
  !refund.transactionId;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly webAppUrl: string;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly gateways: PaymentGateways,
    private readonly refundService: RefundService,
    config: ConfigService,
  ) {
    this.webAppUrl = config
      .getOrThrow<string>('WEB_APP_URL')
      .replace(/\/+$/, '');
  }

  start(userId: string, orderId: string): Promise<ResponsePaymentCheckoutDto> {
    return this.paymentRepository.transactional(async () => {
      const charge = await this.paymentRepository.findNewestChargeOf(
        orderId,
        userId,
      );
      if (!charge) throw this.orderNotFound();
      const gateway = this.gatewayOf(charge);

      const payment = await this.paymentRepository.lockById(charge.id);
      const order = await this.orderRepository.reload(charge.order);
      if (!payment || !order) throw this.orderNotFound();
      if (
        (order.status as OrderStatus) !== OrderStatus.PENDING ||
        (payment.status as PaymentStatus) === PaymentStatus.PAID
      ) {
        throw this.notPayable();
      }
      if (this.isExpired(order)) throw this.orderExpired();
      if (payment.checkoutSessionId) {
        return this.reuseOrRetry(gateway, payment, order, userId);
      }

      const session = await gateway.createCheckout(
        this.checkoutRequestOf(payment, order, this.sessionExpiryOf(order)),
      );
      payment.checkoutSessionId = session.id;
      order.expiresAt = session.expiresAt;
      await this.paymentRepository.save(payment, userId);
      return ResponsePaymentCheckoutDto.fromEntity(payment, session);
    });
  }

  verify(
    method: PaymentMethod,
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): Promise<VerifiedWebhook> {
    const gateway = this.gateways.for(method);
    if (!gateway) {
      throw new Error(`No payment gateway is registered for ${method}`);
    }
    return gateway.parseWebhook(rawBody, headers);
  }

  apply(event: GatewayEvent | null, actorId: ActorId = null): Promise<boolean> {
    if (!event) return Promise.resolve(false);
    if (!paymentIdSchema.safeParse(event.paymentId).success) {
      this.logger.warn(`Ignored a ${event.kind} event for an unknown payment`);
      return Promise.resolve(false);
    }
    return this.orderRepository.transactionalWithOutbox(
      async (_enqueueCheckoutExpire, enqueueRefund) => {
        const payment = await this.paymentRepository.lockById(event.paymentId);
        if (!payment) {
          this.logger.warn(
            `Ignored a ${event.kind} event for unknown payment ${event.paymentId}`,
          );
          return false;
        }
        if ((payment.status as PaymentStatus) === PaymentStatus.PAID) {
          return false;
        }
        if (
          event.checkoutSessionId &&
          event.checkoutSessionId !== payment.checkoutSessionId
        ) {
          this.logger.warn(
            `Ignored a ${event.kind} event from session ${event.checkoutSessionId}, not the one of payment ${payment.id}`,
          );
          return false;
        }

        if (event.kind === 'pending') {
          if (
            (payment.status as PaymentStatus) === PaymentStatus.PENDING &&
            payment.transactionId === event.transactionId
          ) {
            return false;
          }
          const order = await this.orderRepository.findById(payment.order.id);
          if (!order || (order.status as OrderStatus) !== OrderStatus.PENDING) {
            this.logger.warn(
              `Payment ${payment.id} is held as ${event.transactionId} but its order is ${order?.status ?? 'missing'}`,
            );
            return false;
          }
          payment.status = PaymentStatus.PENDING;
          payment.failureReason = null;
          payment.transactionId = event.transactionId;
          order.expiresAt = null;
          await this.paymentRepository.save(payment, actorId);
          return true;
        }

        if (event.kind === 'failed') {
          if (
            (payment.status as PaymentStatus) === PaymentStatus.FAILED &&
            payment.failureReason === event.reason
          ) {
            return false;
          }
          payment.status = PaymentStatus.FAILED;
          payment.failureReason = event.reason;
          await this.paymentRepository.save(payment, actorId);
          return true;
        }

        payment.status = PaymentStatus.PAID;
        payment.transactionId = event.transactionId;
        payment.completedAt = event.paidAt;
        payment.failureReason = null;
        const order = await this.orderRepository.findById(payment.order.id);
        if (order && (order.status as OrderStatus) === OrderStatus.PENDING) {
          order.status = OrderStatus.CONFIRMED;
          order.expiresAt = null;
        } else {
          this.logger.warn(
            `Payment ${payment.id} was paid but its order is ${order?.status ?? 'missing'}`,
          );
        }
        await this.paymentRepository.save(payment, actorId);
        if (order && (order.status as OrderStatus) === OrderStatus.CANCELLED) {
          const locked = await this.orderRepository.lockForStatusChange({
            id: order.id,
          });
          if (locked) {
            await this.refundService.startLocked(
              locked,
              'rest',
              null,
              enqueueRefund,
            );
          }
        }
        return true;
      },
    );
  }

  /**
   * A provider refund event, in one transaction with the charge's order
   * locked: settles the shop's refund row, or records a dashboard refund.
   */
  private applyRefund(event: RefundEvent): Promise<boolean> {
    return this.orderRepository.transactionalWithOutbox(async () => {
      const charge = await this.paymentRepository.findByTransactionId(
        event.chargeTransactionId,
      );
      if (!charge || (charge.type as PaymentType) !== PaymentType.CHARGE) {
        this.logger.warn(
          `Ignored refund ${event.refundTransactionId} for unknown charge ${event.chargeTransactionId}`,
        );
        return false;
      }
      const order = await this.orderRepository.lockForPayment(charge.id);
      if (!order) return false;
      const refunds = order.payments
        .getItems()
        .filter(
          (payment) => (payment.type as PaymentType) === PaymentType.REFUND,
        );
      const row = refunds.find(
        (refund) =>
          refund.transactionId === event.refundTransactionId ||
          (event.refundId !== null && refund.id === event.refundId),
      );
      if (row) {
        if (
          Math.round(Number(row.amount) * 100) !== event.amountCents ||
          row.currency.toLowerCase() !== event.currency.toLowerCase()
        ) {
          this.logger.warn(
            `Ignored refund ${event.refundTransactionId}: amount or currency differs from payment ${row.id}`,
          );
          return false;
        }
        return this.settleRefund(row, event);
      }
      if (event.refundId !== null) {
        this.logger.warn(
          `Ignored refund ${event.refundTransactionId} for missing payment ${event.refundId}`,
        );
        return false;
      }
      const used = refunds
        .filter((refund) =>
          [PaymentStatus.PENDING, PaymentStatus.PAID].includes(
            refund.status as PaymentStatus,
          ),
        )
        .reduce(
          (total, refund) => total + Math.round(Number(refund.amount) * 100),
          0,
        );
      if (
        (charge.status as PaymentStatus) !== PaymentStatus.PAID ||
        used + event.amountCents > Math.round(Number(charge.amount) * 100)
      ) {
        this.logger.warn(
          `Ignored refund ${event.refundTransactionId}: it exceeds what charge ${charge.id} can still refund`,
        );
        return false;
      }
      const created = await this.orderRepository.addRefund(
        order,
        {
          method: charge.method,
          amount: (event.amountCents / 100).toFixed(2),
          currency: charge.currency,
        },
        null,
      );
      await this.settleRefund(created, event);
      return true;
    });
  }

  private async settleRefund(
    refund: Payment,
    event: RefundEvent,
  ): Promise<boolean> {
    const status = refund.status as PaymentStatus;
    if (event.status === 'pending') {
      if (status !== PaymentStatus.PENDING || refund.transactionId) {
        return false;
      }
      refund.transactionId = event.refundTransactionId;
    } else if (event.status === 'succeeded') {
      if (status === PaymentStatus.PAID) return false;
      refund.status = PaymentStatus.PAID;
      refund.transactionId = event.refundTransactionId;
      refund.completedAt = event.at;
      refund.failureReason = null;
    } else {
      if (status === PaymentStatus.FAILED) return false;
      refund.status = PaymentStatus.FAILED;
      refund.transactionId = event.refundTransactionId;
      refund.failureReason = event.reason;
    }
    await this.paymentRepository.save(refund, null);
    return true;
  }

  /**
   * The outbox's `payment.checkout-expire`: closes the cancelled order's
   * checkout session. A rejection is a failed attempt the relay retries.
   */
  async expireCheckout({
    paymentId,
    method,
    checkoutSessionId,
  }: PaymentCheckoutExpirePayload): Promise<void> {
    const gateway = this.gateways.for(method);
    if (!gateway) {
      this.logger.warn(
        `Checkout session ${checkoutSessionId} of payment ${paymentId} not expired: no ${method} gateway`,
      );
      return;
    }
    await gateway.expireCheckout(checkoutSessionId);
  }

  /**
   * The outbox's `payment.refund`: sends a PENDING refund to the provider and
   * saves the answer. A rejection is a failed attempt the relay retries.
   */
  processRefund({ paymentId }: PaymentRefundPayload): Promise<void> {
    return this.paymentRepository.withOwnContext(async () => {
      const found =
        await this.paymentRepository.findRefundWithCharge(paymentId);
      if (!found || !isUnsent(found.refund)) return;
      const { refund, charge } = found;
      const gateway = this.gateways.for(refund.method);
      if (!gateway || !charge?.transactionId) {
        this.logger.warn(
          `Refund ${refund.id} not sent: no ${refund.method} gateway or charge reference`,
        );
        await this.failUnsent(
          refund.id,
          ERROR_MESSAGES.PAYMENT.REFUND_UNSENDABLE(refund.method),
        );
        return;
      }
      const outcome = await gateway.refund({
        refundId: refund.id,
        chargeTransactionId: charge.transactionId,
        amountCents: Math.round(Number(refund.amount) * 100),
        currency: 'usd',
      });
      await this.paymentRepository.transactional(async () => {
        const locked = await this.paymentRepository.lockById(refund.id);
        if (!locked || !isUnsent(locked)) return;
        locked.transactionId = outcome.refundTransactionId;
        if (outcome.kind === 'succeeded') {
          locked.status = PaymentStatus.PAID;
          locked.completedAt = outcome.refundedAt;
        } else if (outcome.kind === 'failed') {
          locked.status = PaymentStatus.FAILED;
          locked.failureReason = outcome.reason;
        }
        await this.paymentRepository.save(locked, null);
      });
    });
  }

  /** A refund the outbox gave up on: FAILED, unless the provider answered meanwhile. */
  failRefund(paymentId: string, reason: string): Promise<void> {
    return this.paymentRepository.withOwnContext(() =>
      this.failUnsent(paymentId, reason),
    );
  }

  private failUnsent(paymentId: string, reason: string): Promise<void> {
    return this.paymentRepository.transactional(async () => {
      const refund = await this.paymentRepository.lockById(paymentId);
      if (
        !refund ||
        (refund.type as PaymentType) !== PaymentType.REFUND ||
        !isUnsent(refund)
      ) {
        return;
      }
      refund.status = PaymentStatus.FAILED;
      refund.failureReason = reason;
      await this.paymentRepository.save(refund, null);
    });
  }

  /** Captures the shopper's approved PayPal order when they return to Order success. */
  async capture(
    userId: string,
    orderId: string,
  ): Promise<ResponsePaymentCaptureDto> {
    const charge = await this.paymentRepository.findNewestChargeOf(
      orderId,
      userId,
    );
    if (!charge) throw this.orderNotFound();
    const gateway = this.gatewayOf(charge);
    if ((charge.status as PaymentStatus) === PaymentStatus.PAID) {
      return this.captured(charge, false);
    }
    const order = charge.order;
    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw this.notPayable();
    }
    if (this.isExpired(order)) throw this.orderExpired();
    if (!charge.checkoutSessionId) throw this.notPayable();

    // PayPal is called outside any transaction; its answer is applied in one.
    const outcome = await gateway.capture(charge.checkoutSessionId);
    if (!outcome) {
      throw this.invalid(
        ERROR_CODES.PAYMENT.CAPTURE_UNSUPPORTED,
        ERROR_MESSAGES.PAYMENT.CAPTURE_UNSUPPORTED,
        ERROR_DESCRIPTIONS.PAYMENT.CAPTURE_UNSUPPORTED,
      );
    }
    if (outcome.kind === 'not_approved') throw this.notPayable();
    await this.apply(this.eventOf(charge, outcome), userId);
    return this.captured(
      charge,
      outcome.kind === 'failed' && outcome.retryable,
    );
  }

  /** Routes a verified webhook event: approved checkouts are captured first. */
  handle(event: VerifiedWebhook['event']): Promise<boolean> {
    if (event?.kind === 'refund') return this.applyRefund(event);
    if (event?.kind === 'approved') {
      return this.captureApproved(event.checkoutSessionId);
    }
    return this.apply(event);
  }

  /** A checkout the payer approved but nobody captured (the browser never came back). */
  private async captureApproved(checkoutSessionId: string): Promise<boolean> {
    const payment =
      await this.paymentRepository.findByCheckoutSessionId(checkoutSessionId);
    if (!payment) {
      this.logger.warn(
        `Ignored an approved checkout ${checkoutSessionId} with no payment`,
      );
      return false;
    }
    const order = payment.order;
    if (
      (payment.status as PaymentStatus) === PaymentStatus.PAID ||
      (order.status as OrderStatus) !== OrderStatus.PENDING ||
      this.isExpired(order)
    ) {
      return false;
    }
    const gateway = this.gateways.for(payment.method);
    let outcome: CaptureOutcome | null = null;
    try {
      outcome = gateway ? await gateway.capture(checkoutSessionId) : null;
    } catch (error) {
      // A refusal is final: the event is recorded IGNORED. If another capture
      // did land, PayPal's PAYMENT.CAPTURE.COMPLETED records it. An outage
      // (503) propagates, so PayPal sends this event again.
      if (error instanceof InvalidRequestException) {
        this.logger.warn(`PayPal refused to capture ${checkoutSessionId}`);
        return false;
      }
      throw error;
    }
    if (!outcome || outcome.kind === 'not_approved') return false;
    return this.apply(this.eventOf(payment, outcome), null);
  }

  private eventOf(
    payment: Payment,
    outcome: Exclude<CaptureOutcome, { kind: 'not_approved' }>,
  ): GatewayEvent {
    const base = {
      paymentId: payment.id,
      checkoutSessionId: payment.checkoutSessionId ?? undefined,
    };
    switch (outcome.kind) {
      case 'succeeded':
        return {
          kind: 'succeeded',
          ...base,
          transactionId: outcome.transactionId,
          paidAt: outcome.paidAt,
        };
      case 'failed':
        return { kind: 'failed', ...base, reason: outcome.reason };
      case 'pending':
        return {
          kind: 'pending',
          ...base,
          transactionId: outcome.transactionId,
        };
    }
  }

  private captured(
    payment: Payment,
    retryable: boolean,
  ): ResponsePaymentCaptureDto {
    const status: OrderPaymentStatus = paymentStatusOf([payment]);
    return ResponsePaymentCaptureDto.fromEntity(payment, status, retryable);
  }

  private gatewayOf(charge: Payment): PaymentGateway {
    if (charge.method === PaymentMethod.COD) {
      throw this.invalid(
        ERROR_CODES.PAYMENT.METHOD_NOT_ONLINE,
        ERROR_MESSAGES.PAYMENT.METHOD_NOT_ONLINE,
        ERROR_DESCRIPTIONS.PAYMENT.METHOD_NOT_ONLINE,
      );
    }
    const gateway = this.gateways.for(charge.method);
    if (!gateway) {
      throw this.invalid(
        ERROR_CODES.PAYMENT.METHOD_UNAVAILABLE,
        ERROR_MESSAGES.PAYMENT.METHOD_UNAVAILABLE,
        ERROR_DESCRIPTIONS.PAYMENT.METHOD_UNAVAILABLE,
      );
    }
    return gateway;
  }

  private isExpired(order: Order): boolean {
    return Boolean(order.expiresAt && order.expiresAt.getTime() <= Date.now());
  }

  private orderExpired(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.PAYMENT.ORDER_EXPIRED,
      field: 'id',
      message: ERROR_MESSAGES.PAYMENT.ORDER_EXPIRED,
      description: ERROR_DESCRIPTIONS.PAYMENT.ORDER_EXPIRED,
    });
  }

  /**
   * A payment with a checkout: the open one is returned again; a FAILED
   * payment whose checkout ended unpaid (or is unknown to the gateway) is
   * retried; anything else may still hold money and is not payable.
   */
  private async reuseOrRetry(
    gateway: PaymentGateway,
    payment: Payment,
    order: Order,
    userId: string,
  ): Promise<ResponsePaymentCheckoutDto> {
    const replaced = payment.checkoutSessionId as string;
    const session: CheckoutSession | null =
      await gateway.findCheckout(replaced);
    if (session?.open) {
      // The order's expiry is the checkout's: a PayPal order carries none.
      return ResponsePaymentCheckoutDto.fromEntity(payment, {
        ...session,
        expiresAt: order.expiresAt ?? session.expiresAt,
      });
    }
    if (
      (payment.status as PaymentStatus) !== PaymentStatus.FAILED ||
      (session && !session.endedUnpaid)
    ) {
      throw this.notPayable();
    }
    return this.retry(gateway, payment, order, userId, replaced);
  }

  /**
   * A new attempt on the same payment row. The order's deadline never moves;
   * an order with none (a held PayPal capture that was denied) gets a new one.
   */
  private async retry(
    gateway: PaymentGateway,
    payment: Payment,
    order: Order,
    userId: string,
    replacesCheckoutId: string,
  ): Promise<ResponsePaymentCheckoutDto> {
    const deadline =
      order.expiresAt ??
      toWholeSecond(
        Date.now() + VALIDATION_RULES.ORDER.PAYMENT_EXPIRY_MINUTES * MINUTE_MS,
      );
    // Stripe cannot open a session that ends sooner than this.
    if (
      payment.method === PaymentMethod.CARD &&
      deadline.getTime() - Date.now() < MIN_SESSION_MS
    ) {
      throw this.notPayable();
    }
    const session = await gateway.createCheckout(
      this.checkoutRequestOf(
        payment,
        order,
        toWholeSecond(deadline.getTime()),
        replacesCheckoutId,
      ),
    );
    order.expiresAt = deadline;
    payment.checkoutSessionId = session.id;
    await this.paymentRepository.save(payment, userId);
    return ResponsePaymentCheckoutDto.fromEntity(payment, {
      ...session,
      expiresAt: deadline,
    });
  }

  private checkoutRequestOf(
    payment: Payment,
    order: Order,
    expiresAt: Date,
    replacesCheckoutId: string | null = null,
  ): CheckoutRequest {
    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountCents: centsOf(order.totalAmount),
      currency: CURRENCY,
      customerEmail: order.user.email,
      expiresAt,
      successUrl: `${this.successUrlOf(order)}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: this.successUrlOf(order),
      replacesCheckoutId,
    };
  }

  private sessionExpiryOf(order: Order): Date {
    const latest = order.createdAt.getTime() + MAX_SESSION_MS;
    const wanted = Math.min(order.expiresAt?.getTime() ?? latest, latest);
    return toWholeSecond(Math.max(wanted, Date.now() + MIN_SESSION_MS));
  }

  private successUrlOf(order: Order): string {
    return `${this.webAppUrl}/order-success?orderId=${order.id}`;
  }

  private orderNotFound(): ItemNotFoundException {
    return new ItemNotFoundException({
      errCode: ERROR_CODES.ORDER.NOT_FOUND,
      field: 'id',
      message: ERROR_MESSAGES.ORDER.NOT_FOUND,
      description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
    });
  }

  private notPayable(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.PAYMENT.NOT_PAYABLE,
      field: 'id',
      message: ERROR_MESSAGES.PAYMENT.NOT_PAYABLE,
      description: ERROR_DESCRIPTIONS.PAYMENT.NOT_PAYABLE,
    });
  }

  private invalid(
    errCode: string,
    message: string,
    description: string,
  ): ValidationException {
    return new ValidationException([
      { errCode, field: 'paymentMethod', message, description },
    ]);
  }
}
