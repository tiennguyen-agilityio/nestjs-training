import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Enum,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { DiscountType, ProductUnit } from '@repo/constants';

@Entity({ tableName: 'product_variants' })
@Check({
  name: 'product_variants_stock_quantity_check',
  expression: 'stock_quantity >= 0',
})
@Check({
  name: 'product_variants_reserved_quantity_check',
  expression: 'reserved_quantity >= 0 and reserved_quantity <= stock_quantity',
})
export class ProductVariant extends AuditableEntity {
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

  @Property({ type: 'number', fieldName: 'reserved_quantity' })
  reservedQuantity: number & Opt = 0;
}
