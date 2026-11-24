import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Category } from '../entities/category.entity.js';
import {
  auditFieldsOf,
  type ResponseOptions,
} from '../../../common/utils/audit.util.js';

export class ResponseCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ nullable: true, type: Date, example: null })
  deletedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  createdBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  updatedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  deletedBy?: string | null;

  static fromEntity(
    category: Category,
    options: ResponseOptions = {},
  ): ResponseCategoryDto {
    const dto = new ResponseCategoryDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.slug = category.slug;
    dto.createdAt = category.createdAt;
    dto.updatedAt = category.updatedAt;
    dto.deletedAt = category.deletedAt;
    if (options.withAudit) Object.assign(dto, auditFieldsOf(category));
    return dto;
  }
}
