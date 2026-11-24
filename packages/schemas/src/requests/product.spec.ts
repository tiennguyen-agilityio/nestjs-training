import { DiscountType, ProductUnit, RoastLevel } from '@repo/constants';
import { productBodySchema, updateProductSchema } from './product.js';

const image = { url: 'https://example.com/a.png', isPrimary: true };
const otherImage = { url: 'https://example.com/b.png', isPrimary: false };

const product = {
  categoryId: '7d5b1c1e-1d2f-4c6a-9b1e-2f3a4b5c6d7e',
  name: 'Single Origin',
  description: 'Bright and floral',
  roastLevel: RoastLevel.LIGHT,
  origin: 'Ethiopia',
  processingMethod: 'Washed',
  images: [image, otherImage],
  variants: [
    {
      sku: 'SKU-001',
      size: 250,
      unit: ProductUnit.G,
      price: 12.5,
      discountType: DiscountType.PERCENT,
      discountValue: 10,
    },
  ],
};

describe('productBodySchema', () => {
  it('accepts a valid product', () => {
    expect(productBodySchema.safeParse(product).success).toBe(true);
  });

  it('leaves the primary-image rule to the API', () => {
    expect(
      productBodySchema.safeParse({ ...product, images: [image, image] })
        .success,
    ).toBe(true);
  });
});

describe('updateProductSchema', () => {
  it('accepts an empty body and a null tastingNotes', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(true);
    expect(updateProductSchema.safeParse({ tastingNotes: null }).success).toBe(
      true,
    );
  });

  it('rejects a null description', () => {
    expect(updateProductSchema.safeParse({ description: null }).success).toBe(
      false,
    );
  });

  it('accepts updateVariants', () => {
    expect(
      updateProductSchema.safeParse({
        updateVariants: [
          { id: '7d5b1c1e-1d2f-4c6a-9b1e-2f3a4b5c6d7e', price: 120 },
        ],
      }).success,
    ).toBe(true);
  });
});
