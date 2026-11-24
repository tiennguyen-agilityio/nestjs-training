import { Injectable } from '@nestjs/common';
import { CartItem } from '../entities/cart-item.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

@Injectable()
export class CartItemRepository extends BaseRepository<CartItem> {
  protected readonly entity = CartItem;

  findInCart(cartId: string, id: string): Promise<CartItem | null> {
    return this.findOneBy({ id, cart: cartId });
  }

  findByVariant(
    cartId: string,
    productVariantId: string,
  ): Promise<CartItem | null> {
    return this.findOneBy({ cart: cartId, productVariant: productVariantId });
  }

  create(
    cartId: string,
    productVariantId: string,
    quantity: number,
  ): Promise<CartItem> {
    return this.createAndSave({
      cart: cartId,
      productVariant: productVariantId,
      quantity,
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.deleteWhere({ id });
  }

  deleteByCart(cartId: string): Promise<number> {
    return this.deleteWhere({ cart: cartId });
  }
}
