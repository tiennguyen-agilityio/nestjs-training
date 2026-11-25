import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '@repo/constants';
import type { InventoryMovement } from '../../order/entities/inventory-movement.entity.js';

export class ResponseMovementAuthorDto {
  id!: string;
  firstName!: string;
  lastName!: string;
}

/** One ledger row; `order` and `createdBy` are read when loaded. */
export class ResponseInventoryMovementDto {
  id!: string;

  @ApiProperty({ enum: InventoryMovementType })
  type!: InventoryMovementType;

  /** RESTOCK/ADJUSTMENT change the stock (ADJUSTMENT is signed); RESERVE/RELEASE change reserved. */
  quantity!: number;

  @ApiProperty({ nullable: true, type: String })
  reason!: string | null;

  @ApiProperty({ nullable: true, type: String })
  orderNumber!: string | null;

  @ApiProperty({ nullable: true, type: ResponseMovementAuthorDto })
  createdBy!: ResponseMovementAuthorDto | null;

  createdAt!: Date;

  static fromEntity(movement: InventoryMovement): ResponseInventoryMovementDto {
    const dto = new ResponseInventoryMovementDto();
    const author = movement.createdBy;
    dto.id = movement.id;
    dto.type = movement.type;
    dto.quantity = movement.quantity;
    dto.reason = movement.reason;
    dto.orderNumber = movement.order?.orderNumber ?? null;
    dto.createdBy = author
      ? {
          id: author.id,
          firstName: author.firstName,
          lastName: author.lastName,
        }
      : null;
    dto.createdAt = movement.createdAt;
    return dto;
  }
}
