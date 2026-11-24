import { Injectable } from '@nestjs/common';
import type { ActorId } from '../../../common/utils/audit.util.js';
import { ProductImage } from '../entities/product-image.entity.js';
import type { CreateProductImageInput } from '../dto/product-image.schema.js';
import { ProductImageRepository } from '../repositories/product-image.repository.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { ItemNotFoundException } from '../../../common/exceptions/base.exception.js';

@Injectable()
export class ProductImageService {
  constructor(
    private readonly productImageRepository: ProductImageRepository,
  ) {}

  create(
    data: CreateProductImageInput & { productId: string },
    actorId: ActorId,
  ): Promise<ProductImage> {
    return this.productImageRepository.create(data, actorId);
  }

  findAllByProduct(productId: string): Promise<ProductImage[]> {
    return this.productImageRepository.findAllByProduct(productId);
  }

  async findOne(id: string): Promise<ProductImage> {
    const image = await this.productImageRepository.findById(id);
    if (!image) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT_IMAGE.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.PRODUCT_IMAGE.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT_IMAGE.NOT_FOUND,
      });
    }

    return image;
  }

  async remove(id: string, actorId: ActorId): Promise<void> {
    const image = await this.findOne(id);
    // A deleted image holds no position (product_images unique key).
    image.sortOrder = null;
    await this.productImageRepository.softDelete(image, actorId);
  }
}
