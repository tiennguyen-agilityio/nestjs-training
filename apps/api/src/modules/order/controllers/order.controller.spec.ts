import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { PaymentMethod } from '@repo/constants';
import { OrderController } from './order.controller.js';
import { OrderService } from '../services/order.service.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import type { OrderQueryInput, PlaceOrderInput } from '../dto/order.schema.js';
import { User } from '../../user/entities/user.entity.js';

describe('OrderController', () => {
  let controller: OrderController;
  let orderService: Record<
    'place' | 'findMine' | 'findMineOne' | 'cancel',
    Mock
  >;
  const user = { id: 'user-1' } as User;
  const order = { id: 'order-1' } as ResponseOrderDto;

  beforeEach(async () => {
    orderService = {
      place: vi.fn().mockResolvedValue(order),
      findMine: vi.fn(),
      findMineOne: vi.fn().mockResolvedValue(order),
      cancel: vi.fn().mockResolvedValue(order),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: OrderService, useValue: orderService }],
    }).compile();
    controller = module.get(OrderController);
  });

  it('place passes the user id and body to the service', async () => {
    const body: PlaceOrderInput = {
      shippingMethodId: '3f1c2a5e-8b4d-4e6f-9a7b-1c2d3e4f5a6b',
      paymentMethod: PaymentMethod.COD,
      recipientName: 'Lan Nguyen',
      recipientPhone: '0901234567',
      addressLine: '12 Le Loi',
      ward: 'Ben Nghe',
      district: 'District 1',
      city: 'Ho Chi Minh City',
      postalCode: '700000',
    };

    await expect(controller.place(user, body)).resolves.toBe(order);
    expect(orderService.place).toHaveBeenCalledWith('user-1', body);
  });

  it("list passes the caller's id and the query to findMine", async () => {
    const page = {
      data: [],
      meta: { limit: 10, currentPage: 1, pageCount: 0, totalCount: 0 },
    };
    orderService.findMine.mockResolvedValue(page);
    const query: OrderQueryInput = {
      page: 1,
      limit: 10,
      sort: 'createdAt',
      order: 'DESC',
    };

    await expect(controller.list(user, query)).resolves.toBe(page);
    expect(orderService.findMine).toHaveBeenCalledWith('user-1', query);
  });

  it("findOne passes the caller's id and the param", async () => {
    await expect(
      controller.findOne(user, { idOrOrderNumber: 'CH-261124-0001' }),
    ).resolves.toBe(order);
    expect(orderService.findMineOne).toHaveBeenCalledWith(
      'user-1',
      'CH-261124-0001',
    );
  });

  it('cancel forwards the user id and idOrOrderNumber to OrderService.cancel and returns its result', async () => {
    await expect(
      controller.cancel(user, { idOrOrderNumber: 'CH-261124-0001' }),
    ).resolves.toBe(order);
    expect(orderService.cancel).toHaveBeenCalledWith(
      'user-1',
      'CH-261124-0001',
    );
  });
});
