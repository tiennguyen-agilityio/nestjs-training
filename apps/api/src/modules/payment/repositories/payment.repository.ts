import { Injectable } from '@nestjs/common';
import { PaymentStatus, PaymentType } from '@repo/constants';
import { Payment } from '../../order/entities/payment.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  protected readonly entity = Payment;

  async findNewestChargeOf(
    orderId: string,
    userId: string,
  ): Promise<Payment | null> {
    const charges = await this.findMany({
      where: {
        order: { id: orderId, user: userId },
        type: PaymentType.CHARGE,
      },
      relations: ['order', 'order.user'],
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });
    return charges[0] ?? null;
  }

  findByCheckoutSessionId(checkoutSessionId: string): Promise<Payment | null> {
    return this.findOneBy({ checkoutSessionId }, { relations: ['order'] });
  }

  /** Runs `work` in a persistence context of its own: callable outside a request. */
  withOwnContext<R>(work: () => Promise<R>): Promise<R> {
    return this.inOwnContext(work);
  }

  findByTransactionId(transactionId: string): Promise<Payment | null> {
    return this.findOneBy({ transactionId }, { relations: ['order'] });
  }

  /** Locks the row and reloads it, so a copy already in the context is not trusted. */
  async lockById(id: string): Promise<Payment | null> {
    const locked = await this.findOneForUpdate({ id });
    return locked ? this.reloadEntity(locked) : null;
  }

  /** A REFUND row and the PAID CHARGE of its order. */
  async findRefundWithCharge(
    paymentId: string,
  ): Promise<{ refund: Payment; charge: Payment | null } | null> {
    const refund = await this.findOneBy(
      { id: paymentId, type: PaymentType.REFUND },
      { relations: ['order'] },
    );
    if (!refund) return null;
    const charge = await this.findOneBy({
      order: refund.order.id,
      type: PaymentType.CHARGE,
      status: PaymentStatus.PAID,
    });
    return { refund, charge };
  }
}
