import { Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  ProductStatus,
  VALIDATION_RULES,
} from '@repo/constants';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { InventoryMovement } from '../../order/entities/inventory-movement.entity.js';
import type { CreateProductVariantInput } from '../dto/product-variant.schema.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import type { ListOptions } from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

@Injectable()
export class ProductVariantRepository extends BaseRepository<ProductVariant> {
  protected readonly entity = ProductVariant;

  findBySku(sku: string): Promise<ProductVariant | null> {
    return this.findOneBy({ sku });
  }

  findWithProduct(id: string): Promise<ProductVariant | null> {
    return this.findOneBy(
      { id },
      { includeDeleted: true, relations: ['product'] },
    );
  }

  /**
   * Adds `quantity` (signed) to the stock in one guarded UPDATE and logs it
   * as one movement by the actor, in one transaction. The stock never goes
   * below reserved or above the max; a failed guard writes nothing.
   */
  changeStock(
    variant: ProductVariant,
    quantity: number,
    movement: {
      type: InventoryMovementType.RESTOCK | InventoryMovementType.ADJUSTMENT;
      reason: string | null;
    },
    actorId: string,
  ): Promise<InventoryMovement | 'notFound' | 'belowReserved' | 'aboveMax'> {
    const { MAX } = VALIDATION_RULES.STOCK_QUANTITY;
    return this.transactional(async () => {
      const changed = await this.incrementGuarded(
        variant.id,
        'stockQuantity',
        quantity,
        // A variant or product deleted after the caller's check is not changed.
        'deleted_at is null and exists (select 1 from products p where p.id = product_id and p.deleted_at is null) and stock_quantity + ? >= reserved_quantity and stock_quantity + ? <= ?',
        [quantity, quantity, MAX],
        actorId,
      );
      if (!changed) {
        // Deleted (the variant or its product) since the caller's check.
        const live = await this.selectIds(
          'select v.id from product_variants v join products p on p.id = v.product_id where v.id = ? and v.deleted_at is null and p.deleted_at is null',
          [variant.id],
        );
        if (live.length === 0) return 'notFound';
        const fresh = await this.reloadEntity(variant);
        return fresh && fresh.stockQuantity + quantity > MAX
          ? 'aboveMax'
          : 'belowReserved';
      }
      const created = this.createRelated<InventoryMovement>(
        InventoryMovement.name,
        {
          productVariant: variant,
          type: movement.type,
          quantity,
          reason: movement.reason,
          createdBy: actorId,
        },
      );
      await this.save(variant, actorId);
      return created;
    });
  }

  /** A variant's ledger, newest first, with each movement's order and admin. */
  findMovements(
    variantId: string,
    query: QueryParams,
    type?: InventoryMovementType,
  ): Promise<PaginatedResult<InventoryMovement>> {
    return this.paginateOf(InventoryMovement, query, {
      where: { productVariant: variantId, ...(type && { type }) },
      relations: ['order', 'createdBy'],
      orderBy: { field: 'createdAt', direction: 'DESC' },
      includeDeleted: true,
    });
  }

  /** Null when the variant or its product is soft-deleted. */
  findActiveWithProduct(id: string): Promise<ProductVariant | null> {
    return this.findOneBy(
      { id, product: { deletedAt: null } },
      { relations: ['product', 'product.images'] },
    );
  }

  findManyWithProduct(ids: string[]): Promise<ProductVariant[]> {
    return this.findMany({
      where: { id: ids },
      includeDeleted: true,
      relations: ['product'],
    });
  }

  reserve(id: string, quantity: number, actorId: ActorId): Promise<boolean> {
    return this.incrementGuarded(
      id,
      'reservedQuantity',
      quantity,
      'stock_quantity - reserved_quantity >= ?',
      [quantity],
      actorId,
    );
  }

  /** Gives back `quantity` held units; false when fewer are held. */
  release(id: string, quantity: number, actorId: ActorId): Promise<boolean> {
    return this.incrementGuarded(
      id,
      'reservedQuantity',
      -quantity,
      'reserved_quantity >= ?',
      [quantity],
      actorId,
    );
  }

  async sell(id: string, quantity: number, actorId: ActorId): Promise<boolean> {
    if (!(await this.release(id, quantity, actorId))) return false;
    return this.incrementGuarded(
      id,
      'stockQuantity',
      -quantity,
      'stock_quantity - ? >= reserved_quantity',
      [quantity],
      actorId,
    );
  }

  reload(variant: ProductVariant): Promise<ProductVariant | null> {
    return this.reloadEntity(variant);
  }

  async lockByIds(ids: string[]): Promise<ProductVariant[]> {
    const locked: ProductVariant[] = [];
    for (const id of [...ids].sort()) {
      const variant = await this.findOneForUpdate({ id });
      if (variant) locked.push(variant);
    }
    return locked;
  }

  /** Non-deleted variants of non-deleted products, for the Inventory list. */
  findInventoryPage(
    query: QueryParams,
    filters: {
      search?: string;
      lowStock: boolean;
      activeOnly: boolean;
      sort: 'availableQuantity' | 'stockQuantity' | 'sku';
      order: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedResult<ProductVariant>> {
    const where: ListOptions<ProductVariant>['where'] = {
      product: {
        deletedAt: null,
        ...(filters.activeOnly && { status: ProductStatus.ACTIVE }),
      },
    };
    if (filters.lowStock) {
      where.availableQuantity = {
        $lte: VALIDATION_RULES.INVENTORY.LOW_STOCK_THRESHOLD,
      };
    }

    return this.paginate(query, {
      where,
      search: { term: filters.search, fields: ['product.name', 'sku'] },
      relations: ['product', 'product.images'],
      orderBy: { field: filters.sort, direction: filters.order },
    });
  }

  findAllByProduct(productId: string): Promise<ProductVariant[]> {
    return this.findMany({ where: { product: productId } });
  }

  create(
    data: CreateProductVariantInput & { productId: string },
    actorId: ActorId,
  ): Promise<ProductVariant> {
    return this.createAndSave(
      {
        product: data.productId,
        sku: data.sku,
        size: data.size,
        unit: data.unit,
        price: data.price,
        discountType: data.discountType ?? null,
        discountValue: data.discountValue ?? null,
        stockQuantity: data.stockQuantity,
      },
      actorId,
    );
  }
}
