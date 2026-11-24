import { Injectable } from '@nestjs/common';
import { CartRepository } from '../repositories/cart.repository.js';
import { CartItemRepository } from '../repositories/cart-item.repository.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import {
  type CartMergeAdjustmentDto,
  ResponseCartDto,
  ResponseMergedCartDto,
} from '../dto/response-cart.dto.js';
import type {
  AddCartItemInput,
  MergeCartInput,
  UpdateCartItemInput,
} from '../dto/cart.schema.js';
import type { Cart } from '../entities/cart.entity.js';
import type { CartItem } from '../entities/cart-item.entity.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { isPurchasable } from '../../product-variant/utils/purchasable.util.js';
import {
  InvalidStateException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartItemRepository: CartItemRepository,
    private readonly productVariantService: ProductVariantService,
  ) {}

  getCart(userId: string): Promise<ResponseCartDto> {
    return this.read(userId);
  }

  addItem(userId: string, input: AddCartItemInput): Promise<ResponseCartDto> {
    return this.cartRepository.transactional(async () => {
      const cart = await this.cartRepository.lockOrCreateForUser(userId);
      const variant = await this.productVariantService.findPurchasable(
        input.productVariantId,
        'productVariantId',
      );
      const line = await this.cartItemRepository.findByVariant(
        cart.id,
        variant.id,
      );
      const current = line?.quantity ?? 0;
      const stock = variant.stockQuantity;

      if (current + input.quantity > stock) {
        const remaining = Math.max(stock - current, 0);
        throw this.outOfStock(
          stock,
          remaining > 0
            ? ERROR_DESCRIPTIONS.CART.ADD_UP_TO(remaining)
            : ERROR_DESCRIPTIONS.CART.NO_MORE_TO_ADD,
        );
      }

      if (line) {
        line.quantity = current + input.quantity;
        await this.cartItemRepository.save(line, userId);
      } else {
        await this.cartItemRepository.create(
          cart.id,
          variant.id,
          input.quantity,
          userId,
        );
      }
      await this.touch(cart, userId);

      return this.read(userId);
    });
  }

  /**
   * Adds the guest lines to the cart: repeated variants are summed, each line
   * is capped at the stock (an existing line is never lowered), and a variant
   * that cannot be bought is skipped. `adjusted` lists every line that added
   * less than it asked for.
   */
  merge(userId: string, input: MergeCartInput): Promise<ResponseMergedCartDto> {
    return this.cartRepository.transactional(async () => {
      const requested = new Map<string, number>();
      for (const item of input.items) {
        // Ids are stored lowercase; a UUID may arrive in either case.
        const id = item.productVariantId.toLowerCase();
        requested.set(id, (requested.get(id) ?? 0) + item.quantity);
      }

      const variants = new Map<string, ProductVariant>(
        (
          await this.productVariantService.findManyWithProduct([
            ...requested.keys(),
          ])
        ).map((variant) => [variant.id, variant]),
      );
      const writableIds = [...requested.keys()].filter((id) => {
        const variant = variants.get(id);
        return isPurchasable(variant) && variant.stockQuantity > 0;
      });

      const cart = writableIds.length
        ? await this.cartRepository.lockOrCreateForUser(userId)
        : null;
      const lines = new Map<string, CartItem>(
        cart
          ? (
              await this.cartItemRepository.findByVariants(cart.id, writableIds)
            ).map((line) => [line.productVariant.id, line])
          : [],
      );

      const adjusted: CartMergeAdjustmentDto[] = [];
      let written = false;
      for (const [productVariantId, quantity] of requested) {
        const variant = variants.get(productVariantId);
        let added = 0;
        if (cart && isPurchasable(variant)) {
          const line = lines.get(productVariantId);
          const current = line?.quantity ?? 0;
          const total = Math.min(
            current + quantity,
            Math.max(variant.stockQuantity, current),
          );
          added = total - current;
          if (added > 0) {
            written = true;
            if (line) {
              line.quantity = total;
              await this.cartItemRepository.save(line, userId);
            } else {
              await this.cartItemRepository.create(
                cart.id,
                productVariantId,
                added,
                userId,
              );
            }
          }
        }
        if (added < quantity) {
          adjusted.push({
            productVariantId,
            requestedQuantity: quantity,
            quantity: added,
          });
        }
      }
      if (cart && written) {
        await this.touch(cart, userId);
      }

      return ResponseMergedCartDto.of(await this.read(userId), adjusted);
    });
  }

  updateItem(
    userId: string,
    id: string,
    input: UpdateCartItemInput,
  ): Promise<ResponseCartDto> {
    return this.cartRepository.transactional(async () => {
      const { cart, line } = await this.lockLine(userId, id);
      const variant = await this.productVariantService.findPurchasable(
        line.productVariant.id,
        'id',
      );
      const stock = variant.stockQuantity;

      if (input.quantity > stock) {
        throw this.outOfStock(
          stock,
          stock > 0
            ? ERROR_DESCRIPTIONS.CART.LOWER_TO(stock)
            : ERROR_DESCRIPTIONS.CART.OUT_OF_STOCK_REMOVE,
        );
      }

      line.quantity = input.quantity;
      await this.cartItemRepository.save(line, userId);
      await this.touch(cart, userId);

      return this.read(userId);
    });
  }

  removeItem(userId: string, id: string): Promise<ResponseCartDto> {
    return this.cartRepository.transactional(async () => {
      const { cart, line } = await this.lockLine(userId, id);
      await this.cartItemRepository.deleteById(line.id);
      await this.touch(cart, userId);

      return this.read(userId);
    });
  }

  clear(userId: string): Promise<ResponseCartDto> {
    return this.cartRepository.transactional(async () => {
      const cart = await this.cartRepository.lockByUser(userId);
      if (cart) {
        await this.cartItemRepository.deleteByCart(cart.id);
        await this.touch(cart, userId);
      }

      return this.read(userId);
    });
  }

  private async read(userId: string): Promise<ResponseCartDto> {
    const cart = await this.cartRepository.findByUserWithItems(userId);
    return cart
      ? ResponseCartDto.fromEntity(cart)
      : ResponseCartDto.empty(userId);
  }

  private async lockLine(
    userId: string,
    id: string,
  ): Promise<{ cart: Cart; line: CartItem }> {
    const cart = await this.cartRepository.lockByUser(userId);
    const line = cart
      ? await this.cartItemRepository.findInCart(cart.id, id)
      : null;
    if (!cart || !line) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.CART_ITEM.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.CART_ITEM.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.CART_ITEM.NOT_FOUND,
      });
    }
    return { cart, line };
  }

  private async touch(cart: Cart, userId: string): Promise<void> {
    cart.updatedAt = new Date();
    await this.cartRepository.save(cart, userId);
  }

  private outOfStock(
    stock: number,
    description: string,
  ): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.CART.OUT_OF_STOCK,
      field: 'quantity',
      message: ERROR_MESSAGES.CART.OUT_OF_STOCK(stock),
      description,
    });
  }
}
