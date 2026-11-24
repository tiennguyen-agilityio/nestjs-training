import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShippingMethodStatus } from '@repo/constants';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import {
  auditFieldsOf,
  type ResponseOptions,
} from '../../../common/utils/audit.util.js';

export class ResponseShippingMethodDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  price!: number;

  @ApiProperty({ enum: ShippingMethodStatus })
  status!: ShippingMethodStatus;

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

  /** The audit ids are added only with `withAudit` (an active admin). */
  static fromEntity(
    method: ShippingMethod,
    options: ResponseOptions = {},
  ): ResponseShippingMethodDto {
    const dto = new ResponseShippingMethodDto();
    dto.id = method.id;
    dto.name = method.name;
    dto.description = method.description;
    dto.price = Number(method.price);
    dto.status = method.status;
    dto.createdAt = method.createdAt;
    dto.updatedAt = method.updatedAt;
    dto.deletedAt = method.deletedAt;
    if (options.withAudit) Object.assign(dto, auditFieldsOf(method));
    return dto;
  }
}
