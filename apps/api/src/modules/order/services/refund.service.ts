import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
import {
  OrderRepository,
  type EnqueueRefund,
} from '../repositories/order.repository.js';
import type { Order } from '../entities/order.entity.js';
import type { Payment } from '../entities/payment.entity.js';
import { hasRefundLine, refundableCentsOf } from '../utils/refund-rule.util.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import {
  InvalidStateException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const ONLINE_METHODS = new Set<string>([
  PaymentMethod.CARD,
  PaymentMethod.PAYPAL,
]);
const HOLDING_REFUND = new Set<string>([
  PaymentStatus.PENDING,
  PaymentStatus.PAID,
]);

const centsOf = (amount: string | number): number =>
  Math.round(Number(amount) * 100);

const money = (cents: number): string => (cents / 100).toFixed(2);

const paidOnlineChargeOf = (order: Order): Payment | undefined =>
  order.payments
    .getItems()
    .find(
      (payment) =>
        (payment.type as PaymentType) === PaymentType.CHARGE &&
        (payment.status as PaymentStatus) === PaymentStatus.PAID &&
        ONLINE_METHODS.has(payment.method),
    );

/** Starts refunds of an order the caller has locked, inside its transaction. */
@Injectable()
export class RefundService {
  constructor(private readonly orderRepository: OrderRepository) {}

  /**
   * `'rest'` refunds a cancelled order's paid online charge in full with no
   * reason (a shopper cancel, a late payment), or returns null when nothing
   * is refundable. An amount is the admin's refund: only of a CANCELLED order
   * with no refund line, at most what was paid, and with a reason when less.
   */
  async startLocked(
    order: Order,
    amount: number | 'rest',
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
    reason?: string | null,
  ): Promise<Payment | null> {
    const payments = order.payments.getItems();
    const charge = paidOnlineChargeOf(order);

    if (amount === 'rest') {
      const cents = refundableCentsOf({ status: order.status, payments });
      if (!charge || cents === 0) return null;
      return this.create(order, charge, cents, null, actorId, enqueueRefund);
    }
    if (!charge) throw this.notRefundable();
    if ((order.status as OrderStatus) !== OrderStatus.CANCELLED) {
      throw this.needsCancelled();
    }
    if (hasRefundLine({ payments })) throw this.alreadyRefunded();
    const cents = centsOf(amount);
    const paid = centsOf(charge.amount);
    if (cents > paid) throw this.exceedsPaid(paid);
    const refundReason = reason?.trim() || null;
    if (cents < paid && !refundReason) throw this.reasonRequired();
    return this.create(
      order,
      charge,
      cents,
      refundReason,
      actorId,
      enqueueRefund,
    );
  }

  /** Sends a FAILED refund of a cancelled order again, with its amount and reason. */
  async retryLocked(
    order: Order,
    paymentId: string,
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
  ): Promise<Payment> {
    const payments = order.payments.getItems();
    const failed = payments.find((payment) => payment.id === paymentId);
    if (
      !failed ||
      (failed.type as PaymentType) !== PaymentType.REFUND ||
      (failed.status as PaymentStatus) !== PaymentStatus.FAILED ||
      failed.retriedAt ||
      (order.status as OrderStatus) !== OrderStatus.CANCELLED
    ) {
      throw this.notRetryable();
    }
    const charge = paidOnlineChargeOf(order);
    if (!charge) throw this.notRefundable();
    if (
      payments.some(
        (payment) =>
          (payment.type as PaymentType) === PaymentType.REFUND &&
          HOLDING_REFUND.has(payment.status),
      )
    ) {
      throw this.notRetryable();
    }
    const cents = centsOf(failed.amount);
    const paid = centsOf(charge.amount);
    if (cents > paid) throw this.exceedsPaid(paid);

    failed.retriedAt = new Date();
    return this.create(
      order,
      charge,
      cents,
      failed.refundReason,
      actorId,
      enqueueRefund,
    );
  }

  private async create(
    order: Order,
    charge: Payment,
    cents: number,
    refundReason: string | null,
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
  ): Promise<Payment> {
    const refund = await this.orderRepository.addRefund(
      order,
      {
        method: charge.method,
        amount: money(cents),
        currency: charge.currency,
        refundReason,
      },
      actorId,
    );
    await enqueueRefund({ paymentId: refund.id });
    return refund;
  }

  private alreadyRefunded(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.ORDER.ALREADY_REFUNDED,
      field: 'amount',
      message: ERROR_MESSAGES.ORDER.ALREADY_REFUNDED,
      description: ERROR_DESCRIPTIONS.ORDER.ALREADY_REFUNDED,
    });
  }

  private notRetryable(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
      field: 'id',
      message: ERROR_MESSAGES.ORDER.REFUND_NOT_RETRYABLE,
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_NOT_RETRYABLE,
    });
  }

  private needsCancelled(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.ORDER.REFUND_NEEDS_CANCELLED,
      field: 'status',
      message: ERROR_MESSAGES.ORDER.REFUND_NEEDS_CANCELLED,
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_NEEDS_CANCELLED,
    });
  }

  private reasonRequired(): ValidationException {
    return new ValidationException([
      {
        errCode: ERROR_CODES.ORDER.REFUND_REASON_REQUIRED,
        field: 'reason',
        message: ERROR_MESSAGES.ORDER.REFUND_REASON_REQUIRED,
        description: ERROR_DESCRIPTIONS.ORDER.REFUND_REASON_REQUIRED,
      },
    ]);
  }

  private notRefundable(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.ORDER.NOT_REFUNDABLE,
      field: 'amount',
      message: ERROR_MESSAGES.ORDER.NOT_REFUNDABLE,
      description: ERROR_DESCRIPTIONS.ORDER.NOT_REFUNDABLE,
    });
  }

  private exceedsPaid(refundable: number): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.ORDER.REFUND_EXCEEDS_PAID,
      field: 'amount',
      message: ERROR_MESSAGES.ORDER.REFUND_EXCEEDS_PAID,
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_EXCEEDS_PAID(
        money(refundable),
      ),
    });
  }
}
