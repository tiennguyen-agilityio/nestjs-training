import { ApiProperty } from '@nestjs/swagger';
import type { Order } from '../entities/order.entity.js';
import { ResponseOrderDto } from './response-order.dto.js';
import { ResponseOrderCustomerDto } from './response-order-row.dto.js';

/** One order read through `GET /orders/:idOrOrderNumber`; `user`, `items` and `payments` must be loaded. */
export class ResponseOrderDetailDto extends ResponseOrderDto {
  @ApiProperty({ type: ResponseOrderCustomerDto })
  customer!: ResponseOrderCustomerDto;

  static override fromEntity(order: Order): ResponseOrderDetailDto {
    const dto = Object.assign(
      new ResponseOrderDetailDto(),
      ResponseOrderDto.fromEntity(order),
    );
    dto.customer = {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.user.email,
    };
    return dto;
  }
}
