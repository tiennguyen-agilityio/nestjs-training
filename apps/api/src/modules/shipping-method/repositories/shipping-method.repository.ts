import { Injectable } from '@nestjs/common';
import { ProductSortBy, ShippingMethodStatus } from '@repo/constants';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import type { ShippingMethodFilters } from '../dto/shipping-method.schema.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import type {
  FindOptions,
  ListOptions,
  OrderByOptions,
} from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { escapeLikePattern } from '../../../common/utils/like-pattern.util.js';
import type { ActorId } from '../../../common/utils/audit.util.js';

const ORDER_BY: Record<ProductSortBy, OrderByOptions<ShippingMethod>> = {
  [ProductSortBy.NAME_ASC]: { field: 'name', direction: 'ASC' },
  [ProductSortBy.NAME_DESC]: { field: 'name', direction: 'DESC' },
  [ProductSortBy.PRICE_ASC]: { field: 'price', direction: 'ASC' },
  [ProductSortBy.PRICE_DESC]: { field: 'price', direction: 'DESC' },
};

@Injectable()
export class ShippingMethodRepository extends BaseRepository<ShippingMethod> {
  protected readonly entity = ShippingMethod;

  /** Case-insensitive exact match: the name's LIKE characters are escaped. */
  findByName(
    name: string,
    options?: FindOptions,
  ): Promise<ShippingMethod | null> {
    return this.findOneBy(
      { name: { $ilike: escapeLikePattern(name) } },
      options,
    );
  }

  findAll(
    query: QueryParams,
    { status, sortBy }: ShippingMethodFilters,
    options?: FindOptions,
  ): Promise<PaginatedResult<ShippingMethod>> {
    const where: ListOptions<ShippingMethod>['where'] = {};
    if (status) {
      where.status = status;
      where.deletedAt = null;
    }

    return this.paginate(query, {
      where,
      search: { term: query.search, fields: ['name', 'description'] },
      includeDeleted: options?.includeDeleted,
      orderBy: sortBy ? ORDER_BY[sortBy] : undefined,
    });
  }

  create(
    data: {
      name: string;
      description: string;
      price: string;
      status?: ShippingMethodStatus;
    },
    actorId: ActorId,
  ): Promise<ShippingMethod> {
    return this.createAndSave({ ...data }, actorId);
  }
}
