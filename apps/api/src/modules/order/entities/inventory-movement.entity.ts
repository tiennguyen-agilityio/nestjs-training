import { v4 as uuidv4 } from 'uuid';
import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import { InventoryMovementType } from '@repo/constants';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { Order } from './order.entity.js';
import { User } from '../../user/entities/user.entity.js';

const REASON_LENGTH = 255;

@Entity({ tableName: 'inventory_movements' })
@Index({ properties: ['productVariant', 'createdAt'] })
export class InventoryMovement {
  @PrimaryKey({ type: 'uuid' })
  id: string & Opt = uuidv4();

  @ManyToOne(() => ProductVariant, {
    fieldName: 'product_variant_id',
    deleteRule: 'restrict',
  })
  productVariant!: Rel<ProductVariant>;

  @ManyToOne(() => Order, {
    fieldName: 'order_id',
    nullable: true,
    deleteRule: 'restrict',
  })
  order: Rel<Order> | null = null;

  @Enum({ items: () => InventoryMovementType })
  type!: InventoryMovementType;

  @Property({ type: 'number' })
  quantity!: number;

  @Property({ type: 'string', length: REASON_LENGTH, nullable: true })
  reason: string | null = null;

  @ManyToOne(() => User, {
    fieldName: 'created_by',
    nullable: true,
    deleteRule: 'restrict',
  })
  createdBy: Rel<User> | null = null;

  @Property({ type: Date, fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date & Opt = new Date();
}
