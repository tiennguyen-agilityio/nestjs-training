import { Collection, Opt, QueryOrder } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { OrderStatus, ShippingStatus, VALIDATION_RULES } from '@repo/constants';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { ShippingMethod } from '../../shipping-method/entities/shipping-method.entity.js';
import { OrderItem } from './order-item.entity.js';
import { Payment } from './payment.entity.js';
import { InventoryMovement } from './inventory-movement.entity.js';

const PHONE_LENGTH = 10;

@Entity({ tableName: 'orders' })
export class Order extends AuditableEntity {
  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'restrict' })
  user!: Rel<User>;

  @ManyToOne(() => ShippingMethod, {
    fieldName: 'shipping_method_id',
    deleteRule: 'restrict',
  })
  shippingMethod!: Rel<ShippingMethod>;

  @Property({
    type: 'string',
    fieldName: 'order_number',
    length: VALIDATION_RULES.ORDER.NUMBER_MAX_LENGTH,
  })
  @Unique()
  orderNumber!: string;

  @Enum({ items: () => OrderStatus })
  status: OrderStatus & Opt = OrderStatus.PENDING;

  @Enum({ items: () => ShippingStatus, fieldName: 'shipping_status' })
  shippingStatus: ShippingStatus & Opt = ShippingStatus.PENDING;

  @Property({
    type: 'string',
    fieldName: 'recipient_name',
    length: VALIDATION_RULES.NAME.MAX_LENGTH,
  })
  recipientName!: string;

  @Property({
    type: 'string',
    fieldName: 'recipient_phone',
    length: PHONE_LENGTH,
  })
  recipientPhone!: string;

  @Property({
    type: 'string',
    fieldName: 'address_line',
    length: VALIDATION_RULES.ORDER.ADDRESS_MAX_LENGTH,
  })
  addressLine!: string;

  @Property({
    type: 'string',
    length: VALIDATION_RULES.ORDER.ADDRESS_MAX_LENGTH,
  })
  ward!: string;

  @Property({
    type: 'string',
    length: VALIDATION_RULES.ORDER.ADDRESS_MAX_LENGTH,
  })
  district!: string;

  @Property({
    type: 'string',
    length: VALIDATION_RULES.ORDER.ADDRESS_MAX_LENGTH,
  })
  city!: string;

  @Property({
    type: 'string',
    fieldName: 'postal_code',
    length: VALIDATION_RULES.ORDER.POSTAL_CODE_MAX_LENGTH,
  })
  postalCode!: string;

  @Property({
    type: 'string',
    fieldName: 'shipping_method_name',
    length: VALIDATION_RULES.NAME.MAX_LENGTH,
  })
  shippingMethodName!: string;

  @Property({
    type: 'decimal',
    precision: 10,
    scale: 2,
    fieldName: 'shipping_fee',
  })
  shippingFee!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  tax!: string;

  @Property({
    type: 'decimal',
    precision: 10,
    scale: 2,
    fieldName: 'total_amount',
  })
  totalAmount!: string;

  @Property({ type: 'text', nullable: true })
  note: string | null = null;

  @Property({ type: Date, fieldName: 'expires_at', nullable: true })
  expiresAt: Date | null = null;

  @OneToMany(() => OrderItem, (item) => item.order, {
    orderBy: { productName: QueryOrder.ASC },
  })
  items = new Collection<OrderItem>(this);

  @OneToMany(() => Payment, (payment) => payment.order, {
    orderBy: { createdAt: QueryOrder.ASC },
  })
  payments = new Collection<Payment>(this);

  @OneToMany(() => InventoryMovement, (movement) => movement.order)
  movements = new Collection<InventoryMovement>(this);
}
