import { Injectable } from '@nestjs/common';
import type { ActorId } from '../../../common/utils/audit.util.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import type { CreateProductVariantInput } from '../dto/product-variant.schema.js';
import { ProductVariantRepository } from '../repositories/product-variant.repository.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { DiscountType } from '@repo/constants';
import { isPurchasable } from '../utils/purchasable.util.js';
import { assignDefinedFields } from '../../../common/utils/object.util.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';

@Injectable()
export class ProductVariantService {
  constructor(
    private readonly productVariantRepository: ProductVariantRepository,
  ) {}

  async create(
    data: CreateProductVariantInput & { productId: string },
    actorId: ActorId,
  ): Promise<ProductVariant> {
    const existing = await this.productVariantRepository.findBySku(data.sku);
    if (existing) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.SKU_EXISTS,
        field: 'sku',
        message: ERROR_MESSAGES.PRODUCT_VARIANT.SKU_EXISTS,
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.SKU_EXISTS,
      });
    }

    return this.productVariantRepository.create(
      {
        ...data,
        discountType: data.discountType ?? DiscountType.PERCENT,
        discountValue: data.discountValue ?? '0',
      },
      actorId,
    );
  }

  findAllByProduct(productId: string): Promise<ProductVariant[]> {
    return this.productVariantRepository.findAllByProduct(productId);
  }

  findManyWithProduct(ids: string[]): Promise<ProductVariant[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.productVariantRepository.findManyWithProduct(ids);
  }

  reserve(id: string, quantity: number, actorId: ActorId): Promise<boolean> {
    return this.productVariantRepository.reserve(id, quantity, actorId);
  }

  release(id: string, quantity: number, actorId: ActorId): Promise<boolean> {
    return this.productVariantRepository.release(id, quantity, actorId);
  }

  reload(variant: ProductVariant): Promise<ProductVariant | null> {
    return this.productVariantRepository.reload(variant);
  }

  lockByIds(ids: string[]): Promise<ProductVariant[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.productVariantRepository.lockByIds(ids);
  }

  findInventoryPage(
    ...args: Parameters<ProductVariantRepository['findInventoryPage']>
  ): ReturnType<ProductVariantRepository['findInventoryPage']> {
    return this.productVariantRepository.findInventoryPage(...args);
  }

  findMovements(
    ...args: Parameters<ProductVariantRepository['findMovements']>
  ): ReturnType<ProductVariantRepository['findMovements']> {
    return this.productVariantRepository.findMovements(...args);
  }

  changeStock(
    ...args: Parameters<ProductVariantRepository['changeStock']>
  ): ReturnType<ProductVariantRepository['changeStock']> {
    return this.productVariantRepository.changeStock(...args);
  }

  /** A variant whose product is not deleted either, with the product and its images; else 404. */
  async findActive(id: string): Promise<ProductVariant> {
    const variant =
      await this.productVariantRepository.findActiveWithProduct(id);
    if (!variant) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
      });
    }

    return variant;
  }

  async findOne(id: string): Promise<ProductVariant> {
    const variant = await this.productVariantRepository.findById(id);
    if (!variant) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
      });
    }

    return variant;
  }

  async findPurchasable(id: string, field: string): Promise<ProductVariant> {
    const variant = await this.productVariantRepository.findWithProduct(id);
    if (!isPurchasable(variant)) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field,
        message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
      });
    }

    return variant;
  }

  async update(
    id: string,
    data: Partial<CreateProductVariantInput>,
    actorId: ActorId,
  ): Promise<ProductVariant> {
    const variant = await this.findOne(id);

    if (data.sku !== undefined && data.sku !== variant.sku) {
      const existing = await this.productVariantRepository.findBySku(data.sku);
      if (existing && existing.id !== id) {
        throw new DuplicateResourceException({
          errCode: ERROR_CODES.PRODUCT_VARIANT.SKU_EXISTS,
          field: 'sku',
          message: ERROR_MESSAGES.PRODUCT_VARIANT.SKU_EXISTS,
          description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.SKU_EXISTS,
        });
      }
    }

    assignDefinedFields(variant, data);
    await this.productVariantRepository.save(variant, actorId);

    return variant;
  }

  async remove(id: string, actorId: ActorId): Promise<void> {
    const variant = await this.findOne(id);
    await this.productVariantRepository.softDelete(variant, actorId);
  }
}
