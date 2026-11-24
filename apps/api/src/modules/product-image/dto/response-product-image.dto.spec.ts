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

  it('includes the audit ids with withAudit', () => {
    expect(
      ResponseProductImageDto.fromEntity(
        image({
          createdBy: 'admin-1',
          updatedBy: 'admin-2',
          deletedBy: null,
        }),
        { withAudit: true },
      ),
    ).toMatchObject({
      createdBy: 'admin-1',
      updatedBy: 'admin-2',
      deletedBy: null,
    });
  });

  it('has no audit keys without withAudit', () => {
    const json = JSON.parse(
      JSON.stringify(
        ResponseProductImageDto.fromEntity(image({ createdBy: 'admin-1' })),
      ),
    ) as Record<string, unknown>;

    expect(json).not.toHaveProperty('createdBy');
    expect(json).not.toHaveProperty('updatedBy');
    expect(json).not.toHaveProperty('deletedBy');
  });
});
