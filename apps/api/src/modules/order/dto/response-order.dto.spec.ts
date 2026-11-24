import { Collection } from '@mikro-orm/core';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants';
import { ResponseOrderDto } from './response-order.dto.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { ShippingMethod } from '../../shipping-method/entities/shipping-method.entity.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';

const orderWith = (): Order => {
  const order = Object.assign(new Order(), {
    id: 'order-1',
    user: Object.assign(new User(), { id: 'user-1' }),
    shippingMethod: Object.assign(new ShippingMethod(), { id: 'method-1' }),
    orderNumber: 'ORD-ABC123-WXYZ',
    recipientName: 'Lan Nguyen',
    recipientPhone: '0901234567',
    addressLine: '12 Le Loi',
    ward: 'Ben Nghe',
    district: 'District 1',
    city: 'Ho Chi Minh City',
    postalCode: '700000',
    shippingMethodName: 'Roast Express',
    shippingFee: '12.00',
    tax: '3.80',
    totalAmount: '53.80',
    note: null,
    expiresAt: null,
  });
  const item = (unitPrice: string, discountAmount: string, quantity: number) =>
    Object.assign(new OrderItem(), {
      id: `item-${unitPrice}`,
      productVariant: Object.assign(new ProductVariant(), {
        id: `variant-${unitPrice}`,
      }),
      productName: 'Kenya AA',
      productImage: 'https://example.com/kenya.jpg',
      variantName: '250g',
      unitPrice,
      discountAmount,
      quantity,
    });
  order.items = new Collection<OrderItem>(order, [
    item('10.00', '0.00', 2),
    item('20.00', '1.00', 1),
  ]);
  order.payments = new Collection<Payment>(order, [
    Object.assign(new Payment(), {
      id: 'payment-1',
      order,
      method: PaymentMethod.COD,
      amount: '53.80',
    }),
  ]);
  return order;
};

describe('ResponseOrderDto', () => {
  it('fromEntity maps amounts to numbers and works out subTotal, lineTotal and paymentStatus', () => {
    const dto = ResponseOrderDto.fromEntity(orderWith());

    expect(dto).toMatchObject({
      id: 'order-1',
      orderNumber: 'ORD-ABC123-WXYZ',
      userId: 'user-1',
      shippingMethodId: 'method-1',
      status: OrderStatus.PENDING,
      shippingStatus: ShippingStatus.PENDING,
      paymentStatus: OrderPaymentStatus.UNPAID,
      recipientName: 'Lan Nguyen',
      shippingMethodName: 'Roast Express',
      shippingFee: 12,
      tax: 3.8,
      subTotal: 39,
      totalAmount: 53.8,
      note: null,
      expiresAt: null,
    });
    expect(dto.items).toEqual([
      expect.objectContaining({
        productVariantId: 'variant-10.00',
        unitPrice: 10,
        discountAmount: 0,
        quantity: 2,
        lineTotal: 20,
      }),
      expect.objectContaining({
        productVariantId: 'variant-20.00',
        unitPrice: 20,
        discountAmount: 1,
        quantity: 1,
        lineTotal: 19,
      }),
    ]);
    expect(dto.payments).toEqual([
      expect.objectContaining({
        id: 'payment-1',
        orderId: 'order-1',
        type: PaymentType.CHARGE,
        method: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
        amount: 53.8,
        currency: 'USD',
        transactionId: null,
      }),
    ]);
  });
});
