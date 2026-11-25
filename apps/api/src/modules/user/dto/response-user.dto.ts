import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@repo/constants';
import { User } from '../entities/user.entity.js';
import {
  auditFieldsOf,
  type ResponseOptions,
} from '../../../common/utils/audit.util.js';

export class ResponseUserDto {
  id!: string;
  clerkId!: string;
  email!: string;
  firstName!: string;
  lastName!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  avatarUrl: string | null = null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Only on GET /users/me',
  })
  phoneNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  deletedAt: Date | null = null;

  @ApiPropertyOptional({ nullable: true, type: String })
  createdBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  updatedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  deletedBy?: string | null;

  static fromEntity(
    user: User,
    options: ResponseOptions & { withPhone?: boolean } = {},
  ): ResponseUserDto {
    const dto = new ResponseUserDto();
    dto.id = user.id;
    dto.clerkId = user.clerkId;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.role = user.role;
    dto.status = user.status;
    dto.avatarUrl = user.avatarUrl;
    if (options.withPhone) dto.phoneNumber = user.phoneNumber;
    dto.deletedAt = user.deletedAt;
    if (options.withAudit) Object.assign(dto, auditFieldsOf(user));
    return dto;
  }
}
