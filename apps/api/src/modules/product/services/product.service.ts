import { BadRequestException, Injectable } from '@nestjs/common';
import { Product } from '../entities/product.entity.js';
import { DiscountType, ProductStatus, VALIDATION_RULES } from '@repo/constants';
import {
  type CreateProductInput,
  type UpdateProductInput,
  type ProductFilters,
} from '../dto/product.schema.js';
import { ProductRepository } from '../repositories/product.repository.js';
import type { FindOptions } from '../../../common/interfaces/repository-options.interface.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { slugFrom } from '../../../common/utils/slug.util.js';
import { assignDefinedFields } from '../../../common/utils/object.util.js';
import { CategoryService } from '../../category/services/category.service.js';
import { ProductImage } from '../../product-image/entities/product-image.entity.js';
import { ProductImageService } from '../../product-image/services/product-image.service.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { findDiscountRuleViolation } from '../../product-variant/utils/discount-rule.util.js';

type VariantPatch = NonNullable<UpdateProductInput['updateVariants']>[number];

/** `activeOnly`: a product that is not ACTIVE reads as not found (shoppers). */
export interface ProductReadOptions extends FindOptions {
  activeOnly?: boolean;
}

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryService: CategoryService,
    private readonly productImageService: ProductImageService,
    private readonly productVariantService: ProductVariantService,
  ) {}

  async create(data: CreateProductInput): Promise<Product> {
    const { images = [], variants = [], ...productData } = data;

    this.assertExactlyOnePrimary(images);
    this.assertUniqueSortOrders([], new Map(), images);

    const existing = await this.productRepository.findByName(productData.name, {
      includeDeleted: true,
    });
    if (existing) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.PRODUCT.NAME_EXISTS,
        field: 'name',
        message: ERROR_MESSAGES.PRODUCT.NAME_EXISTS,
        description: ERROR_DESCRIPTIONS.PRODUCT.NAME_EXISTS,
      });
    }

    await this.categoryService.findOne(productData.categoryId);

    const product = await this.productRepository.transactional(async () => {
      const created = await this.productRepository.create({
        ...productData,
        slug: slugFrom(productData.name),
      });

      for (const image of images) {
        await this.productImageService.create({
          ...image,
          productId: created.id,
        });
      }

      for (const variant of variants) {
        await this.productVariantService.create({
          ...variant,
          productId: created.id,
        });
      }

      return created;
    });

    return images.length === 0 && variants.length === 0
      ? product
      : this.findOne(product.id);
  }

  findAll(
    query: QueryParams,
    filters: ProductFilters = {},
    options?: FindOptions,
  ): Promise<PaginatedResult<Product>> {
    return this.productRepository.findAll(query, filters, options);
  }

  async findOne(id: string, options?: ProductReadOptions): Promise<Product> {
    const { activeOnly, ...findOptions } = options ?? {};
    const product = await this.productRepository.findById(id, findOptions);
    if (
      !product ||
      (activeOnly && (product.status as ProductStatus) !== ProductStatus.ACTIVE)
    ) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.PRODUCT.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT.NOT_FOUND,
      });
    }

    return product;
  }

  async update(id: string, data: UpdateProductInput): Promise<Product> {
    return this.productRepository.transactional(async () => {
      const product = await this.findOne(id);

      if (data.name !== undefined && data.name !== product.name) {
        const existing = await this.productRepository.findByName(data.name, {
          includeDeleted: true,
        });
        if (existing && existing.id !== id) {
          throw new DuplicateResourceException({
            errCode: ERROR_CODES.PRODUCT.NAME_EXISTS,
            field: 'name',
            message: ERROR_MESSAGES.PRODUCT.NAME_EXISTS,
            description: ERROR_DESCRIPTIONS.PRODUCT.NAME_EXISTS,
          });
        }
      }

      const {
        categoryId,
        removeImageIds,
        updateImages,
        addImages,
        updateVariants,
        ...rest
      } = data;

      if (categoryId !== undefined && categoryId !== product.category.id) {
        product.category = await this.categoryService.findOne(categoryId);
      }

      const applyVariantChanges = this.checkVariantChanges(
        product,
        updateVariants,
      );

      this.applyImageChanges(product, {
        removeImageIds,
        updateImages,
        addImages,
      });

      applyVariantChanges();
      assignDefinedFields(product, rest);
      if (rest.name !== undefined) {
        product.slug = slugFrom(rest.name);
      }

      await this.productRepository.save(product);

      return product;
    });
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    product.status = ProductStatus.ARCHIVED;
    await this.productRepository.softDelete(product);
  }

  /**
   * Checks each variant patch against the product: the variant must be one of
   * its variants, and the values it would end up with (stored values, with a
   * stored null discount read as PERCENT / 0, overlaid with the patch) must
   * pass both discount rules, even when the patch leaves the discount alone.
   * Returns the step that applies the patches, so the caller changes nothing
   * until every check, images included, has passed. The resolved discount is
   * written too, so a variant stored without one is saved as PERCENT 0.
   */
  private checkVariantChanges(
    product: Product,
    updateVariants: VariantPatch[] = [],
  ): () => void {
    if (!updateVariants.length) return () => undefined;

    const variantById = new Map(
      product.variants.getItems().map((variant) => [variant.id, variant]),
    );

    const changes = updateVariants.map((patch, index) => {
      const variant = variantById.get(patch.id);
      if (!variant) {
        throw new ItemNotFoundException({
          errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
          field: `updateVariants.${index}.id`,
          message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
          description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
        });
      }

      const next = {
        price: patch.price ?? variant.price,
        discountType:
          patch.discountType ?? variant.discountType ?? DiscountType.PERCENT,
        discountValue: patch.discountValue ?? variant.discountValue ?? '0',
        quantity: patch.quantity ?? variant.quantity,
      };

      const violation = findDiscountRuleViolation(next);
      if (violation) {
        throw new ValidationException([
          {
            errCode: violation.errCode,
            field: `updateVariants.${index}.discountValue`,
            message: violation.message,
            description: violation.description,
          },
        ]);
      }

      return { variant, next };
    });

    return () => {
      for (const { variant, next } of changes) {
        Object.assign<ProductVariant, typeof next>(variant, next);
      }
    };
  }

  /**
   * Applies remove, update, then add on the product's images. The resulting
   * set is checked first (ids belong to the product, at most MAX_COUNT images,
   * exactly one primary) and only then are the images changed, so a rejected
   * request leaves the product untouched. The changes are persisted together
   * with the product by the caller's single save.
   */
  private applyImageChanges(
    product: Product,
    {
      removeImageIds = [],
      updateImages = [],
      addImages = [],
    }: Pick<
      UpdateProductInput,
      'removeImageIds' | 'updateImages' | 'addImages'
    >,
  ): void {
    if (!removeImageIds.length && !updateImages.length && !addImages.length) {
      return;
    }

    const current = product.images
      .getItems()
      .filter((image) => !image.deletedAt);
    const removing = new Set(removeImageIds);
    this.assertImagesBelong(removeImageIds, current);

    const remaining = current.filter((image) => !removing.has(image.id));
    this.assertImagesBelong(
      updateImages.map((patch) => patch.id),
      remaining,
    );

    const patchById = new Map(updateImages.map((patch) => [patch.id, patch]));

    const maxCount = VALIDATION_RULES.IMAGE.MAX_COUNT;
    if (remaining.length + addImages.length > maxCount) {
      throw new BadRequestException(
        ERROR_MESSAGES.PRODUCT.TOO_MANY_IMAGES(maxCount),
      );
    }

    const finalImages = [
      ...remaining.map((image) => ({
        isPrimary: patchById.get(image.id)?.isPrimary ?? image.isPrimary,
      })),
      ...addImages.map((data) => ({ isPrimary: data.isPrimary })),
    ];

    this.assertExactlyOnePrimary(finalImages);
    this.assertUniqueSortOrders(remaining, patchById, addImages);

    const removedAt = new Date();
    for (const image of current) {
      if (!removing.has(image.id)) continue;
      image.deletedAt = removedAt;
      // A deleted image holds no position (product_images unique key).
      image.sortOrder = null;
    }

    for (const image of remaining) {
      const patch = patchById.get(image.id);
      if (!patch) continue;
      if (patch.url !== undefined) image.url = patch.url;
      if (patch.isPrimary !== undefined) image.isPrimary = patch.isPrimary;
      if (patch.sortOrder !== undefined) image.sortOrder = patch.sortOrder;
    }

    for (const data of addImages) {
      const image = new ProductImage();
      image.product = product;
      image.url = data.url;
      image.isPrimary = data.isPrimary ?? false;
      image.sortOrder = data.sortOrder ?? 0;
      product.images.add(image);
    }
  }

  private assertUniqueSortOrders(
    remaining: ProductImage[],
    patchById: Map<string, { sortOrder?: number }>,
    addImages: Array<{ sortOrder?: number }>,
  ): void {
    const seen = new Set<number | null>();

    for (const image of remaining) {
      const effective = patchById.get(image.id)?.sortOrder ?? image.sortOrder;
      if (seen.has(effective)) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT.DUPLICATE_SORT_ORDERS,
        );
      }
      seen.add(effective);
    }

    // An added image without a sortOrder is stored at 0, so it counts as 0.
    for (const data of addImages) {
      const order = data.sortOrder ?? 0;
      if (seen.has(order)) {
        throw new BadRequestException(
          ERROR_MESSAGES.PRODUCT.DUPLICATE_SORT_ORDERS,
        );
      }
      seen.add(order);
    }
  }

  private assertImagesBelong(ids: string[], images: ProductImage[]): void {
    const known = new Set(images.map((image) => image.id));
    if (ids.some((id) => !known.has(id))) {
      throw new BadRequestException(ERROR_MESSAGES.PRODUCT.INVALID_IMAGE_IDS);
    }
  }

  private assertExactlyOnePrimary(
    images: Array<{ isPrimary?: boolean }>,
  ): void {
    const primaryCount = images.filter((image) => image.isPrimary).length;
    if (primaryCount > 1) {
      throw new BadRequestException(
        ERROR_MESSAGES.PRODUCT.MULTIPLE_PRIMARY_IMAGES,
      );
    }
    if (images.length > 0 && primaryCount === 0) {
      throw new BadRequestException(
        ERROR_MESSAGES.PRODUCT.PRIMARY_IMAGE_REQUIRED,
      );
    }
  }
}
