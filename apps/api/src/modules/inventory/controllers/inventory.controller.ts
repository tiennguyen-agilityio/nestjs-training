import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { VALIDATION_RULES } from '@repo/constants';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  InventoryService,
  type StockChangeResult,
} from '../services/inventory.service.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import { User } from '../../user/entities/user.entity.js';
import {
  adjustStockSchema,
  inventoryQuerySchema,
  movementQuerySchema,
  restockStockSchema,
  type AdjustStockInput,
  type InventoryQueryInput,
  type MovementQueryInput,
  type RestockStockInput,
} from '../dto/inventory.schema.js';
import { ResponseInventoryMovementDto } from '../dto/response-inventory-movement.dto.js';
import { ResponseInventoryItemDto } from '../dto/response-inventory-item.dto.js';
import { idParamSchema } from '../../../common/dto/id-param.schema.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import {
  ApiDataResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-response.decorator.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

@ApiTags('inventory')
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory')
  @AdminOnly()
  @ApiOperation({
    summary: 'List the stock of every variant (admin only)',
    description:
      '`stockLevel` and `lowStock` use the available quantity (stock − reserved): 0 is OUT, up to the low-stock threshold is LOW. `search` matches the product name or sku. `activeOnly=true` keeps ACTIVE products only.',
  })
  @ApiPaginatedResponse(ResponseInventoryItemDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  list(
    @Query({ schema: inventoryQuerySchema }) query: InventoryQueryInput,
  ): Promise<PaginatedResult<ResponseInventoryItemDto>> {
    return this.inventoryService.findAll(query);
  }

  @Get('product-variants/:id')
  @AdminOnly()
  @ApiOperation({ summary: "One variant's stock (admin only)" })
  @ApiDataResponse(HttpStatus.OK, ResponseInventoryItemDto)
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
    },
  )
  findOne(
    @Param({ schema: idParamSchema }) { id }: { id: string },
  ): Promise<ResponseInventoryItemDto> {
    return this.inventoryService.findOne(id);
  }

  @Get('product-variants/:id/movements')
  @AdminOnly()
  @ApiOperation({
    summary: "A variant's stock history (admin only)",
    description:
      'Every movement, newest first: RESTOCK and ADJUSTMENT change the stock (ADJUSTMENT is signed); RESERVE and RELEASE change what orders hold. `createdBy` is null for system movements.',
  })
  @ApiPaginatedResponse(ResponseInventoryMovementDto)
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
    },
  )
  movements(
    @Param({ schema: idParamSchema }) { id }: { id: string },
    @Query({ schema: movementQuerySchema }) query: MovementQueryInput,
  ): Promise<PaginatedResult<ResponseInventoryMovementDto>> {
    return this.inventoryService.findMovements(id, query);
  }

  @Post('product-variants/:id/restock')
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({
    summary: 'Add stock to a variant (admin only)',
    description:
      'One guarded update of the stock and one RESTOCK movement by the admin.',
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.PRODUCT_VARIANT.STOCK_ABOVE_MAX(
      VALIDATION_RULES.STOCK_QUANTITY.MAX,
    ),
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_ABOVE_MAX,
      field: 'quantity',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.STOCK_ABOVE_MAX,
    },
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
    },
  )
  restock(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: { id: string },
    @Body({ schema: restockStockSchema }) body: RestockStockInput,
  ): Promise<StockChangeResult> {
    return this.inventoryService.restock(id, body, user.id);
  }

  @Post('product-variants/:id/adjustments')
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({
    summary: "Adjust a variant's stock with a reason (admin only)",
    description:
      'A signed quantity (negative removes) and a required reason; the stock never goes below what orders hold. One ADJUSTMENT movement by the admin.',
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.PRODUCT_VARIANT.STOCK_BELOW_RESERVED(2),
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_BELOW_RESERVED,
      field: 'quantity',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.STOCK_BELOW_RESERVED,
    },
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
    },
  )
  adjust(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: { id: string },
    @Body({ schema: adjustStockSchema }) body: AdjustStockInput,
  ): Promise<StockChangeResult> {
    return this.inventoryService.adjust(id, body, user.id);
  }
}
