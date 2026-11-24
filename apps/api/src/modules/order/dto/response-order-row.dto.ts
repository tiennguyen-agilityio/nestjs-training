import { ApiProperty } from '@nestjs/swagger';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentType,
  ShippingStatus,
} from '@repo/constants';
import type { Order } from '../entities/order.entity.js';
import { paymentStatusOf } from '../utils/payment-status.util.js';

export class ResponseOrderCustomerDto {
  firstName!: string;
  lastName!: string;
  email!: string;
}

/** One row of the order list (OROW); `user`, `items` and `payments` must be loaded. */
export class ResponseOrderRowDto {
  id!: string;
  orderNumber!: string;
  userId!: string;

  @ApiProperty({ type: ResponseOrderCustomerDto })
  customer!: ResponseOrderCustomerDto;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: ShippingStatus })
  shippingStatus!: ShippingStatus;

  @ApiProperty({ enum: OrderPaymentStatus })
  paymentStatus!: OrderPaymentStatus;

  @ApiProperty({ enum: PaymentMethod, nullable: true })
  paymentMethod!: PaymentMethod | null;

  itemCount!: number;
  totalAmount!: number;
  createdAt!: Date;

  static fromEntity(order: Order): ResponseOrderRowDto {
    const payments = order.payments.getItems();
    const newestCharge = payments
      .filter(({ type }: { type: PaymentType }) => type === PaymentType.CHARGE)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const dto = new ResponseOrderRowDto();
    dto.id = order.id;
    dto.orderNumber = order.orderNumber;
    dto.userId = order.user.id;
    dto.customer = {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.user.email,
    };
    dto.status = order.status;
    dto.shippingStatus = order.shippingStatus;
    dto.paymentStatus = paymentStatusOf(payments);
    dto.paymentMethod = newestCharge?.method ?? null;
    dto.itemCount = order.items
      .getItems()
      .reduce((total, item) => total + item.quantity, 0);
    dto.totalAmount = Number(order.totalAmount);
    dto.createdAt = order.createdAt;
    return dto;
  }
}
