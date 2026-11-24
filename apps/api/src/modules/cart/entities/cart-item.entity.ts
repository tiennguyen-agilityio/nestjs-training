import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { Cart } from './cart.entity.js';

@Entity({ tableName: 'cart_items' })
@Unique({ properties: ['cart', 'productVariant'] })
@Check({ name: 'cart_items_quantity_check', expression: 'quantity >= 1' })
export class CartItem extends BaseEntity {
  @ManyToOne(() => Cart, { updateRule: 'cascade', deleteRule: 'cascade' })
  cart!: Rel<Cart>;

  @ManyToOne(() => ProductVariant, {
    fieldName: 'product_variant_id',
    updateRule: 'cascade',
    deleteRule: 'cascade',
  })
  productVariant!: Rel<ProductVariant>;

  @Property({ type: 'number' })
  quantity: number & Opt = 1;
}
