import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, ShippingStatus } from '@repo/constants';
import type { Order } from '../entities/order.entity.js';
import { ResponseOrderDto } from './response-order.dto.js';
import { ResponseOrderCustomerDto } from './response-order-row.dto.js';

export interface AllowedStatuses {
  statuses: OrderStatus[];
  shippingStatuses: ShippingStatus[];
}

/** One order read through `GET /orders/:idOrOrderNumber`; `user`, `items` and `payments` must be loaded. */
export class ResponseOrderDetailDto extends ResponseOrderDto {
  @ApiProperty({ type: ResponseOrderCustomerDto })
  customer!: ResponseOrderCustomerDto;

  @ApiPropertyOptional({
    enum: OrderStatus,
    isArray: true,
    description: 'Admin only: the order statuses it can move to now.',
  })
  allowedStatuses?: OrderStatus[];

  @ApiPropertyOptional({
    enum: ShippingStatus,
    isArray: true,
    description: 'Admin only: the shipping statuses it can move to now.',
  })
  allowedShippingStatuses?: ShippingStatus[];

  static override fromEntity(
    order: Order,
    allowed?: AllowedStatuses,
  ): ResponseOrderDetailDto {
    const dto = Object.assign(
      new ResponseOrderDetailDto(),
      ResponseOrderDto.fromEntity(order),
    );
    dto.customer = {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.user.email,
    };
    if (allowed) {
      dto.allowedStatuses = allowed.statuses;
      dto.allowedShippingStatuses = allowed.shippingStatuses;
    }
    return dto;
  }
}
