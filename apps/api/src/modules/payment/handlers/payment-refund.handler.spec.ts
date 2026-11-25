import { PaymentRefundHandler } from './payment-refund.handler.js';
import type { PaymentService } from '../services/payment.service.js';

describe('PaymentRefundHandler', () => {
  const paymentService = { processRefund: vi.fn() };
  const handler = new PaymentRefundHandler(
    paymentService as unknown as PaymentService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('PaymentRefundHandler forwards the payload to processRefund', async () => {
    paymentService.processRefund.mockResolvedValueOnce(undefined);
    await handler.handle({ paymentId: 'refund-1' });
    expect(paymentService.processRefund).toHaveBeenCalledWith({
      paymentId: 'refund-1',
    });

    const error = new Error('stripe down');
    paymentService.processRefund.mockRejectedValueOnce(error);
    await expect(handler.handle({ paymentId: 'refund-1' })).rejects.toBe(error);
  });
});
