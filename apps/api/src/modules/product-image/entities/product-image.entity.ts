import { DeferMode, Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { Product } from '../../product/entities/product.entity.js';

// Checked at commit, so a swap of two positions saves in one flush.
@Entity({ tableName: 'product_images' })
@Unique({
  properties: ['product', 'sortOrder'],
  deferMode: DeferMode.INITIALLY_DEFERRED,
})
export class ProductImage extends BaseEntity {
  @ManyToOne(() => Product, { updateRule: 'cascade' })
  product!: Rel<Product>;

  @Property({ type: 'text' })
  url!: string;

  @Property({ type: 'boolean', fieldName: 'is_primary' })
  isPrimary: boolean & Opt = false;

  // Null once the image is soft-deleted: a deleted image holds no position.
  @Property({ type: 'number', fieldName: 'sort_order', nullable: true })
  sortOrder: (number & Opt) | null = 0;
}
