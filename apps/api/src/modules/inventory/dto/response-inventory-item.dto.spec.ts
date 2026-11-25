import { Collection } from '@mikro-orm/core';
import { ProductStatus, ProductUnit, StockLevel } from '@repo/constants';
import { ResponseInventoryItemDto } from './response-inventory-item.dto.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { Product } from '../../product/entities/product.entity.js';
import { ProductImage } from '../../product-image/entities/product-image.entity.js';

const variantOf = (stock: number, reserved: number): ProductVariant => {
  const product = Object.assign(new Product(), {
    id: 'product-1',
    name: 'Kenya AA',
    slug: 'kenya-aa',
    status: ProductStatus.ACTIVE,
  });
  product.images = new Collection<ProductImage>(product, [
    Object.assign(new ProductImage(), {
      url: 'https://example.com/side.jpg',
      isPrimary: false,
    }),
    Object.assign(new ProductImage(), {
      url: 'https://example.com/hero.jpg',
      isPrimary: true,
    }),
  ]);
  return Object.assign(new ProductVariant(), {
    id: 'variant-1',
    product,
    sku: 'KEN-250',
    size: '250.00',
    unit: ProductUnit.G,
    price: '12.00',
    stockQuantity: stock,
    reservedQuantity: reserved,
    availableQuantity: stock - reserved,
  });
};

describe('ResponseInventoryItemDto', () => {
  it('ResponseInventoryItemDto adds reserved, available, level and the product', () => {
    const dto = ResponseInventoryItemDto.fromEntity(variantOf(9, 4));

    expect(dto).toMatchObject({
      id: 'variant-1',
      sku: 'KEN-250',
      name: '250g',
      stockQuantity: 9,
      reservedQuantity: 4,
      availableQuantity: 5,
      stockLevel: StockLevel.LOW,
      product: {
        id: 'product-1',
        name: 'Kenya AA',
        slug: 'kenya-aa',
        status: ProductStatus.ACTIVE,
        primaryImageUrl: 'https://example.com/hero.jpg',
      },
    });
    expect(
      ResponseInventoryItemDto.fromEntity(variantOf(3, 3)).stockLevel,
    ).toBe(StockLevel.OUT);
  });
});
