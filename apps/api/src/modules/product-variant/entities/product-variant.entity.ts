import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  Enum,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { DiscountType, ProductUnit } from '@repo/constants';

@Entity({ tableName: 'product_variants' })
export class ProductVariant extends BaseEntity {
  @ManyToOne(() => Product, { updateRule: 'cascade' })
  product!: Rel<Product>;

  @Property({ type: 'string' })
  @Unique()
  sku!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  size!: string;

  @Enum({ items: () => ProductUnit })
  unit!: ProductUnit;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Enum({
    items: () => DiscountType,
    fieldName: 'discount_type',
    nullable: true,
  })
  discountType: DiscountType | null = null;

  @Property({
    type: 'decimal',
    precision: 10,
    scale: 2,
    fieldName: 'discount_value',
    nullable: true,
  })
  discountValue: string | null = null;

  @Property({ type: 'number', fieldName: 'stock_quantity' })
  stockQuantity: number & Opt = 0;
}
