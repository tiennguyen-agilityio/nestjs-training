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
import { CategoryService } from '../services/category.service.js';
import {
  createCategorySchema,
  type CreateCategoryInput,
  updateCategorySchema,
  type UpdateCategoryInput,
} from '../dto/category.schema.js';
import { ResponseCategoryDto } from '../dto/response-category.dto.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import {
  idParamSchema,
  type IdParam,
} from '../../../common/dto/id-param.schema.js';
import {
  paginationQuerySchema,
  type PaginationQueryInput,
} from '../../../common/dto/pagination.schema.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import {
  ApiDataResponse,
  ApiPaginatedResponse,
  ApiErrorResponse,
} from '../../../common/decorators/api-response.decorator.js';
import { User } from '../../user/entities/user.entity.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';
import { isActiveAdmin } from '../../../common/utils/user.util.js';

const CATEGORY_NOT_FOUND_ERROR = {
  errCode: ERROR_CODES.CATEGORY.NOT_FOUND,
  field: 'id',
  description: ERROR_DESCRIPTIONS.CATEGORY.NOT_FOUND,
};

const CATEGORY_NAME_EXISTS_ERROR = {
  errCode: ERROR_CODES.CATEGORY.NAME_EXISTS,
  field: 'name',
  description: ERROR_DESCRIPTIONS.CATEGORY.NAME_EXISTS,
};

const CATEGORY_HAS_PRODUCTS_ERROR = {
  errCode: ERROR_CODES.CATEGORY.HAS_PRODUCTS,
  field: 'id',
  description: ERROR_DESCRIPTIONS.CATEGORY.HAS_PRODUCTS,
};

const CATEGORY_NOT_DELETED_ERROR = {
  errCode: ERROR_CODES.CATEGORY.NOT_DELETED,
  field: 'id',
  description: ERROR_DESCRIPTIONS.CATEGORY.NOT_DELETED,
};

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiPaginatedResponse(ResponseCategoryDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  async findAll(
    @Query({ schema: paginationQuerySchema }) query: PaginationQueryInput,
    @AuthUser() user?: User,
  ): Promise<PaginatedResult<ResponseCategoryDto>> {
    const result = await this.categoryService.findAll(query, {
      includeDeleted: isActiveAdmin(user),
    });

    return mapPaginatedResult(result, (category) =>
      ResponseCategoryDto.fromEntity(category),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  @ApiDataResponse(HttpStatus.OK, ResponseCategoryDto)
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.CATEGORY.NOT_FOUND,
    CATEGORY_NOT_FOUND_ERROR,
  )
  async findOne(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @AuthUser() user?: User,
  ): Promise<ResponseCategoryDto> {
    const category = await this.categoryService.findOne(id, {
      includeDeleted: isActiveAdmin(user),
    });

    return ResponseCategoryDto.fromEntity(category);
  }

  @Post()
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({ summary: 'Create a category (admin only)' })
  @ApiDataResponse(HttpStatus.CREATED, ResponseCategoryDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
    CATEGORY_NAME_EXISTS_ERROR,
  )
  async create(
    @Body({ schema: createCategorySchema }) dto: CreateCategoryInput,
  ): Promise<ResponseCategoryDto> {
    const category = await this.categoryService.create(dto);
    return ResponseCategoryDto.fromEntity(category);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a category (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseCategoryDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.CATEGORY.NOT_FOUND,
    CATEGORY_NOT_FOUND_ERROR,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
    CATEGORY_NAME_EXISTS_ERROR,
  )
  async update(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @Body({ schema: updateCategorySchema }) dto: UpdateCategoryInput,
  ): Promise<ResponseCategoryDto> {
    const category = await this.categoryService.update(id, dto);
    return ResponseCategoryDto.fromEntity(category);
  }

  @Patch(':id/restore')
  @AdminOnly()
  @ApiOperation({ summary: 'Restore a deleted category (admin only)' })
  @ApiDataResponse(HttpStatus.OK, ResponseCategoryDto)
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.CATEGORY.NOT_FOUND,
    CATEGORY_NOT_FOUND_ERROR,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CATEGORY.NOT_DELETED,
    CATEGORY_NOT_DELETED_ERROR,
  )
  async restore(
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponseCategoryDto> {
    const category = await this.categoryService.restore(id);
    return ResponseCategoryDto.fromEntity(category);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category (admin only)' })
  @ApiNoContentResponse({ description: 'Category deleted' })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.CATEGORY.NOT_FOUND,
    CATEGORY_NOT_FOUND_ERROR,
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CATEGORY.HAS_PRODUCTS,
    CATEGORY_HAS_PRODUCTS_ERROR,
  )
  async remove(
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<void> {
    await this.categoryService.remove(id);
  }
}
