import { Collection, QueryOrder } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';
import { Entity, OneToMany, OneToOne } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { CartItem } from './cart-item.entity.js';

@Entity({ tableName: 'carts' })
export class Cart extends BaseEntity {
  @OneToOne(() => User, {
    owner: true,
    fieldName: 'user_id',
    unique: true,
    updateRule: 'cascade',
    deleteRule: 'cascade',
  })
  user!: Rel<User>;

  @OneToMany(() => CartItem, (item) => item.cart, {
    orderBy: { createdAt: QueryOrder.ASC },
  })
  items = new Collection<CartItem>(this);
}
