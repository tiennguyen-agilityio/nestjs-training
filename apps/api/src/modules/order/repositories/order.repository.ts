import { Injectable } from '@nestjs/common';
import { InventoryMovementType, PaymentMethod } from '@repo/constants';
import { Order } from '../entities/order.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import type { ActorId } from '../../../common/utils/audit.util.js';

export interface CreateOrderData {
  userId: string;
  shippingMethodId: string;
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district: string;
  city: string;
  postalCode: string;
  shippingMethodName: string;
  shippingFee: string;
  tax: string;
  totalAmount: string;
  note: string | null;
  expiresAt: Date | null;
  items: {
    productVariantId: string;
    productName: string;
    productImage: string;
    variantName: string;
    unitPrice: string;
    discountAmount: string;
    quantity: number;
  }[];
  payment: { method: PaymentMethod; amount: string };
  movements: { productVariantId: string; quantity: number }[];
}

@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  protected readonly entity = Order;

  async existsByNumber(orderNumber: string): Promise<boolean> {
    return (
      (await this.findOneBy({ orderNumber }, { includeDeleted: true })) !== null
    );
  }

  reload(order: Order): Promise<Order | null> {
    return this.reloadEntity(order);
  }

  create(
    {
      userId,
      shippingMethodId,
      items,
      payment,
      movements,
      ...order
    }: CreateOrderData,
    actorId: ActorId,
  ): Promise<Order> {
    return this.createAndSave(
      {
        ...order,
        user: userId,
        shippingMethod: shippingMethodId,
        items: items.map(({ productVariantId, ...item }) => ({
          ...item,
          productVariant: productVariantId,
        })),
        payments: [payment],
        movements: movements.map(({ productVariantId, quantity }) => ({
          productVariant: productVariantId,
          type: InventoryMovementType.RESERVE,
          quantity,
        })),
      },
      actorId,
    );
  }
}
