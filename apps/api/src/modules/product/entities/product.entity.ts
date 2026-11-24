import { Collection, Opt, QueryOrder } from '@mikro-orm/core';
import {
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';
import { Category } from '../../category/entities/category.entity.js';
import { ProductImage } from '../../product-image/entities/product-image.entity.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { RoastLevel, ProductStatus, VALIDATION_RULES } from '@repo/constants';

@Entity({ tableName: 'products' })
export class Product extends AuditableEntity {
  @ManyToOne(() => Category, { updateRule: 'cascade' })
  category!: Category;

  @Property({ type: 'string', length: VALIDATION_RULES.NAME.MAX_LENGTH })
  @Unique()
  name!: string;

  @Property({ type: 'string' })
  slug!: string;

  @Property({ type: 'text' })
  description!: string;

  @Enum({ items: () => RoastLevel, fieldName: 'roast_level' })
  roastLevel!: RoastLevel;

  @Property({ type: 'boolean', fieldName: 'is_organic' })
  isOrganic: boolean & Opt = false;

  @Property({ type: 'boolean', fieldName: 'is_fair_trade' })
  isFairTrade: boolean & Opt = false;

  @Enum({ items: () => ProductStatus })
  status: ProductStatus & Opt = ProductStatus.DRAFT;

  @Property({ type: 'text', fieldName: 'tasting_notes', nullable: true })
  tastingNotes: string | null = null;

  @Property({ type: 'text' })
  origin!: string;

  @Property({ type: 'text', fieldName: 'processing_method' })
  processingMethod!: string;

  @OneToMany(() => ProductImage, (image) => image.product)
  images = new Collection<ProductImage>(this);

  // Oldest first, so variants[0] is the product's first variant everywhere.
  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    orderBy: { createdAt: QueryOrder.ASC },
  })
  variants = new Collection<ProductVariant>(this);
}
