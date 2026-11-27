import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, ShippingStatus } from '@repo/constants';
import type { Order } from '../entities/order.entity.js';
import {
  ResponseOrderDto,
  type PaymentDtoOptions,
} from './response-order.dto.js';
import { ResponseOrderCustomerDto } from './response-order-row.dto.js';

/** What only an active admin's detail carries. */
export interface AdminOrderFacts extends PaymentDtoOptions {
  statuses: OrderStatus[];
  shippingStatuses: ShippingStatus[];
  refundableAmount: number;
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

  @ApiPropertyOptional({
    description:
      'Admin only: what can be refunded now — the paid card or PayPal charge of a CANCELLED order with no refund line, else 0.',
  })
  refundableAmount?: number;

  static override fromEntity(
    order: Order,
    admin?: AdminOrderFacts,
  ): ResponseOrderDetailDto {
    const dto = Object.assign(
      new ResponseOrderDetailDto(),
      ResponseOrderDto.fromEntity(order, { withRefundReason: Boolean(admin) }),
    );
    dto.customer = {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.user.email,
    };
    if (admin) {
      dto.allowedStatuses = admin.statuses;
      dto.allowedShippingStatuses = admin.shippingStatuses;
      dto.refundableAmount = admin.refundableAmount;
    }
    return dto;
  }
}
