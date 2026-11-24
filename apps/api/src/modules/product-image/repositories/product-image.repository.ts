import { Injectable } from '@nestjs/common';
import { ProductImage } from '../entities/product-image.entity.js';
import type { CreateProductImageInput } from '../dto/product-image.schema.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

@Injectable()
export class ProductImageRepository extends BaseRepository<ProductImage> {
  protected readonly entity = ProductImage;

  findAllByProduct(productId: string): Promise<ProductImage[]> {
    return this.findMany({ where: { product: productId } });
  }

  create(
    data: CreateProductImageInput & { productId: string },
    actorId: ActorId,
  ): Promise<ProductImage> {
    return this.createAndSave(
      {
        product: data.productId,
        url: data.url,
        isPrimary: data.isPrimary,
        sortOrder: data.sortOrder,
      },
      actorId,
    );
  }
}
