import { Collection } from '@mikro-orm/core';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants';
import { ResponseOrderRowDto } from './response-order-row.dto.js';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { User } from '../../user/entities/user.entity.js';

const createdAt = new Date('2026-11-24T08:00:00.000Z');

const charge = (method: PaymentMethod, at: string): Payment =>
  Object.assign(new Payment(), {
    id: `payment-${at}`,
    type: PaymentType.CHARGE,
    method,
    status: PaymentStatus.PENDING,
    amount: '34.50',
    createdAt: new Date(at),
  });

const orderWith = (quantities: number[], payments: Payment[]): Order => {
  const order = Object.assign(new Order(), {
    id: 'order-1',
    orderNumber: 'CH-261124-0001',
    user: Object.assign(new User(), {
      id: 'user-1',
      firstName: 'Lan',
      lastName: 'Nguyen',
      email: 'lan@example.com',
    }),
    status: OrderStatus.PENDING,
    shippingStatus: ShippingStatus.PENDING,
    totalAmount: '34.50',
    createdAt,
  });
  order.items = new Collection<OrderItem>(
    order,
    quantities.map((quantity, index) =>
      Object.assign(new OrderItem(), { id: `item-${index}`, quantity }),
    ),
  );
  order.payments = new Collection<Payment>(order, payments);
  return order;
};

describe('ResponseOrderRowDto.fromEntity', () => {
  it('maps the OROW fields', () => {
    const dto = ResponseOrderRowDto.fromEntity(
      orderWith([1], [charge(PaymentMethod.COD, '2026-11-24T08:00:00Z')]),
    );

    expect(dto).toMatchObject({
      id: 'order-1',
      orderNumber: 'CH-261124-0001',
      userId: 'user-1',
      customer: {
        firstName: 'Lan',
        lastName: 'Nguyen',
        email: 'lan@example.com',
      },
      status: OrderStatus.PENDING,
      shippingStatus: ShippingStatus.PENDING,
      totalAmount: 34.5,
      createdAt,
    });
  });

  it('counts itemCount as the sum of quantities', () => {
    expect(
      ResponseOrderRowDto.fromEntity(orderWith([2, 3], [])).itemCount,
    ).toBe(5);
  });

  it('takes paymentMethod from the newest CHARGE', () => {
    const dto = ResponseOrderRowDto.fromEntity(
      orderWith(
        [1],
        [
          charge(PaymentMethod.CARD, '2026-11-24T11:00:00Z'),
          charge(PaymentMethod.COD, '2026-11-24T10:00:00Z'),
        ],
      ),
    );

    expect(dto.paymentMethod).toBe(PaymentMethod.CARD);
    expect(
      ResponseOrderRowDto.fromEntity(orderWith([1], [])).paymentMethod,
    ).toBeNull();
  });

  it('takes paymentStatus from paymentStatusOf', () => {
    const dto = ResponseOrderRowDto.fromEntity(
      orderWith([1], [charge(PaymentMethod.COD, '2026-11-24T08:00:00Z')]),
    );

    expect(dto.paymentStatus).toBe(OrderPaymentStatus.UNPAID);
  });
});
