import { Opt } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/decorators/legacy';
import { VALIDATION_RULES } from '@repo/constants';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { User } from './user.entity.js';

const { ADDRESS_MAX_LENGTH, POSTAL_CODE_MAX_LENGTH } = VALIDATION_RULES.ORDER;

@Entity({ tableName: 'user_addresses' })
export class UserAddress extends BaseEntity {
  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  @Index()
  user!: Rel<User>;

  @Property({
    type: 'string',
    fieldName: 'address_line',
    length: ADDRESS_MAX_LENGTH,
  })
  addressLine!: string;

  @Property({ type: 'string', length: ADDRESS_MAX_LENGTH })
  ward!: string;

  @Property({ type: 'string', length: ADDRESS_MAX_LENGTH })
  district!: string;

  @Property({ type: 'string', length: ADDRESS_MAX_LENGTH })
  city!: string;

  @Property({
    type: 'string',
    fieldName: 'postal_code',
    length: POSTAL_CODE_MAX_LENGTH,
  })
  postalCode!: string;

  @Property({ type: 'boolean', fieldName: 'is_default' })
  isDefault: boolean & Opt = false;
}
