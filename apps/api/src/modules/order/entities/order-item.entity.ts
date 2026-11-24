import { v4 as uuidv4 } from 'uuid';
import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { VALIDATION_RULES } from '@repo/constants';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { Order } from './order.entity.js';

const VARIANT_NAME_LENGTH = 50;

@Entity({ tableName: 'order_items' })
@Unique({ properties: ['order', 'productVariant'] })
@Check({ name: 'order_items_quantity_check', expression: 'quantity >= 1' })
export class OrderItem {
  @PrimaryKey({ type: 'uuid' })
  id: string & Opt = uuidv4();

  @ManyToOne(() => Order, { fieldName: 'order_id', deleteRule: 'restrict' })
  order!: Rel<Order>;

  @ManyToOne(() => ProductVariant, {
    fieldName: 'product_variant_id',
    deleteRule: 'restrict',
  })
  productVariant!: Rel<ProductVariant>;

  @Property({
    type: 'string',
    fieldName: 'product_name',
    length: VALIDATION_RULES.NAME.MAX_LENGTH,
  })
  productName!: string;

  @Property({ type: 'text', fieldName: 'product_image' })
  productImage!: string;

  @Property({
    type: 'string',
    fieldName: 'variant_name',
    length: VARIANT_NAME_LENGTH,
  })
  variantName!: string;

  @Property({
    type: 'decimal',
    precision: 10,
    scale: 2,
    fieldName: 'unit_price',
  })
  unitPrice!: string;

  @Property({
    type: 'decimal',
    precision: 10,
    scale: 2,
    fieldName: 'discount_amount',
  })
  discountAmount: string & Opt = '0';

  @Property({ type: 'number' })
  quantity!: number;
}
