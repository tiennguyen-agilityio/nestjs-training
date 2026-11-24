import { ProductImage } from '../entities/product-image.entity.js';

export class ResponseProductImageDto {
  id!: string;
  url!: string;
  isPrimary!: boolean;
  sortOrder!: number;

  static fromEntity(image: ProductImage): ResponseProductImageDto {
    const dto = new ResponseProductImageDto();
    dto.id = image.id;
    dto.url = image.url;
    dto.isPrimary = image.isPrimary;
    // Only live images are listed, and a live image always has a position.
    dto.sortOrder = image.sortOrder ?? 0;
    return dto;
  }
}
