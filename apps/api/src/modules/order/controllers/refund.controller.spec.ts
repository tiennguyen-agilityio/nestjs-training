import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { RefundController } from './refund.controller.js';
import { OrderService } from '../services/order.service.js';
import type { ResponsePaymentDto } from '../dto/response-order.dto.js';
import { User } from '../../user/entities/user.entity.js';

describe('RefundController', () => {
  let controller: RefundController;
  let orderService: Record<'retryRefund', Mock>;
  const refund = { id: 'refund-2' } as ResponsePaymentDto;

  beforeEach(async () => {
    orderService = { retryRefund: vi.fn().mockResolvedValue(refund) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundController],
      providers: [{ provide: OrderService, useValue: orderService }],
    }).compile();
    controller = module.get(RefundController);
  });

  it('retry forwards the payment id and the admin', async () => {
    const admin = { id: 'admin-1' } as User;

    await expect(controller.retry(admin, { id: 'refund-1' })).resolves.toBe(
      refund,
    );

    expect(orderService.retryRefund).toHaveBeenCalledWith(
      'refund-1',
      'admin-1',
    );
  });
});
