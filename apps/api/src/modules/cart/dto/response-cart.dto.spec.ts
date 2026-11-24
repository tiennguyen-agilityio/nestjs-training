import { Collection } from '@mikro-orm/core';
import { DiscountType, ProductStatus, ProductUnit } from '@repo/constants';
import { Cart } from '../entities/cart.entity.js';
import { CartItem } from '../entities/cart-item.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { ProductImage } from '../../product-image/entities/product-image.entity.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { ResponseCartDto } from './response-cart.dto.js';

const image = (url: string, isPrimary: boolean, deleted = false) =>
  Object.assign(new ProductImage(), {
    url,
    isPrimary,
    deletedAt: deleted ? new Date() : null,
  });

const product = (
  overrides: Partial<Product> = {},
  images: ProductImage[] = [image('https://example.com/p.jpg', true)],
): Product => {
  const entity = Object.assign(new Product(), {
    name: 'Huila',
    slug: 'huila',
    status: ProductStatus.ACTIVE,
    ...overrides,
  });
  entity.images = new Collection<ProductImage>(entity, images);
  return entity;
};

const variant = (overrides: Partial<ProductVariant> = {}): ProductVariant =>
  Object.assign(new ProductVariant(), {
    sku: 'HUI-250',
    size: '250.00',
    unit: ProductUnit.G,
    price: '12.00',
    discountType: null,
    discountValue: null,
    stockQuantity: 10,
    product: product(),
    ...overrides,
  });

const line = (productVariant: ProductVariant, quantity: number): CartItem =>
  Object.assign(new CartItem(), { productVariant, quantity });

const cartWith = (...items: CartItem[]): Cart => {
  const cart = Object.assign(new Cart(), {
    user: Object.assign(new User(), { id: 'user-1' }),
  });
  cart.items = new Collection<CartItem>(cart, items);
  return cart;
};

describe('ResponseCartDto', () => {
  it("reads the variant's current price", () => {
    const dto = ResponseCartDto.fromEntity(cartWith(line(variant(), 2)));

    expect(dto.items[0].variant.price).toBe(12);
    expect(dto.items[0].lineTotal).toBe(24);
  });

  it('works out the line totals, subtotal and total quantity', () => {
    const discounted = variant({
      price: '20.00',
      discountType: DiscountType.PERCENT,
      discountValue: '10.00',
    });
    const dto = ResponseCartDto.fromEntity(
      cartWith(line(variant(), 2), line(discounted, 3)),
    );

    expect(dto.items.map((item) => item.lineTotal)).toEqual([24, 54]);
    expect(dto.items[1].variant.salePrice).toBe(18);
    expect(dto.subTotal).toBe(78);
    expect(dto.totalQuantity).toBe(5);
    expect(dto.userId).toBe('user-1');
  });

  it('flags a line below its quantity', () => {
    const [item] = ResponseCartDto.fromEntity(
      cartWith(line(variant({ stockQuantity: 1 }), 2)),
    ).items;

    expect(item.inStock).toBe(false);
    expect(item.variant.availableQuantity).toBe(1);
    expect(item.isAvailable).toBe(true);
  });

  it('flags a line whose product is not ACTIVE or was deleted', () => {
    const isAvailable = (productVariant: ProductVariant): boolean =>
      ResponseCartDto.fromEntity(cartWith(line(productVariant, 1))).items[0]
        .isAvailable;

    expect(
      isAvailable(
        variant({ product: product({ status: ProductStatus.DRAFT }) }),
      ),
    ).toBe(false);
    expect(
      isAvailable(variant({ product: product({ deletedAt: new Date() }) })),
    ).toBe(false);
    expect(isAvailable(variant({ deletedAt: new Date() }))).toBe(false);
    expect(isAvailable(variant())).toBe(true);
  });

  it('takes the primary image that is not deleted', () => {
    const urlOf = (images: ProductImage[]): string | null =>
      ResponseCartDto.fromEntity(
        cartWith(line(variant({ product: product({}, images) }), 1)),
      ).items[0].product.primaryImageUrl;

    expect(
      urlOf([
        image('https://example.com/old.jpg', true, true),
        image('https://example.com/new.jpg', true),
      ]),
    ).toBe('https://example.com/new.jpg');
    expect(
      urlOf([image('https://example.com/old.jpg', true, true)]),
    ).toBeNull();
  });

  it('names the size', () => {
    const [item] = ResponseCartDto.fromEntity(
      cartWith(line(variant(), 1)),
    ).items;

    expect(item.variant.sizeName).toBe('250g');
  });

  it('empty() has no id, no items and zero totals', () => {
    expect(ResponseCartDto.empty('user-1')).toEqual(
      expect.objectContaining({
        id: null,
        userId: 'user-1',
        items: [],
        totalQuantity: 0,
        subTotal: 0,
        createdAt: null,
        updatedAt: null,
      }),
    );
  });
});
