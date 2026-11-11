import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserService } from '../services/user.service.js';
import {
  userQuerySchema,
  type UserQueryInput,
  createUserSchema,
  type CreateUserInput,
  updateUserSchema,
  type UpdateUserInput,
} from '../dto/user.schema.js';
import { ResponseUserDto } from '../dto/response-user.dto.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import {
  idParamSchema,
  type IdParam,
} from '../../../common/dto/id-param.schema.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
  ApiErrorResponse,
} from '../../../common/decorators/api-response.decorator.js';
import { User } from '../entities/user.entity.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @AdminOnly()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Create a user (admin only)' })
  @ApiDataResponse(HttpStatus.CREATED, ResponseUserDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    `${ERROR_MESSAGES.USER.EMAIL_EXISTS} / ${ERROR_MESSAGES.USER.CLERK_ID_EXISTS}`,
  )
  async create(
    @Body({ schema: createUserSchema }) dto: CreateUserInput,
  ): Promise<ResponseUserDto> {
    const user = await this.userService.create(dto);
    return ResponseUserDto.fromEntity(user);
  }

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiPaginatedResponse(ResponseUserDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.PAGINATION.PAGE_OUT_OF_RANGE,
  )
  async findAll(
    @Query({ schema: userQuerySchema }) query: UserQueryInput,
    @AuthUser() user: User,
  ): Promise<PaginatedResult<ResponseUserDto>> {
    const { page, limit, search, ...filters } = query;
    const result = await this.userService.findAll(
      { page, limit, search },
      filters,
      { includeDeleted: true, excludeId: user.id },
    );
    return mapPaginatedResult(result, (user) =>
      ResponseUserDto.fromEntity(user),
    );
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Get the currently authenticated user (any authenticated user, not just admin)',
  })
  @ApiDataResponse(HttpStatus.OK, ResponseUserDto)
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    ERROR_MESSAGES.AUTH.UNAUTHENTICATED,
  )
  getCurrentUser(@AuthUser() user: User): ResponseUserDto {
    return ResponseUserDto.fromEntity(user);
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a user by id (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseUserDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.USER.NOT_FOUND)
  async findOne(
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponseUserDto> {
    const user = await this.userService.findOne(id, { includeDeleted: true });
    return ResponseUserDto.fromEntity(user);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a user (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseUserDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.USER.NOT_FOUND)
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
    {
      errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
    },
  )
  @ApiErrorResponse(
    HttpStatus.GATEWAY_TIMEOUT,
    ERROR_MESSAGES.AUTH_PROVIDER.TIMEOUT,
    {
      errCode: ERROR_CODES.AUTH_PROVIDER.TIMEOUT,
      description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.TIMEOUT,
    },
  )
  async update(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @Body({ schema: updateUserSchema }) dto: UpdateUserInput,
  ): Promise<ResponseUserDto> {
    const user = await this.userService.updateByAdmin(id, dto);
    return ResponseUserDto.fromEntity(user);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user (admin only)' })
  @ApiNoContentResponse({ description: 'User deleted' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.USER.NOT_FOUND)
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
    {
      errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
    },
  )
  @ApiErrorResponse(
    HttpStatus.GATEWAY_TIMEOUT,
    ERROR_MESSAGES.AUTH_PROVIDER.TIMEOUT,
    {
      errCode: ERROR_CODES.AUTH_PROVIDER.TIMEOUT,
      description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.TIMEOUT,
    },
  )
  remove(@Param({ schema: idParamSchema }) { id }: IdParam): Promise<void> {
    return this.userService.remove(id);
  }
}
