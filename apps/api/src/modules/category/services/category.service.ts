import { Injectable } from '@nestjs/common';
import { Category } from '../entities/category.entity.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../dto/category.schema.js';
import { CategoryRepository } from '../repositories/category.repository.js';
import type { FindOptions } from '../../../common/interfaces/repository-options.interface.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { normalizeName, slugFrom } from '../../../common/utils/slug.util.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import {
  DuplicateResourceException,
  InvalidStateException,
  ItemNotFoundException,
  ResourceInUseException,
} from '../../../common/exceptions/base.exception.js';

@Injectable()
export class CategoryService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(dto: CreateCategoryInput, actorId: ActorId): Promise<Category> {
    const name = normalizeName(dto.name);
    const slug = slugFrom(name);
    const existing = await this.categoryRepository.findBySlug(slug, {
      includeDeleted: true,
    });
    if (existing) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.CATEGORY.NAME_EXISTS,
        field: 'name',
        message: ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
        description: ERROR_DESCRIPTIONS.CATEGORY.NAME_EXISTS,
      });
    }

    return this.categoryRepository.create({ name, slug }, actorId);
  }

  findAll(
    query: QueryParams,
    options?: FindOptions,
  ): Promise<PaginatedResult<Category>> {
    return this.categoryRepository.findAll(query, options);
  }

  async findOne(id: string, options?: FindOptions): Promise<Category> {
    const category = await this.categoryRepository.findById(id, options);
    if (!category) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.CATEGORY.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.CATEGORY.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.CATEGORY.NOT_FOUND,
      });
    }

    return category;
  }

  async update(
    id: string,
    dto: UpdateCategoryInput,
    actorId: ActorId,
  ): Promise<Category> {
    const category = await this.findOne(id);

    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    if (name !== undefined && name !== category.name) {
      const slug = slugFrom(name);
      const existing = await this.categoryRepository.findBySlug(slug, {
        includeDeleted: true,
      });
      if (existing && existing.id !== id) {
        throw new DuplicateResourceException({
          errCode: ERROR_CODES.CATEGORY.NAME_EXISTS,
          field: 'name',
          message: ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
          description: ERROR_DESCRIPTIONS.CATEGORY.NAME_EXISTS,
        });
      }

      category.name = name;
      category.slug = slug;
    }

    await this.categoryRepository.save(category, actorId);

    return category;
  }

  async remove(id: string, actorId: ActorId): Promise<void> {
    const category = await this.findOne(id);

    const productCount = await this.categoryRepository.countProducts(id);
    if (productCount > 0) {
      throw new ResourceInUseException({
        errCode: ERROR_CODES.CATEGORY.HAS_PRODUCTS,
        field: 'id',
        message: ERROR_MESSAGES.CATEGORY.HAS_PRODUCTS,
        description: ERROR_DESCRIPTIONS.CATEGORY.HAS_PRODUCTS,
      });
    }

    await this.categoryRepository.softDelete(category, actorId);
  }

  async restore(id: string, actorId: ActorId): Promise<Category> {
    const category = await this.findOne(id, { includeDeleted: true });

    if (category.deletedAt === null) {
      throw new InvalidStateException({
        errCode: ERROR_CODES.CATEGORY.NOT_DELETED,
        field: 'id',
        message: ERROR_MESSAGES.CATEGORY.NOT_DELETED,
        description: ERROR_DESCRIPTIONS.CATEGORY.NOT_DELETED,
      });
    }

    await this.categoryRepository.restore(category, actorId);

    return category;
  }
}
