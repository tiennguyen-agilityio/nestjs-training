import { ApiProperty } from '@nestjs/swagger';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants';
import type { Order } from '../entities/order.entity.js';
import type { OrderItem } from '../entities/order-item.entity.js';
import type { Payment } from '../entities/payment.entity.js';
import { lineTotalCentsOf } from '../utils/order-pricing.util.js';
import { paymentStatusOf } from '../utils/payment-status.util.js';

export class ResponseOrderItemDto {
  id!: string;
  productVariantId!: string;
  productName!: string;
  productImage!: string;
  variantName!: string;
  unitPrice!: number;
  discountAmount!: number;
  quantity!: number;
  lineTotal!: number;

  static fromEntity(item: OrderItem): ResponseOrderItemDto {
    const dto = new ResponseOrderItemDto();
    dto.id = item.id;
    dto.productVariantId = item.productVariant.id;
    dto.productName = item.productName;
    dto.productImage = item.productImage;
    dto.variantName = item.variantName;
    dto.unitPrice = Number(item.unitPrice);
    dto.discountAmount = Number(item.discountAmount);
    dto.quantity = item.quantity;
    dto.lineTotal = lineTotalCentsOf(dto) / 100;
    return dto;
  }
}

export class ResponsePaymentDto {
  id!: string;
  orderId!: string;

  @ApiProperty({ enum: PaymentType })
  type!: PaymentType;

  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  amount!: number;
  currency!: string;

  @ApiProperty({ type: String, nullable: true })
  transactionId!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  failureReason!: string | null;

  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(payment: Payment): ResponsePaymentDto {
    const dto = new ResponsePaymentDto();
    dto.id = payment.id;
    dto.orderId = payment.order.id;
    dto.type = payment.type;
    dto.method = payment.method;
    dto.status = payment.status;
    dto.amount = Number(payment.amount);
    dto.currency = payment.currency;
    dto.transactionId = payment.transactionId;
    dto.completedAt = payment.completedAt;
    dto.failureReason = payment.failureReason;
    dto.createdAt = payment.createdAt;
    dto.updatedAt = payment.updatedAt;
    return dto;
  }
}

export class ResponseOrderDto {
  id!: string;
  orderNumber!: string;
  userId!: string;
  shippingMethodId!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: ShippingStatus })
  shippingStatus!: ShippingStatus;

  @ApiProperty({ enum: OrderPaymentStatus })
  paymentStatus!: OrderPaymentStatus;

  recipientName!: string;
  recipientPhone!: string;
  addressLine!: string;
  ward!: string;
  district!: string;
  city!: string;
  postalCode!: string;
  shippingMethodName!: string;
  shippingFee!: number;
  tax!: number;
  subTotal!: number;
  totalAmount!: number;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt!: Date | null;

  @ApiProperty({ type: [ResponseOrderItemDto] })
  items!: ResponseOrderItemDto[];

  @ApiProperty({ type: [ResponsePaymentDto] })
  payments!: ResponsePaymentDto[];

  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(order: Order): ResponseOrderDto {
    const payments = order.payments.getItems();
    const dto = new ResponseOrderDto();
    dto.id = order.id;
    dto.orderNumber = order.orderNumber;
    dto.userId = order.user.id;
    dto.shippingMethodId = order.shippingMethod.id;
    dto.status = order.status;
    dto.shippingStatus = order.shippingStatus;
    dto.paymentStatus = paymentStatusOf(payments);
    dto.recipientName = order.recipientName;
    dto.recipientPhone = order.recipientPhone;
    dto.addressLine = order.addressLine;
    dto.ward = order.ward;
    dto.district = order.district;
    dto.city = order.city;
    dto.postalCode = order.postalCode;
    dto.shippingMethodName = order.shippingMethodName;
    dto.shippingFee = Number(order.shippingFee);
    dto.tax = Number(order.tax);
    dto.totalAmount = Number(order.totalAmount);
    dto.note = order.note;
    dto.expiresAt = order.expiresAt;
    dto.items = order.items
      .getItems()
      .map((item) => ResponseOrderItemDto.fromEntity(item));
    dto.subTotal =
      dto.items.reduce(
        (total, item) => total + Math.round(item.lineTotal * 100),
        0,
      ) / 100;
    dto.payments = payments.map((payment) =>
      ResponsePaymentDto.fromEntity(payment),
    );
    dto.createdAt = order.createdAt;
    dto.updatedAt = order.updatedAt;
    return dto;
  }
}
