import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/decorators/legacy';
import { PaymentMethod, PaymentStatus, PaymentType } from '@repo/constants';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';
import { Order } from './order.entity.js';

const CURRENCY_LENGTH = 3;
const TRANSACTION_ID_LENGTH = 255;
const CHECKOUT_SESSION_ID_LENGTH = 255;

@Entity({ tableName: 'payments' })
@Index({ properties: ['order', 'createdAt'] })
@Index({
  name: 'payments_order_id_pending_charge_unique',
  expression: `create unique index "payments_order_id_pending_charge_unique" on "payments" ("order_id") where "type" = 'CHARGE' and "status" = 'PENDING';`,
})
@Index({
  name: 'payments_order_id_paid_charge_unique',
  expression: `create unique index "payments_order_id_paid_charge_unique" on "payments" ("order_id") where "type" = 'CHARGE' and "status" = 'PAID';`,
})
@Index({
  name: 'payments_transaction_id_unique',
  expression:
    'create unique index "payments_transaction_id_unique" on "payments" ("transaction_id") where "transaction_id" is not null;',
})
@Index({
  name: 'payments_checkout_session_id_unique',
  expression:
    'create unique index "payments_checkout_session_id_unique" on "payments" ("checkout_session_id") where "checkout_session_id" is not null;',
})
@Check({ name: 'payments_amount_check', expression: 'amount > 0' })
export class Payment extends AuditableEntity {
  @ManyToOne(() => Order, { fieldName: 'order_id', deleteRule: 'restrict' })
  order!: Rel<Order>;

  @Enum({ items: () => PaymentType })
  type: PaymentType & Opt = PaymentType.CHARGE;

  @Enum({ items: () => PaymentMethod })
  method!: PaymentMethod;

  @Enum({ items: () => PaymentStatus })
  status: PaymentStatus & Opt = PaymentStatus.PENDING;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  amount!: string;

  @Property({ type: 'character', length: CURRENCY_LENGTH })
  currency: string & Opt = 'USD';

  @Property({
    type: 'string',
    fieldName: 'transaction_id',
    length: TRANSACTION_ID_LENGTH,
    nullable: true,
  })
  transactionId: string | null = null;

  @Property({
    type: 'string',
    fieldName: 'checkout_session_id',
    length: CHECKOUT_SESSION_ID_LENGTH,
    nullable: true,
  })
  checkoutSessionId: string | null = null;

  @Property({ type: Date, fieldName: 'completed_at', nullable: true })
  completedAt: Date | null = null;

  @Property({ type: 'text', fieldName: 'failure_reason', nullable: true })
  failureReason: string | null = null;

  @Property({ type: Date, fieldName: 'retried_at', nullable: true })
  retriedAt: Date | null = null;
}
