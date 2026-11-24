import { Opt } from '@mikro-orm/core';
import { Entity, Enum, Property, Unique } from '@mikro-orm/decorators/legacy';
import { AuditableEntity } from '../../../common/entities/auditable.entity.js';
import { UserRole, UserStatus, VALIDATION_RULES } from '@repo/constants';

// Matches VALIDATION_RULES.PHONE.REGEX (`^\d{10}$`): exactly 10 digits.
const PHONE_NUMBER_LENGTH = 10;

@Entity({ tableName: 'users' })
export class User extends AuditableEntity {
  @Property({ type: 'string', fieldName: 'clerk_id' })
  @Unique()
  clerkId!: string;

  @Property({ type: 'string' })
  @Unique()
  email!: string;

  @Enum({ items: () => UserRole })
  role: UserRole & Opt = UserRole.USER;

  @Property({
    type: 'string',
    fieldName: 'first_name',
    length: VALIDATION_RULES.NAME.MAX_LENGTH,
  })
  firstName!: string;

  @Property({
    type: 'string',
    fieldName: 'last_name',
    length: VALIDATION_RULES.NAME.MAX_LENGTH,
  })
  lastName!: string;

  @Property({
    type: 'string',
    fieldName: 'phone_number',
    nullable: true,
    length: PHONE_NUMBER_LENGTH,
  })
  phoneNumber: string | null = null;

  @Property({ type: 'string', fieldName: 'avatar_url', nullable: true })
  avatarUrl: string | null = null;

  @Enum({ items: () => UserStatus })
  status: UserStatus & Opt = UserStatus.ACTIVE;
}
