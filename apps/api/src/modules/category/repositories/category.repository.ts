import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity.js';
import type { CreateCategoryInput } from '../dto/category.schema.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import { FindOptions } from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { Product } from '../../product/entities/product.entity.js';
import type { ActorId } from '../../../common/utils/audit.util.js';

@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  protected readonly entity = Category;

  findByName(name: string, options?: FindOptions): Promise<Category | null> {
    return this.findOneBy({ name }, options);
  }

  findAll(
    query: QueryParams,
    options?: FindOptions,
  ): Promise<PaginatedResult<Category>> {
    return this.paginate(query, {
      includeDeleted: options?.includeDeleted,
      search: { term: query.search, fields: ['name', 'slug'] },
    });
  }

  /** Non-deleted products in the category, whatever their status. */
  countProducts(categoryId: string): Promise<number> {
    return this.countOf(Product, { category: categoryId });
  }

  create(
    data: CreateCategoryInput & { slug: string },
    actorId: ActorId,
  ): Promise<Category> {
    return this.createAndSave({ ...data }, actorId);
  }
}
