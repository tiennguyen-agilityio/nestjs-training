import { Injectable } from '@nestjs/common';
import { ProductVariant } from '../entities/product-variant.entity.js';
import type { CreateProductVariantInput } from '../dto/product-variant.schema.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
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
