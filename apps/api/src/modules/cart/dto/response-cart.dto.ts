import { ApiProperty } from '@nestjs/swagger';
import { DiscountType, ProductStatus } from '@repo/constants';
import { Cart } from '../entities/cart.entity.js';
import { CartItem } from '../entities/cart-item.entity.js';
import { variantNameFrom } from '../../product-variant/utils/variant-name.util.js';
import { lineTotalOf, pricingOf, sumOf } from '../utils/cart-pricing.util.js';

export class CartItemProductDto {
  id!: string;
  name!: string;
  slug!: string;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty({ type: String, nullable: true })
  primaryImageUrl!: string | null;
}

export class CartItemVariantDto {
  sku!: string;
  sizeName!: string;
  price!: number;

  @ApiProperty({ enum: DiscountType })
  discountType!: DiscountType;

  discountValue!: number;
  salePrice!: number;

  availableQuantity!: number;
}

export class ResponseCartItemDto {
  id!: string;
  productVariantId!: string;
  quantity!: number;
  product!: CartItemProductDto;
  variant!: CartItemVariantDto;

  inStock!: boolean;

  isAvailable!: boolean;

  lineTotal!: number;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(item: CartItem): ResponseCartItemDto {
    const variant = item.productVariant;
    const product = variant.product;
    const pricing = pricingOf(variant);
    const primaryImage = product.images
      .getItems()
      .find((image) => image.isPrimary && !image.deletedAt);

    const dto = new ResponseCartItemDto();
    dto.id = item.id;
    dto.productVariantId = variant.id;
    dto.quantity = item.quantity;
    dto.product = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      primaryImageUrl: primaryImage?.url ?? null,
    };
    dto.variant = {
      sku: variant.sku,
      sizeName: variantNameFrom(variant.size, variant.unit),
      ...pricing,
      availableQuantity: variant.stockQuantity,
    };
    dto.inStock = variant.stockQuantity >= item.quantity;
    dto.isAvailable =
      (product.status as ProductStatus) === ProductStatus.ACTIVE &&
      !product.deletedAt &&
      !variant.deletedAt;
    dto.lineTotal = lineTotalOf(pricing.salePrice, item.quantity);
    dto.createdAt = item.createdAt;
    dto.updatedAt = item.updatedAt;
    return dto;
  }
}

export class ResponseCartDto {
  @ApiProperty({ type: String, nullable: true })
  id!: string | null;

  userId!: string;

  @ApiProperty({ type: () => ResponseCartItemDto, isArray: true })
  items!: ResponseCartItemDto[];

  totalQuantity!: number;
  subTotal!: number;

  @ApiProperty({ type: Date, nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  updatedAt!: Date | null;

  static fromEntity(cart: Cart): ResponseCartDto {
    const items = cart.items
      .getItems()
      .map((item) => ResponseCartItemDto.fromEntity(item));

    const dto = new ResponseCartDto();
    dto.id = cart.id;
    dto.userId = cart.user.id;
    dto.items = items;
    dto.totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
    dto.subTotal = sumOf(items.map((item) => item.lineTotal));
    dto.createdAt = cart.createdAt;
    dto.updatedAt = cart.updatedAt;
    return dto;
  }

  static empty(userId: string): ResponseCartDto {
    const dto = new ResponseCartDto();
    dto.id = null;
    dto.userId = userId;
    dto.items = [];
    dto.totalQuantity = 0;
    dto.subTotal = 0;
    dto.createdAt = null;
    dto.updatedAt = null;
    return dto;
  }
}
