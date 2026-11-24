import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { CartService } from './cart.service.js';
import { CartRepository } from '../repositories/cart.repository.js';
import { CartItemRepository } from '../repositories/cart-item.repository.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ResponseCartDto } from '../dto/response-cart.dto.js';
import type { Cart } from '../entities/cart.entity.js';
import type { CartItem } from '../entities/cart-item.entity.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import {
  DomainException,
  InvalidStateException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const USER_ID = 'user-1';
const CART_ID = 'cart-1';
const VARIANT_ID = 'variant-1';
const ITEM_ID = 'item-1';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: Record<
    | 'transactional'
    | 'findByUserWithItems'
    | 'lockByUser'
    | 'lockOrCreateForUser'
    | 'save',
    Mock
  >;
  let cartItemRepository: Record<
    | 'findInCart'
    | 'findByVariant'
    | 'create'
    | 'save'
    | 'deleteById'
    | 'deleteByCart',
    Mock
  >;
  let productVariantService: { findPurchasable: Mock };
  let fromEntity: Mock;
  const readBack = { id: CART_ID } as Cart;
  const response = { id: CART_ID } as ResponseCartDto;

  const variant = (stockQuantity: number): ProductVariant =>
    ({ id: VARIANT_ID, stockQuantity }) as ProductVariant;

  const line = (quantity: number): CartItem =>
    ({
      id: ITEM_ID,
      quantity,
      productVariant: { id: VARIANT_ID },
    }) as CartItem;

  const errorOf = async (promise: Promise<unknown>): Promise<DomainException> =>
    (await promise.catch((caught: unknown) => caught)) as DomainException;

  beforeEach(async () => {
    cartRepository = {
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
      findByUserWithItems: vi.fn().mockResolvedValue(readBack),
      lockByUser: vi.fn().mockResolvedValue({ id: CART_ID }),
      lockOrCreateForUser: vi.fn().mockResolvedValue({ id: CART_ID }),
      save: vi.fn(),
    };
    cartItemRepository = {
      findInCart: vi.fn(),
      findByVariant: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      save: vi.fn(),
      deleteById: vi.fn(),
      deleteByCart: vi.fn(),
    };
    productVariantService = {
      findPurchasable: vi.fn().mockResolvedValue(variant(10)),
    };
    fromEntity = vi
      .spyOn(ResponseCartDto, 'fromEntity')
      .mockReturnValue(response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: cartRepository },
        { provide: CartItemRepository, useValue: cartItemRepository },
        { provide: ProductVariantService, useValue: productVariantService },
      ],
    }).compile();
    service = module.get(CartService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getCart returns the empty cart without a cart row', async () => {
    cartRepository.findByUserWithItems.mockResolvedValue(null);

    await expect(service.getCart(USER_ID)).resolves.toEqual(
      ResponseCartDto.empty(USER_ID),
    );
  });

  it('getCart returns the cart read with its items', async () => {
    await expect(service.getCart(USER_ID)).resolves.toBe(response);
    expect(fromEntity).toHaveBeenCalledWith(readBack);
  });

  it('addItem creates the cart on the first add', async () => {
    await expect(
      service.addItem(USER_ID, { productVariantId: VARIANT_ID, quantity: 2 }),
    ).resolves.toBe(response);

    expect(cartRepository.transactional).toHaveBeenCalled();
    expect(cartRepository.lockOrCreateForUser).toHaveBeenCalledWith(USER_ID);
    expect(productVariantService.findPurchasable).toHaveBeenCalledWith(
      VARIANT_ID,
      'productVariantId',
    );
    expect(cartItemRepository.create).toHaveBeenCalledWith(
      CART_ID,
      VARIANT_ID,
      2,
    );
  });

  it('addItem adds to an existing line', async () => {
    const existing = line(2);
    cartItemRepository.findByVariant.mockResolvedValue(existing);

    await service.addItem(USER_ID, {
      productVariantId: VARIANT_ID,
      quantity: 1,
    });

    expect(existing.quantity).toBe(3);
    expect(cartItemRepository.save).toHaveBeenCalledWith(existing);
    expect(cartItemRepository.create).not.toHaveBeenCalled();
  });

  it('addItem rejects a line above the stock', async () => {
    productVariantService.findPurchasable.mockResolvedValue(variant(3));
    const existing = line(3);
    cartItemRepository.findByVariant.mockResolvedValue(existing);

    const error = await errorOf(
      service.addItem(USER_ID, { productVariantId: VARIANT_ID, quantity: 1 }),
    );

    expect(error).toBeInstanceOf(InvalidStateException);
    expect(error.getErrors()[0]).toEqual({
      errCode: ERROR_CODES.CART.OUT_OF_STOCK,
      field: 'quantity',
      message: 'Only 3 left for this variant',
      description: 'No more of this variant can be added.',
    });
    expect(existing.quantity).toBe(3);
    expect(cartItemRepository.save).not.toHaveBeenCalled();
    expect(cartItemRepository.create).not.toHaveBeenCalled();
  });

  it('addItem says how many more can be added', async () => {
    productVariantService.findPurchasable.mockResolvedValue(variant(5));
    cartItemRepository.findByVariant.mockResolvedValue(line(3));

    const error = await errorOf(
      service.addItem(USER_ID, { productVariantId: VARIANT_ID, quantity: 4 }),
    );

    expect(error.getErrors()[0].description).toBe('You can add 2 more.');
  });

  it('addItem rejects a variant that is not purchasable', async () => {
    const notFound = new ItemNotFoundException({
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'productVariantId',
      message: 'Product variant not found',
      description: '',
    });
    productVariantService.findPurchasable.mockRejectedValue(notFound);

    await expect(
      service.addItem(USER_ID, { productVariantId: VARIANT_ID, quantity: 1 }),
    ).rejects.toBe(notFound);
    expect(cartItemRepository.create).not.toHaveBeenCalled();
  });

  it('updateItem sets the quantity', async () => {
    const existing = line(1);
    cartItemRepository.findInCart.mockResolvedValue(existing);

    await expect(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 4 }),
    ).resolves.toBe(response);

    expect(cartRepository.lockByUser).toHaveBeenCalledWith(USER_ID);
    expect(cartItemRepository.findInCart).toHaveBeenCalledWith(
      CART_ID,
      ITEM_ID,
    );
    expect(productVariantService.findPurchasable).toHaveBeenCalledWith(
      VARIANT_ID,
      'id',
    );
    expect(existing.quantity).toBe(4);
    expect(cartItemRepository.save).toHaveBeenCalledWith(existing);
  });

  it('updateItem rejects a quantity above the stock', async () => {
    cartItemRepository.findInCart.mockResolvedValue(line(1));

    productVariantService.findPurchasable.mockResolvedValue(variant(2));
    const above = await errorOf(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 3 }),
    );
    expect(above).toBeInstanceOf(InvalidStateException);
    expect(above.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.CART.OUT_OF_STOCK,
      field: 'quantity',
      message: 'Only 2 left for this variant',
      description: 'Lower the quantity to 2 or less.',
    });

    productVariantService.findPurchasable.mockResolvedValue(variant(0));
    const none = await errorOf(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 1 }),
    );
    expect(none.getErrors()[0].description).toBe(
      'This variant is out of stock; remove it from the cart.',
    );
    expect(cartItemRepository.save).not.toHaveBeenCalled();
  });

  it("updateItem is not found for a line outside the caller's cart", async () => {
    cartItemRepository.findInCart.mockResolvedValue(null);

    const error = await errorOf(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 1 }),
    );

    expect(error).toBeInstanceOf(ItemNotFoundException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.CART_ITEM.NOT_FOUND,
      field: 'id',
    });
  });

  it('updateItem is not found for a user without a cart', async () => {
    cartRepository.lockByUser.mockResolvedValue(null);

    const error = await errorOf(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 1 }),
    );

    expect(error.getErrors()[0].errCode).toBe(ERROR_CODES.CART_ITEM.NOT_FOUND);
    expect(cartRepository.lockOrCreateForUser).not.toHaveBeenCalled();
  });

  it('updateItem is not found for a line whose product is no longer purchasable', async () => {
    cartItemRepository.findInCart.mockResolvedValue(line(1));
    const notFound = new ItemNotFoundException({
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
      message: 'Product variant not found',
      description: '',
    });
    productVariantService.findPurchasable.mockRejectedValue(notFound);

    await expect(
      service.updateItem(USER_ID, ITEM_ID, { quantity: 1 }),
    ).rejects.toBe(notFound);
  });

  it('removeItem deletes the line', async () => {
    cartItemRepository.findInCart.mockResolvedValue(line(1));

    await expect(service.removeItem(USER_ID, ITEM_ID)).resolves.toBe(response);
    expect(cartItemRepository.deleteById).toHaveBeenCalledWith(ITEM_ID);
  });

  it("removeItem is not found for a line outside the caller's cart", async () => {
    cartItemRepository.findInCart.mockResolvedValue(null);

    const error = await errorOf(service.removeItem(USER_ID, ITEM_ID));

    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.CART_ITEM.NOT_FOUND,
      field: 'id',
    });
    expect(cartItemRepository.deleteById).not.toHaveBeenCalled();
  });

  it('clear deletes every line', async () => {
    await expect(service.clear(USER_ID)).resolves.toBe(response);
    expect(cartItemRepository.deleteByCart).toHaveBeenCalledWith(CART_ID);
  });

  it('clear on a user without a cart returns the empty cart', async () => {
    cartRepository.lockByUser.mockResolvedValue(null);
    cartRepository.findByUserWithItems.mockResolvedValue(null);

    await expect(service.clear(USER_ID)).resolves.toEqual(
      ResponseCartDto.empty(USER_ID),
    );
    expect(cartRepository.lockOrCreateForUser).not.toHaveBeenCalled();
    expect(cartItemRepository.deleteByCart).not.toHaveBeenCalled();
  });

  describe("a write moves the cart's updatedAt", () => {
    const since = new Date('2026-01-01T00:00:00Z');
    let locked: Cart;

    beforeEach(() => {
      locked = { id: CART_ID, updatedAt: since } as Cart;
      cartRepository.lockOrCreateForUser.mockResolvedValue(locked);
      cartRepository.lockByUser.mockResolvedValue(locked);
      cartItemRepository.findInCart.mockResolvedValue(line(1));
    });

    const expectTouched = (): void => {
      expect(locked.updatedAt.getTime()).toBeGreaterThan(since.getTime());
      expect(cartRepository.save).toHaveBeenCalledWith(locked);
    };

    it('addItem touches the cart', async () => {
      await service.addItem(USER_ID, {
        productVariantId: VARIANT_ID,
        quantity: 1,
      });
      expectTouched();
    });

    it('updateItem touches the cart', async () => {
      await service.updateItem(USER_ID, ITEM_ID, { quantity: 2 });
      expectTouched();
    });

    it('removeItem touches the cart', async () => {
      await service.removeItem(USER_ID, ITEM_ID);
      expectTouched();
    });

    it('clear touches the cart', async () => {
      await service.clear(USER_ID);
      expectTouched();
    });

    it('a rejected write leaves the cart untouched', async () => {
      productVariantService.findPurchasable.mockResolvedValue(variant(0));
      await service
        .addItem(USER_ID, { productVariantId: VARIANT_ID, quantity: 1 })
        .catch(() => undefined);
      expect(locked.updatedAt).toBe(since);
      expect(cartRepository.save).not.toHaveBeenCalled();
    });
  });
});
