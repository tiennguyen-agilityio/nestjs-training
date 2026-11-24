import { ResponseProductImageDto } from './response-product-image.dto.js';
import type { ProductImage } from '../entities/product-image.entity.js';

const image = (overrides: Partial<ProductImage>): ProductImage =>
  ({
    id: 'image-id-1',
    url: 'https://example.com/a.jpg',
    isPrimary: true,
    sortOrder: 3,
    ...overrides,
  }) as ProductImage;

describe('ResponseProductImageDto', () => {
  it('fromEntity maps every field', () => {
    expect(ResponseProductImageDto.fromEntity(image({}))).toEqual({
      id: 'image-id-1',
      url: 'https://example.com/a.jpg',
      isPrimary: true,
      sortOrder: 3,
    });
  });

  it('fromEntity maps a null sortOrder to 0', () => {
    expect(
      ResponseProductImageDto.fromEntity(image({ sortOrder: null })),
    ).toMatchObject({ sortOrder: 0 });
  });
});
