import { Inject, Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import { InventoryMovementType, PaymentMethod } from '@repo/constants';
import { Order } from '../entities/order.entity.js';
import { InventoryMovement } from '../entities/inventory-movement.entity.js';
import { OUTBOX_TOPICS } from '../../../common/constants/outbox.constant.js';
import type { PaymentCheckoutExpirePayload } from '../../../common/interfaces/outbox-payload.interface.js';
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
/**
 * Locks the non-deleted CHARGE rows of one of a user's orders, in id order,
 * before the order row itself: `PaymentService.apply()` locks a payment and
 * then writes its order, so taking the same order avoids a deadlock.
 * Parameters: user id, the order's id or order number.
 */
const lockChargesSql = (column: 'id' | 'order_number'): string =>
  `select p.id from payments p
join orders o on o.id = p.order_id
where o.user_id = ? and o.${column} = ? and o.deleted_at is null
  and p.type = 'CHARGE' and p.deleted_at is null
order by p.id
for update of p`;

export type EnqueueCheckoutExpire = (
  payload: PaymentCheckoutExpirePayload,
) => Promise<void>;

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

  // Property injection keeps BaseRepository's constructor, the only one that sees the ORM.
  @Inject(Outbox)
  private readonly outbox!: Outbox;

  /**
   * Runs `work` in one transaction and hands it a function that adds a
   * `payment.checkout-expire` outbox message to that transaction; wakes the
   * relay after the commit when a message was added.
   */
  async transactionalWithOutbox<R>(
    work: (enqueueCheckoutExpire: EnqueueCheckoutExpire) => Promise<R>,
  ): Promise<R> {
    let enqueued = false;
    const result = await this.inTransaction((tx) =>
      work(async (payload) => {
        await this.outbox.add<PaymentCheckoutExpirePayload>(tx, {
          topic: OUTBOX_TOPICS.PAYMENT_CHECKOUT_EXPIRE,
          key: payload.paymentId,
          payload,
        });
        enqueued = true;
      }),
    );
    if (enqueued) this.outbox.notify();

    return result;
  }

  /**
   * One of the user's orders, locked for a cancel: its CHARGE rows first,
   * then the order row with its live payments. Its items load next with the
   * soft-delete filter off: MikroORM joins each item's variant to apply that
   * filter, which would drop an item whose variant was soft-deleted (and so
   * never release its stock).
   */
  async lockMineForCancel(
    userId: string,
    where: { id: string } | { orderNumber: string },
  ): Promise<Order | null> {
    const [column, value] =
      'id' in where
        ? (['id', where.id] as const)
        : (['order_number', where.orderNumber] as const);
    await this.selectIds(lockChargesSql(column), [userId, value]);

    const order = await this.findOneForUpdate(
      { ...where, user: userId },
      { relations: ['payments'] },
    );
    if (!order) return null;
    await this.findOneBy(
      { id: order.id },
      { relations: ['items'], includeDeleted: true },
    );

    return order;
  }

  /** Writes one RELEASE per item of the cancelled order, then saves it. */
  async saveCancelled(order: Order, actorId: ActorId): Promise<void> {
    for (const item of order.items.getItems()) {
      this.createRelated(InventoryMovement.name, {
        productVariant: item.productVariant,
        order,
        type: InventoryMovementType.RELEASE,
        quantity: item.quantity,
      });
    }
    await this.save(order, actorId);
  }

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
