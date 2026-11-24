import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@repo/constants';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { OrderRepository } from '../../order/repositories/order.repository.js';
import { PaymentGateways } from '../gateways/payment-gateways.js';
import type {
  CheckoutSession,
  GatewayEvent,
  PaymentGateway,
  VerifiedWebhook,
} from '../gateways/payment-gateway.js';
import { ResponsePaymentCheckoutDto } from '../dto/response-payment-checkout.dto.js';
import type { Payment } from '../../order/entities/payment.entity.js';
import type { Order } from '../../order/entities/order.entity.js';
import type { PaymentCheckoutExpirePayload } from '../../../common/interfaces/outbox-payload.interface.js';
import {
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

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly webAppUrl: string;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly gateways: PaymentGateways,
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

      const payment = await this.paymentRepository.lockById(charge.id);
      const order = await this.orderRepository.reload(charge.order);
      if (!payment || !order) throw this.orderNotFound();
      if (
        (order.status as OrderStatus) !== OrderStatus.PENDING ||
        (payment.status as PaymentStatus) === PaymentStatus.PAID
      ) {
        throw this.notPayable();
      }
      if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) {
        throw new InvalidStateException({
          errCode: ERROR_CODES.PAYMENT.ORDER_EXPIRED,
          field: 'id',
          message: ERROR_MESSAGES.PAYMENT.ORDER_EXPIRED,
          description: ERROR_DESCRIPTIONS.PAYMENT.ORDER_EXPIRED,
        });
      }
      if (payment.checkoutSessionId) {
        return this.reuse(gateway, payment);
      }

      const session = await gateway.createCheckout({
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountCents: centsOf(order.totalAmount),
        currency: CURRENCY,
        customerEmail: order.user.email,
        expiresAt: this.sessionExpiryOf(order),
        successUrl: `${this.successUrlOf(order)}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: this.successUrlOf(order),
      });
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
  ): VerifiedWebhook {
    const gateway = this.gateways.for(method);
    if (!gateway) {
      throw new Error(`No payment gateway is registered for ${method}`);
    }
    return gateway.parseWebhook(rawBody, headers);
  }

  apply(event: GatewayEvent | null): Promise<boolean> {
    if (!event) return Promise.resolve(false);
    if (!paymentIdSchema.safeParse(event.paymentId).success) {
      this.logger.warn(`Ignored a ${event.kind} event for an unknown payment`);
      return Promise.resolve(false);
    }
    return this.paymentRepository.transactional(async () => {
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

      if (event.kind === 'failed') {
        if (
          (payment.status as PaymentStatus) === PaymentStatus.FAILED &&
          payment.failureReason === event.reason
        ) {
          return false;
        }
        payment.status = PaymentStatus.FAILED;
        payment.failureReason = event.reason;
        await this.paymentRepository.save(payment, null);
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
      await this.paymentRepository.save(payment, null);
      return true;
    });
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

  private async reuse(
    gateway: PaymentGateway,
    payment: Payment,
  ): Promise<ResponsePaymentCheckoutDto> {
    const session: CheckoutSession | null = await gateway.findCheckout(
      payment.checkoutSessionId as string,
    );
    if (!session?.open) throw this.notPayable();
    return ResponsePaymentCheckoutDto.fromEntity(payment, session);
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
