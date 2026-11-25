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
import { ProductService } from '../services/product.service.js';
import {
  createProductSchema,
  type CreateProductInput,
  updateProductSchema,
  type UpdateProductInput,
  productQuerySchema,
  type ProductQueryInput,
} from '../dto/product.schema.js';
import { ResponseProductDto } from '../dto/response-product.dto.js';
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
  ApiPaginatedResponse,
  ApiErrorResponse,
} from '../../../common/decorators/api-response.decorator.js';
import { User } from '../../user/entities/user.entity.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';
import { isActiveAdmin } from '../../../common/utils/user.util.js';
import { ProductStatus, VALIDATION_RULES } from '@repo/constants';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List products' })
  @ApiPaginatedResponse(ResponseProductDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  async findAll(
    @Query({ schema: productQuerySchema }) query: ProductQueryInput,
    @AuthUser() user?: User,
  ): Promise<PaginatedResult<ResponseProductDto>> {
    const { page, limit, search, ...filters } = query;
    const asAdmin = isActiveAdmin(user);
    // Shoppers only ever see ACTIVE products, whatever status they ask for.
    const result = await this.productService.findAll(
      { page, limit, search },
      asAdmin ? filters : { ...filters, status: ProductStatus.ACTIVE },
      { includeDeleted: asAdmin },
    );

    return mapPaginatedResult(result, (product) =>
      ResponseProductDto.fromEntity(product, { withAudit: asAdmin }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by id' })
  @ApiDataResponse(HttpStatus.OK, ResponseProductDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.PRODUCT.NOT_FOUND)
  async findOne(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @AuthUser() user?: User,
  ): Promise<ResponseProductDto> {
    const asAdmin = isActiveAdmin(user);
    const product = await this.productService.findOne(id, {
      includeDeleted: asAdmin,
      activeOnly: !asAdmin,
    });
    return ResponseProductDto.fromEntity(product, { withAudit: asAdmin });
  }

  @Post()
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({ summary: 'Create a product (admin only)' })
  @ApiDataResponse(HttpStatus.CREATED, ResponseProductDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.CATEGORY.NOT_FOUND)
  @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_MESSAGES.PRODUCT.NAME_EXISTS)
  async create(
    @Body({ schema: createProductSchema }) dto: CreateProductInput,
    @AuthUser() user: User,
  ): Promise<ResponseProductDto> {
    const product = await this.productService.create(dto, user.id);
    return ResponseProductDto.fromEntity(product, { withAudit: true });
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({
    summary: 'Update a product (admin only)',
    description: `400 \`${ERROR_CODES.PRODUCT.TOO_FEW_IMAGES}\` on \`removeImageIds\` or \`addImages\`: ${ERROR_MESSAGES.PRODUCT.TOO_FEW_IMAGES(VALIDATION_RULES.IMAGE.MIN_COUNT)}. ${ERROR_DESCRIPTIONS.PRODUCT.TOO_FEW_IMAGES}`,
  })
  @ApiDataResponse(HttpStatus.OK, ResponseProductDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.PRODUCT.NOT_FOUND)
  @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_MESSAGES.PRODUCT.NAME_EXISTS)
  async update(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @Body({ schema: updateProductSchema }) dto: UpdateProductInput,
    @AuthUser() user: User,
  ): Promise<ResponseProductDto> {
    const product = await this.productService.update(id, dto, user.id);
    return ResponseProductDto.fromEntity(product, { withAudit: true });
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product (admin only)' })
  @ApiNoContentResponse({ description: 'Product deleted' })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.PRODUCT.NOT_FOUND)
  async remove(
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @AuthUser() user: User,
  ): Promise<void> {
    await this.productService.remove(id, user.id);
  }
}
