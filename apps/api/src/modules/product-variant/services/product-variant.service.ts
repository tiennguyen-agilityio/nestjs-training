import { Injectable } from '@nestjs/common';
import { ProductVariant } from '../entities/product-variant.entity.js';
import type { CreateProductVariantInput } from '../dto/product-variant.schema.js';
import { ProductVariantRepository } from '../repositories/product-variant.repository.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { DiscountType, ProductStatus } from '@repo/constants';
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

    return this.productVariantRepository.create({
      ...data,
      discountType: data.discountType ?? DiscountType.PERCENT,
      discountValue: data.discountValue ?? '0',
    });
  }

  findAllByProduct(productId: string): Promise<ProductVariant[]> {
    return this.productVariantRepository.findAllByProduct(productId);
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

  /**
   * A variant a shopper can buy: it and its product exist, neither is
   * deleted, and the product is ACTIVE. Anything else reads as not found on
   * `field`, so a Draft product is never revealed (cart AC4).
   */
  async findPurchasable(id: string, field: string): Promise<ProductVariant> {
    const variant = await this.productVariantRepository.findWithProduct(id);
    const product = variant?.product;
    if (
      !variant ||
      variant.deletedAt ||
      !product ||
      product.deletedAt ||
      (product.status as ProductStatus) !== ProductStatus.ACTIVE
    ) {
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
    await this.productVariantRepository.save(variant);

    return variant;
  }

  async remove(id: string): Promise<void> {
    const variant = await this.findOne(id);
    await this.productVariantRepository.softDelete(variant);
  }
}
