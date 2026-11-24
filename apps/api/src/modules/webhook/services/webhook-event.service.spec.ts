import type { Mock } from 'vitest';
import { WebhookEventService } from './webhook-event.service.js';
import type { WebhookEventRepository } from '../repositories/webhook-event.repository.js';
import type { WebhookEvent } from '../entities/webhook-event.entity.js';
import { WebhookProvider } from '../enums/webhook-provider.enum.js';
import { WebhookEventStatus } from '../enums/webhook-event-status.enum.js';

describe('WebhookEventService', () => {
  let service: WebhookEventService;
  let repository: Record<'claim' | 'save' | 'transactional', Mock>;
  let event: WebhookEvent;

  beforeEach(() => {
    event = {
      id: 'row-1',
      provider: WebhookProvider.STRIPE,
      eventId: 'evt_1',
      type: 'checkout.session.completed',
      status: WebhookEventStatus.PROCESSED,
    } as WebhookEvent;
    repository = {
      claim: vi.fn().mockResolvedValue(event),
      save: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
    };
    service = new WebhookEventService(
      repository as unknown as WebhookEventRepository,
    );
  });

  it('handleOnce processes a new event and keeps it PROCESSED', async () => {
    const process = vi.fn().mockResolvedValue(true);

    await service.handleOnce(
      WebhookProvider.STRIPE,
      'evt_1',
      'checkout.session.completed',
      process,
    );

    expect(repository.claim).toHaveBeenCalledWith({
      provider: WebhookProvider.STRIPE,
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });
    expect(process).toHaveBeenCalledTimes(1);
    expect(event.status).toBe(WebhookEventStatus.PROCESSED);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.transactional).toHaveBeenCalledTimes(1);
  });

  it('handleOnce records IGNORED when the processing changed nothing', async () => {
    await service.handleOnce(
      WebhookProvider.CLERK,
      'msg-1',
      'session.created',
      vi.fn().mockResolvedValue(false),
    );

    expect(event.status).toBe(WebhookEventStatus.IGNORED);
    expect(repository.save).toHaveBeenCalledWith(event, null);
  });

  it('handleOnce skips an event already recorded', async () => {
    repository.claim.mockResolvedValue(null);
    const process = vi.fn();

    await expect(
      service.handleOnce(WebhookProvider.STRIPE, 'evt_1', 'x', process),
    ).resolves.toBeUndefined();

    expect(process).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('handleOnce lets a processing error propagate without saving', async () => {
    const failure = new Error('boom');

    await expect(
      service.handleOnce(
        WebhookProvider.STRIPE,
        'evt_1',
        'x',
        vi.fn().mockRejectedValue(failure),
      ),
    ).rejects.toBe(failure);

    expect(repository.transactional).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
