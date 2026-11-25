import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus, StockLevel, stockLevelOf } from '@repo/constants';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { ResponseProductVariantDto } from '../../product-variant/dto/response-product-variant.dto.js';

export class ResponseInventoryProductDto {
  id!: string;
  name!: string;
  slug!: string;

  @ApiProperty({ enum: ProductStatus })
  status!: ProductStatus;

  @ApiProperty({ nullable: true, type: String })
  primaryImageUrl!: string | null;
}

/** One variant's stock; `product` and `product.images` must be loaded. */
export class ResponseInventoryItemDto extends ResponseProductVariantDto {
  reservedQuantity!: number;
  /** stock − reserved: what can still be sold. */
  availableQuantity!: number;

  @ApiProperty({ enum: StockLevel })
  stockLevel!: StockLevel;

  @ApiProperty({ type: ResponseInventoryProductDto })
  product!: ResponseInventoryProductDto;

  static override fromEntity(
    variant: ProductVariant,
  ): ResponseInventoryItemDto {
    const dto = Object.assign(
      new ResponseInventoryItemDto(),
      ResponseProductVariantDto.fromEntity(variant),
    );
    const available = variant.stockQuantity - variant.reservedQuantity;
    const { product } = variant;
    dto.reservedQuantity = variant.reservedQuantity;
    dto.availableQuantity = available;
    dto.stockLevel = stockLevelOf(available);
    dto.product = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      primaryImageUrl:
        product.images.getItems().find((image) => image.isPrimary)?.url ?? null,
    };
    return dto;
  }
}
