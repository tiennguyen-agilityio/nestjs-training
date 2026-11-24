import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from '../services/payment.service.js';
import { User } from '../../user/entities/user.entity.js';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: Record<'start', Mock>;
  const user = { id: 'user-1' } as User;
  const checkout = {
    paymentId: 'payment-1',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    expiresAt: new Date('2026-11-25T09:00:00Z'),
  };

  beforeEach(async () => {
    paymentService = { start: vi.fn().mockResolvedValue(checkout) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: paymentService }],
    }).compile();
    controller = module.get(PaymentController);
  });

  it('start passes the user id and order id to PaymentService.start', async () => {
    await expect(controller.start(user, { id: 'order-1' })).resolves.toBe(
      checkout,
    );
    expect(paymentService.start).toHaveBeenCalledWith('user-1', 'order-1');
  });
});
