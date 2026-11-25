import { Collection } from '@mikro-orm/core';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants';
import { ResponseOrderDetailDto } from './response-order-detail.dto.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { ShippingMethod } from '../../shipping-method/entities/shipping-method.entity.js';
import { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';

const orderOf = (user: User): Order => {
  const order = Object.assign(new Order(), {
    id: 'order-1',
    user,
    shippingMethod: Object.assign(new ShippingMethod(), { id: 'method-1' }),
    orderNumber: 'ORD-ABC123-WXYZ',
    shippingFee: '12.00',
    tax: '2.00',
    totalAmount: '34.00',
  });
  order.items = new Collection<OrderItem>(order, [
    Object.assign(new OrderItem(), {
      id: 'item-1',
      productVariant: Object.assign(new ProductVariant(), { id: 'variant-1' }),
      unitPrice: '10.00',
      discountAmount: '0.00',
      quantity: 2,
    }),
  ]);
  order.payments = new Collection<Payment>(order, [
    Object.assign(new Payment(), {
      id: 'payment-1',
      order,
      method: PaymentMethod.COD,
      amount: '34.00',
    }),
  ]);
  return order;
};

describe('ResponseOrderDetailDto', () => {
  it('fromEntity leaves the allowed statuses out unless given', () => {
    const user = Object.assign(new User(), {
      id: 'user-1',
      firstName: 'Lan',
      lastName: 'Nguyễn',
      email: 'lan@example.com',
    });

    const plain = JSON.parse(
      JSON.stringify(ResponseOrderDetailDto.fromEntity(orderOf(user))),
    ) as Record<string, unknown>;
    expect(plain).not.toHaveProperty('allowedStatuses');
    expect(plain).not.toHaveProperty('allowedShippingStatuses');

    const withAllowed = ResponseOrderDetailDto.fromEntity(orderOf(user), {
      statuses: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      shippingStatuses: [ShippingStatus.SHIPPING],
    });
    expect(withAllowed.allowedStatuses).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ]);
    expect(withAllowed.allowedShippingStatuses).toEqual([
      ShippingStatus.SHIPPING,
    ]);
  });

  it('ResponseOrderDetailDto adds the customer', () => {
    const user = Object.assign(new User(), {
      id: 'user-1',
      firstName: 'Lan',
      lastName: 'Nguyễn',
      email: 'lan@example.com',
    });

    const dto = ResponseOrderDetailDto.fromEntity(orderOf(user));

    expect(dto).toBeInstanceOf(ResponseOrderDetailDto);
    expect(dto.customer).toEqual({
      firstName: 'Lan',
      lastName: 'Nguyễn',
      email: 'lan@example.com',
    });
    expect(dto).toMatchObject({
      id: 'order-1',
      orderNumber: 'ORD-ABC123-WXYZ',
      userId: 'user-1',
      subTotal: 20,
      paymentStatus: OrderPaymentStatus.UNPAID,
    });
    expect(dto.items).toHaveLength(1);
  });
});
