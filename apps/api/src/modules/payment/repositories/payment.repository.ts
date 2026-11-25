import { Injectable } from '@nestjs/common';
import { PaymentType } from '@repo/constants';
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

  lockById(id: string): Promise<Payment | null> {
    return this.findOneForUpdate({ id });
  }
}
