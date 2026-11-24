import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Cart } from '../entities/cart.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

const READ_RELATIONS = [
  'items',
  'items.productVariant',
  'items.productVariant.product',
  'items.productVariant.product.images',
];

@Injectable()
export class CartRepository extends BaseRepository<Cart> {
  protected readonly entity = Cart;

  findByUserWithItems(userId: string): Promise<Cart | null> {
    return this.findOneBy(
      { user: userId },
      { includeDeleted: true, relations: READ_RELATIONS },
    );
  }

  lockByUser(userId: string): Promise<Cart | null> {
    return this.findOneForUpdate({ user: userId });
  }

  async lockOrCreateForUser(userId: string): Promise<Cart> {
    const now = new Date();
    await this.insertIgnoringConflict(
      { id: uuidv4(), user: userId, createdAt: now, updatedAt: now },
      ['user'],
    );
    const cart = await this.findOneForUpdate({ user: userId });
    if (!cart) {
      throw new Error(`Cart for user ${userId} missing after insert`);
    }
    return cart;
  }
}
