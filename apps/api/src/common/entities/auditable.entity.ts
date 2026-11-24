import { Entity, Property } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity.js';

@Entity({ abstract: true })
export abstract class AuditableEntity extends BaseEntity {
  @Property({ type: 'uuid', fieldName: 'created_by', nullable: true })
  createdBy: string | null = null;

  @Property({ type: 'uuid', fieldName: 'updated_by', nullable: true })
  updatedBy: string | null = null;

  @Property({ type: 'uuid', fieldName: 'deleted_by', nullable: true })
  deletedBy: string | null = null;
}
