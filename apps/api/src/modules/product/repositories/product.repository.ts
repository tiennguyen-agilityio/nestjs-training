import { Injectable } from '@nestjs/common';
import { Product } from '../entities/product.entity.js';
import {
  type CreateProductInput,
  type ProductFilters,
} from '../dto/product.schema.js';
import { ProductSortBy } from '@repo/constants';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import {
  FindOptions,
  ListOptions,
} from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { pricingOf } from '../../cart/utils/cart-pricing.util.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';

const RELATIONS = ['images', 'variants'];

const salePriceOf = (variant: ProductVariant): number =>
  pricingOf(variant).salePrice;

const minVariantPrice = (product: Product): number => {
  const prices = product.variants.getItems().map(salePriceOf);
  return prices.length > 0 ? Math.min(...prices) : Number.POSITIVE_INFINITY;
};

@Injectable()
export class ProductRepository extends BaseRepository<Product> {
  protected readonly entity = Product;

  override findById(
    id: string,
    options?: FindOptions,
  ): Promise<Product | null> {
    return this.findOneBy({ id }, { ...options, relations: RELATIONS });
  }

  findByName(name: string, options?: FindOptions): Promise<Product | null> {
    return this.findOneBy({ name }, options);
  }

  async findAll(
    query: QueryParams,
    filters: ProductFilters = {},
    options?: FindOptions,
  ): Promise<PaginatedResult<Product>> {
    const { page, limit, search } = query;
    const { categoryId, status, roastLevel, minPrice, maxPrice, sortBy } =
      filters;

    const where: ListOptions<Product>['where'] = {};
    if (categoryId) where.category = categoryId;
    if (status) where.status = status;
    if (roastLevel && roastLevel.length > 0) where.roastLevel = roastLevel;

    const listOptions: ListOptions<Product> = {
      where,
      search: { term: search, fields: ['name', 'slug'] },
      includeDeleted: options?.includeDeleted,
      relations: RELATIONS,
      orderBy:
        sortBy === ProductSortBy.NAME_ASC
          ? { field: 'name', direction: 'ASC' }
          : sortBy === ProductSortBy.NAME_DESC
            ? { field: 'name', direction: 'DESC' }
            : undefined,
    };

    const needsPricePass =
      minPrice !== undefined ||
      maxPrice !== undefined ||
      sortBy === ProductSortBy.PRICE_ASC ||
      sortBy === ProductSortBy.PRICE_DESC;

    if (!needsPricePass) {
      return this.paginate(query, listOptions);
    }

    let candidates = await this.findMany({
      ...listOptions,
      orderBy: listOptions.orderBy ?? { field: 'createdAt', direction: 'DESC' },
    });

    if (minPrice !== undefined || maxPrice !== undefined) {
      candidates = candidates.filter((product) =>
        product.variants.getItems().some((variant) => {
          const price = salePriceOf(variant);
          return (
            (minPrice === undefined || price >= minPrice) &&
            (maxPrice === undefined || price <= maxPrice)
          );
        }),
      );
    }

    if (
      sortBy === ProductSortBy.PRICE_ASC ||
      sortBy === ProductSortBy.PRICE_DESC
    ) {
      const direction = sortBy === ProductSortBy.PRICE_ASC ? 1 : -1;
      candidates = [...candidates].sort((a, b) => {
        const priceA = minVariantPrice(a);
        const priceB = minVariantPrice(b);
        if (priceA === priceB) return 0;
        if (priceA === Number.POSITIVE_INFINITY) return 1;
        if (priceB === Number.POSITIVE_INFINITY) return -1;
        return (priceA - priceB) * direction;
      });
    }

    const offset = (page - 1) * limit;

    return this.toPaginatedResult(
      candidates.slice(offset, offset + limit),
      candidates.length,
      query,
    );
  }

  create(
    data: Omit<CreateProductInput, 'images' | 'variants'> & { slug: string },
    actorId: ActorId,
  ): Promise<Product> {
    return this.createAndSave(
      {
        category: data.categoryId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        roastLevel: data.roastLevel ?? null,
        isOrganic: data.isOrganic,
        isFairTrade: data.isFairTrade,
        status: data.status,
        tastingNotes: data.tastingNotes ?? null,
        origin: data.origin ?? null,
        processingMethod: data.processingMethod ?? null,
      },
      actorId,
    );
  }
}
