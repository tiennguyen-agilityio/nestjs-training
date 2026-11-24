import { Injectable } from '@nestjs/common';
import { InventoryMovementType, PaymentMethod } from '@repo/constants';
import { Order } from '../entities/order.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import type { ListOptions } from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import type { OrderFilters } from '../dto/order.schema.js';

/**
 * The ids of a user's orders whose payment status (worked out exactly as
 * `paymentStatusOf` does, over the non-deleted payments) equals the second
 * parameter. Parameters: user id, OrderPaymentStatus.
 */
const PAYMENT_STATUS_IDS_SQL = `select o.id from orders o
left join lateral (
  select coalesce(sum(p.amount) filter (where p.type = 'REFUND' and p.status = 'PAID'), 0) as refunded,
         coalesce(sum(p.amount) filter (where p.type = 'CHARGE' and p.status = 'PAID'), 0) as charged
  from payments p where p.order_id = o.id and p.deleted_at is null) t on true
left join lateral (
  select p.method, p.status, p.checkout_session_id from payments p
  where p.order_id = o.id and p.type = 'CHARGE' and p.deleted_at is null
  order by p.created_at desc limit 1) c on true
where o.user_id = ? and o.deleted_at is null and (case
  when t.refunded > 0 and t.refunded >= t.charged then 'REFUNDED'
  when t.refunded > 0 then 'PARTIALLY_REFUNDED'
  when c.status is null then 'UNPAID'
  when c.method = 'COD' and c.status = 'PENDING' then 'UNPAID'
  when c.method in ('CARD', 'PAYPAL') and c.status = 'PENDING' and c.checkout_session_id is null then 'UNPAID'
  else c.status::text end) = ?`;

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

  async findMine(
    userId: string,
    query: QueryParams,
    { status, shippingStatus, paymentStatus, sort, order }: OrderFilters,
  ): Promise<PaginatedResult<Order>> {
    const where: ListOptions<Order>['where'] = { user: userId };
    if (status) where.status = status;
    if (shippingStatus) where.shippingStatus = shippingStatus;
    if (paymentStatus) {
      where.id = await this.selectIds(PAYMENT_STATUS_IDS_SQL, [
        userId,
        paymentStatus,
      ]);
    }

    return this.paginate(query, {
      where,
      relations: ['user', 'items', 'payments'],
      orderBy: { field: sort, direction: order },
    });
  }

  /** One of the user's orders, with its items and payments. */
  findMineByIdOrNumber(
    userId: string,
    where: { id: string } | { orderNumber: string },
  ): Promise<Order | null> {
    return this.findOneBy(
      { ...where, user: userId },
      { relations: ['items', 'payments'] },
    );
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
