import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductImage } from '../entities/product-image.entity.js';
import {
  auditFieldsOf,
  type ResponseOptions,
} from '../../../common/utils/audit.util.js';

export class ResponseProductImageDto {
  id!: string;
  url!: string;
  isPrimary!: boolean;
  sortOrder!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  createdBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  updatedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  deletedBy?: string | null;

  static fromEntity(
    image: ProductImage,
    options: ResponseOptions = {},
  ): ResponseProductImageDto {
    const dto = new ResponseProductImageDto();
    dto.id = image.id;
    dto.url = image.url;
    dto.isPrimary = image.isPrimary;
    // Only live images are listed, and a live image always has a position.
    dto.sortOrder = image.sortOrder ?? 0;
    if (options.withAudit) Object.assign(dto, auditFieldsOf(image));
    return dto;
  }
}
