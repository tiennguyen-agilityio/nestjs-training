import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { CartController } from './cart.controller.js';
import { CartService } from '../services/cart.service.js';
import { ResponseCartDto } from '../dto/response-cart.dto.js';
import { User } from '../../user/entities/user.entity.js';

describe('CartController', () => {
  let controller: CartController;
  let cartService: Record<
    'getCart' | 'addItem' | 'updateItem' | 'removeItem' | 'clear',
    Mock
  >;
  const user = { id: 'user-1' } as User;
  const cart = { id: 'cart-1' } as ResponseCartDto;

  beforeEach(async () => {
    cartService = {
      getCart: vi.fn().mockResolvedValue(cart),
      addItem: vi.fn().mockResolvedValue(cart),
      updateItem: vi.fn().mockResolvedValue(cart),
      removeItem: vi.fn().mockResolvedValue(cart),
      clear: vi.fn().mockResolvedValue(cart),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: cartService }],
    }).compile();
    controller = module.get(CartController);
  });

  it("GET /cart reads the caller's cart", async () => {
    await expect(controller.getCart(user)).resolves.toBe(cart);
    expect(cartService.getCart).toHaveBeenCalledWith('user-1');
  });

  it('POST /cart/items adds to the caller’s cart', async () => {
    const body = { productVariantId: 'variant-1', quantity: 2 };
    await expect(controller.addItem(user, body)).resolves.toBe(cart);
    expect(cartService.addItem).toHaveBeenCalledWith('user-1', body);
  });

  it('PATCH /cart/items/:id sets the line quantity', async () => {
    await expect(
      controller.updateItem(user, { id: 'item-1' }, { quantity: 3 }),
    ).resolves.toBe(cart);
    expect(cartService.updateItem).toHaveBeenCalledWith('user-1', 'item-1', {
      quantity: 3,
    });
  });

  it('DELETE /cart/items/:id removes the line', async () => {
    await expect(controller.removeItem(user, { id: 'item-1' })).resolves.toBe(
      cart,
    );
    expect(cartService.removeItem).toHaveBeenCalledWith('user-1', 'item-1');
  });

  it('DELETE /cart empties the cart', async () => {
    await expect(controller.clear(user)).resolves.toBe(cart);
    expect(cartService.clear).toHaveBeenCalledWith('user-1');
  });
});
