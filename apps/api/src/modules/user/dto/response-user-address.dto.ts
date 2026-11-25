import { ApiProperty } from '@nestjs/swagger';
import { UserAddress } from '../entities/user-address.entity.js';

export class ResponseUserAddressDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  addressLine!: string;

  @ApiProperty()
  ward!: string;

  @ApiProperty()
  district!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  postalCode!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(address: UserAddress): ResponseUserAddressDto {
    const dto = new ResponseUserAddressDto();
    dto.id = address.id;
    dto.userId = address.user.id;
    dto.addressLine = address.addressLine;
    dto.ward = address.ward;
    dto.district = address.district;
    dto.city = address.city;
    dto.postalCode = address.postalCode;
    dto.isDefault = address.isDefault;
    dto.createdAt = address.createdAt;
    dto.updatedAt = address.updatedAt;
    return dto;
  }
}
