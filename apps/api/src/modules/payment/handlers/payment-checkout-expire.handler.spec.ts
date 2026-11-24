import { PaymentMethod } from '@repo/constants';
import { PaymentCheckoutExpireHandler } from './payment-checkout-expire.handler.js';
import type { PaymentService } from '../services/payment.service.js';

describe('PaymentCheckoutExpireHandler', () => {
  const paymentService = { expireCheckout: vi.fn() };
  const handler = new PaymentCheckoutExpireHandler(
    paymentService as unknown as PaymentService,
  );
  const payload = {
    paymentId: 'payment-1',
    method: PaymentMethod.CARD,
    checkoutSessionId: 'cs_test_1',
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handle forwards the payload to PaymentService.expireCheckout and rejects when it rejects', async () => {
    paymentService.expireCheckout.mockResolvedValueOnce(undefined);
    await handler.handle(payload);
    expect(paymentService.expireCheckout).toHaveBeenCalledWith(payload);

    const error = new Error('stripe down');
    paymentService.expireCheckout.mockRejectedValueOnce(error);
    await expect(handler.handle(payload)).rejects.toBe(error);
  });
});
