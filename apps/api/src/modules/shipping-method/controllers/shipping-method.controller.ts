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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShippingMethodService } from '../services/shipping-method.service.js';
import {
  createShippingMethodSchema,
  type CreateShippingMethodInput,
  shippingMethodQuerySchema,
  type ShippingMethodQueryInput,
  updateShippingMethodSchema,
  type UpdateShippingMethodInput,
} from '../dto/shipping-method.schema.js';
import { ResponseShippingMethodDto } from '../dto/response-shipping-method.dto.js';
import { ShippingMethodStatusFilter } from '../enums/shipping-method-status-filter.enum.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import {
  idParamSchema,
  type IdParam,
} from '../../../common/dto/id-param.schema.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import {
  ApiDataResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-response.decorator.js';
import { User } from '../../user/entities/user.entity.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';
import { isActiveAdmin } from '../../../common/utils/user.util.js';

const SHIPPING_METHOD_NOT_FOUND_ERROR = {
  errCode: ERROR_CODES.SHIPPING_METHOD.NOT_FOUND,
  field: 'id',
  description: ERROR_DESCRIPTIONS.SHIPPING_METHOD.NOT_FOUND,
};

const SHIPPING_METHOD_NAME_EXISTS_ERROR = {
  errCode: ERROR_CODES.SHIPPING_METHOD.NAME_EXISTS,
  field: 'name',
  description: ERROR_DESCRIPTIONS.SHIPPING_METHOD.NAME_EXISTS,
};

@ApiTags('shipping-methods')
@Controller('shipping-methods')
export class ShippingMethodController {
  constructor(private readonly shippingMethodService: ShippingMethodService) {}

  @Get()
  @ApiOperation({
    summary:
      'List shipping methods (ACTIVE only, unless the caller is an active admin)',
  })
  @ApiPaginatedResponse(ResponseShippingMethodDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  async findAll(
    @Query({ schema: shippingMethodQuerySchema })
    query: ShippingMethodQueryInput,
    @AuthUser() user?: User,
  ): Promise<PaginatedResult<ResponseShippingMethodDto>> {
    const { page, limit, search, ...filters } = query;
    const asAdmin = isActiveAdmin(user);
    // Shoppers only ever see ACTIVE, non-deleted methods, whatever they ask for.
    const result = await this.shippingMethodService.findAll(
      { page, limit, search },
      asAdmin
        ? filters
        : { ...filters, status: ShippingMethodStatusFilter.ACTIVE },
      { includeDeleted: asAdmin },
    );

    return mapPaginatedResult(result, (method) =>
      ResponseShippingMethodDto.fromEntity(method, { withAudit: asAdmin }),
    );
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a shipping method by id (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseShippingMethodDto)
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.SHIPPING_METHOD.NOT_FOUND,
    SHIPPING_METHOD_NOT_FOUND_ERROR,
  )
  async findOne(
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponseShippingMethodDto> {
    const method = await this.shippingMethodService.findOne(id, {
      includeDeleted: true,
    });

    return ResponseShippingMethodDto.fromEntity(method, { withAudit: true });
  }

  @Post()
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({ summary: 'Create a shipping method (admin only)' })
  @ApiDataResponse(HttpStatus.CREATED, ResponseShippingMethodDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.SHIPPING_METHOD.NAME_EXISTS,
    SHIPPING_METHOD_NAME_EXISTS_ERROR,
  )
  async create(
    @Body({ schema: createShippingMethodSchema })
    dto: CreateShippingMethodInput,
    @AuthUser() user: User,
  ): Promise<ResponseShippingMethodDto> {
    const method = await this.shippingMethodService.create(dto, user.id);
    return ResponseShippingMethodDto.fromEntity(method, { withAudit: true });
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a shipping method (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseShippingMethodDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.SHIPPING_METHOD.NOT_FOUND,
    SHIPPING_METHOD_NOT_FOUND_ERROR,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.SHIPPING_METHOD.NAME_EXISTS,
    SHIPPING_METHOD_NAME_EXISTS_ERROR,
  )
  async update(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @Body({ schema: updateShippingMethodSchema })
    dto: UpdateShippingMethodInput,
    @AuthUser() user: User,
  ): Promise<ResponseShippingMethodDto> {
    const method = await this.shippingMethodService.update(id, dto, user.id);
    return ResponseShippingMethodDto.fromEntity(method, { withAudit: true });
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a shipping method (admin only)' })
  @ApiNoContentResponse({ description: 'Shipping method deleted' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.SHIPPING_METHOD.NOT_FOUND,
    SHIPPING_METHOD_NOT_FOUND_ERROR,
  )
  async remove(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @AuthUser() user: User,
  ): Promise<void> {
    await this.shippingMethodService.remove(id, user.id);
  }
}
