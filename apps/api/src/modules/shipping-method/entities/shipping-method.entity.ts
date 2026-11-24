import { Opt } from '@mikro-orm/core';
import { Entity, Enum, Property, Unique } from '@mikro-orm/decorators/legacy';
import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';

// The name is unique whatever its case, deleted methods included.
@Entity({ tableName: 'shipping_methods' })
@Unique({
  name: 'shipping_methods_name_lower_unique',
  expression:
    'create unique index "shipping_methods_name_lower_unique" on "shipping_methods" (lower("name"));',
})
export class ShippingMethod extends AuditableEntity {
  @Property({ type: 'string', length: VALIDATION_RULES.NAME.MAX_LENGTH })
  name!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  price!: string;

  @Enum({ items: () => ShippingMethodStatus })
  status: ShippingMethodStatus & Opt = ShippingMethodStatus.ACTIVE;
}
