import { Entity, Property, Unique } from '@mikro-orm/decorators/legacy';
import { VALIDATION_RULES } from '@repo/constants';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';

@Entity({ tableName: 'categories' })
export class Category extends AuditableEntity {
  @Property({ type: 'string', length: VALIDATION_RULES.NAME.MAX_LENGTH })
  @Unique()
  name!: string;

  @Property({ type: 'string' })
  slug!: string;
}
