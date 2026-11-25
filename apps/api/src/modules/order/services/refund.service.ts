import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, PaymentType } from '@repo/constants';
import {
  OrderRepository,
  type EnqueueRefund,
} from '../repositories/order.repository.js';
import type { Order } from '../entities/order.entity.js';
import type { Payment } from '../entities/payment.entity.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import { InvalidStateException } from '../../../common/exceptions/base.exception.js';
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

/** Starts refunds of an order the caller has locked, inside its transaction. */
@Injectable()
export class RefundService {
  constructor(private readonly orderRepository: OrderRepository) {}

  async startLocked(
    order: Order,
    amount: number | 'rest',
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
  ): Promise<Payment | null> {
    const payments = order.payments.getItems();
    const charge = payments.find(
      (payment) =>
        (payment.type as PaymentType) === PaymentType.CHARGE &&
        (payment.status as PaymentStatus) === PaymentStatus.PAID &&
        ONLINE_METHODS.has(payment.method),
    );
    const held = payments.some(
      (payment) =>
        (payment.type as PaymentType) === PaymentType.REFUND &&
        HOLDING_REFUND.has(payment.status),
    );

    if (amount === 'rest') {
      if (!charge || held) return null;
      return this.create(
        order,
        charge,
        centsOf(charge.amount),
        actorId,
        enqueueRefund,
      );
    }
    if (!charge) throw this.notRefundable();
    if (held) throw this.alreadyRefunded();
    const cents = centsOf(amount);
    const paid = centsOf(charge.amount);
    if (cents > paid) throw this.exceedsPaid(paid);
    return this.create(order, charge, cents, actorId, enqueueRefund);
  }

  async retryLocked(
    order: Order,
    paymentId: string,
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
  ): Promise<Payment> {
    const failed = order.payments
      .getItems()
      .find((payment) => payment.id === paymentId);
    if (
      !failed ||
      (failed.type as PaymentType) !== PaymentType.REFUND ||
      (failed.status as PaymentStatus) !== PaymentStatus.FAILED ||
      failed.retriedAt
    ) {
      throw new InvalidStateException({
        errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
        field: 'id',
        message: ERROR_MESSAGES.ORDER.REFUND_NOT_RETRYABLE,
        description: ERROR_DESCRIPTIONS.ORDER.REFUND_NOT_RETRYABLE,
      });
    }
    failed.retriedAt = new Date();
    const refund = await this.startLocked(
      order,
      centsOf(failed.amount) / 100,
      actorId,
      enqueueRefund,
    );
    return refund as Payment;
  }

  private async create(
    order: Order,
    charge: Payment,
    cents: number,
    actorId: ActorId,
    enqueueRefund: EnqueueRefund,
  ): Promise<Payment> {
    const refund = await this.orderRepository.addRefund(
      order,
      {
        method: charge.method,
        amount: money(cents),
        currency: charge.currency,
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
