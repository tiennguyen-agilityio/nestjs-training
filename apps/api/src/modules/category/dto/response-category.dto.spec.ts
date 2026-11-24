import { ResponseCategoryDto } from './response-category.dto.js';
import type { Category } from '../entities/category.entity.js';

describe('ResponseCategoryDto', () => {
  const category = {
    id: 'category-id-1',
    name: 'Espresso',
    slug: 'espresso',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: 'admin-1',
    updatedBy: 'admin-2',
    deletedBy: null,
  } as Category;

  it('includes the audit ids with withAudit', () => {
    expect(
      ResponseCategoryDto.fromEntity(category, { withAudit: true }),
    ).toMatchObject({
      createdBy: 'admin-1',
      updatedBy: 'admin-2',
      deletedBy: null,
    });
  });

  it('has no audit keys without withAudit', () => {
    const json = JSON.parse(
      JSON.stringify(ResponseCategoryDto.fromEntity(category)),
    ) as Record<string, unknown>;

    expect(json).not.toHaveProperty('createdBy');
    expect(json).not.toHaveProperty('updatedBy');
    expect(json).not.toHaveProperty('deletedBy');
  });
});
