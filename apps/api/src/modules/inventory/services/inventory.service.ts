import { Injectable } from '@nestjs/common';
import { InventoryMovementType, VALIDATION_RULES } from '@repo/constants';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ResponseInventoryItemDto } from '../dto/response-inventory-item.dto.js';
import type {
  InventoryQueryInput,
  MovementQueryInput,
  AdjustStockInput,
  RestockStockInput,
} from '../dto/inventory.schema.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';
import { ResponseInventoryMovementDto } from '../dto/response-inventory-movement.dto.js';
import {
  InvalidStateException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

export interface StockChangeResult {
  variant: ResponseInventoryItemDto;
  movement: ResponseInventoryMovementDto;
}

@Injectable()
export class InventoryService {
  constructor(private readonly productVariantService: ProductVariantService) {}

  async findAll({
    page,
    limit,
    ...filters
  }: InventoryQueryInput): Promise<PaginatedResult<ResponseInventoryItemDto>> {
    const result = await this.productVariantService.findInventoryPage(
      { page, limit },
      filters,
    );

    return mapPaginatedResult(result, (variant) =>
      ResponseInventoryItemDto.fromEntity(variant),
    );
  }

  async findOne(id: string): Promise<ResponseInventoryItemDto> {
    return ResponseInventoryItemDto.fromEntity(
      await this.productVariantService.findActive(id),
    );
  }

  /** 404 for a deleted variant, like the other inventory routes. */
  async findMovements(
    id: string,
    { page, limit, type }: MovementQueryInput,
  ): Promise<PaginatedResult<ResponseInventoryMovementDto>> {
    await this.productVariantService.findActive(id);
    const result = await this.productVariantService.findMovements(
      id,
      { page, limit },
      type,
    );

    return mapPaginatedResult(result, (movement) =>
      ResponseInventoryMovementDto.fromEntity(movement),
    );
  }

  restock(
    id: string,
    { quantity }: RestockStockInput,
    actorId: string,
  ): Promise<StockChangeResult> {
    return this.changeStock(
      id,
      quantity,
      InventoryMovementType.RESTOCK,
      null,
      actorId,
    );
  }

  adjust(
    id: string,
    { quantity, reason }: AdjustStockInput,
    actorId: string,
  ): Promise<StockChangeResult> {
    return this.changeStock(
      id,
      quantity,
      InventoryMovementType.ADJUSTMENT,
      reason.trim(),
      actorId,
    );
  }

  private async changeStock(
    id: string,
    quantity: number,
    type: InventoryMovementType.RESTOCK | InventoryMovementType.ADJUSTMENT,
    reason: string | null,
    actorId: string,
  ): Promise<StockChangeResult> {
    const variant = await this.productVariantService.findActive(id);
    if (
      variant.stockQuantity + quantity >
      VALIDATION_RULES.STOCK_QUANTITY.MAX
    ) {
      throw this.aboveMax();
    }
    const result = await this.productVariantService.changeStock(
      variant,
      quantity,
      { type, reason },
      actorId,
    );
    if (result === 'notFound') {
      // Deleted between the check above and the guarded UPDATE.
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
      });
    }
    if (result === 'aboveMax') throw this.aboveMax();
    if (result === 'belowReserved') {
      throw new InvalidStateException({
        errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_BELOW_RESERVED,
        field: 'quantity',
        message: ERROR_MESSAGES.PRODUCT_VARIANT.STOCK_BELOW_RESERVED(
          variant.reservedQuantity,
        ),
        description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.STOCK_BELOW_RESERVED,
      });
    }

    // The guarded UPDATE bypassed the loaded entity: read the new numbers.
    const fresh = (await this.productVariantService.reload(variant)) ?? variant;
    return {
      variant: ResponseInventoryItemDto.fromEntity(fresh),
      movement: ResponseInventoryMovementDto.fromEntity(result),
    };
  }

  private aboveMax(): InvalidStateException {
    return new InvalidStateException({
      errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_ABOVE_MAX,
      field: 'quantity',
      message: ERROR_MESSAGES.PRODUCT_VARIANT.STOCK_ABOVE_MAX(
        VALIDATION_RULES.STOCK_QUANTITY.MAX,
      ),
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.STOCK_ABOVE_MAX,
    });
  }
}
