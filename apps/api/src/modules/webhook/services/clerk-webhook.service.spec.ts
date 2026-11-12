import { Logger } from '@nestjs/common';
import { ClerkWebhookService } from './clerk-webhook.service.js';
import { UserRole } from '@repo/constants';
import type { User } from '../../user/entities/user.entity.js';
import type { Mock } from 'vitest';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

describe('ClerkWebhookService', () => {
  let service: ClerkWebhookService;
  let authProvider: { verifyWebhook: Mock; syncUserRole: Mock };
  let userService: {
    create: Mock;
    createFromAuthProvider: Mock;
    findByClerkId: Mock;
    update: Mock;
    remove: Mock;
  };

  const buildUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-id-1',
      clerkId: 'clerk-1',
      email: 'jane@example.com',
      role: UserRole.USER,
      firstName: 'Jane',
      lastName: 'Doe',
      phoneNumber: null,
      avatarUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as User;

  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    authProvider = { verifyWebhook: vi.fn(), syncUserRole: vi.fn() };
    userService = {
      create: vi.fn(),
      createFromAuthProvider: vi.fn(),
      findByClerkId: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    service = new ClerkWebhookService(authProvider, userService as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const headers = {
    'svix-id': 'msg-1',
    'svix-timestamp': '1700000000',
    'svix-signature': 'v1,abc',
  };

  describe('verifyAndParse', () => {
    it('delegates to AuthProvider.verifyWebhook and returns its result', () => {
      const event = { type: 'user.created', data: { id: 'clerk-1' } };
      authProvider.verifyWebhook.mockReturnValue(event);

      const result = service.verifyAndParse(Buffer.from('{}'), headers);

      expect(authProvider.verifyWebhook).toHaveBeenCalledWith(
        Buffer.from('{}'),
        headers,
      );
      expect(result).toBe(event);
    });
  });

  describe('handleEvent', () => {
    const emailAddresses = [
      { id: 'email-1', email_address: 'jane@example.com' },
    ];

    describe('user.created', () => {
      const createdEventData = {
        id: 'clerk-1',
        email_addresses: emailAddresses,
        primary_email_address_id: 'email-1',
        first_name: 'Jane',
        last_name: 'Doe',
        phone_numbers: [],
        primary_phone_number_id: null,
        image_url: 'https://example.com/avatar.png',
        public_metadata: {},
      };
      const createdEvent = {
        type: 'user.created',
        data: createdEventData,
      } as never;

      it('creates the user through createFromAuthProvider and never calls Clerk itself', async () => {
        userService.createFromAuthProvider.mockResolvedValue(buildUser());

        await service.handleEvent(createdEvent);

        expect(userService.createFromAuthProvider).toHaveBeenCalledWith({
          clerkId: 'clerk-1',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phoneNumber: undefined,
          avatarUrl: 'https://example.com/avatar.png',
          role: undefined,
        });
        expect(userService.create).not.toHaveBeenCalled();
        expect(authProvider.syncUserRole).not.toHaveBeenCalled();
      });

      it('does not call UserService.create when there is no primary email', async () => {
        const eventWithoutPrimaryEmail = {
          type: 'user.created',
          data: {
            ...createdEventData,
            primary_email_address_id: 'missing-id',
          },
        } as never;

        await service.handleEvent(eventWithoutPrimaryEmail);

        expect(userService.createFromAuthProvider).not.toHaveBeenCalled();
        expect(userService.create).not.toHaveBeenCalled();
      });

      it('swallows a DuplicateResourceException from a redelivered webhook', async () => {
        userService.createFromAuthProvider.mockRejectedValue(
          new DuplicateResourceException({
            errCode: ERROR_CODES.USER.EMAIL_EXISTS,
            field: 'email',
            message: ERROR_MESSAGES.USER.EMAIL_EXISTS,
            description: ERROR_DESCRIPTIONS.USER.EMAIL_EXISTS,
          }),
        );

        await expect(
          service.handleEvent(createdEvent),
        ).resolves.toBeUndefined();
        expect(authProvider.syncUserRole).not.toHaveBeenCalled();
      });

      it('lets a non-DuplicateResourceException error from create propagate', async () => {
        userService.createFromAuthProvider.mockRejectedValue(new Error('boom'));

        await expect(service.handleEvent(createdEvent)).rejects.toThrow('boom');
      });
    });

    describe('user.updated', () => {
      const updatedEvent = {
        type: 'user.updated',
        data: {
          id: 'clerk-1',
          email_addresses: emailAddresses,
          primary_email_address_id: 'email-1',
          first_name: 'Janet',
          last_name: 'Doe',
          phone_numbers: [],
          primary_phone_number_id: null,
          image_url: 'https://example.com/avatar2.png',
          public_metadata: { role: 'ADMIN' },
          banned: false,
          locked: false,
        },
      } as never;

      it('updates the matching local user with the mapped fields, no email', async () => {
        const existing = buildUser();
        userService.findByClerkId.mockResolvedValue(existing);

        await service.handleEvent(updatedEvent);

        expect(userService.update).toHaveBeenCalledWith(existing.id, {
          firstName: 'Janet',
          lastName: 'Doe',
          phoneNumber: undefined,
          avatarUrl: 'https://example.com/avatar2.png',
          role: 'ADMIN',
          status: 'ACTIVE',
        });
      });

      it('maps a banned Clerk user to INACTIVE', async () => {
        const existing = buildUser();
        userService.findByClerkId.mockResolvedValue(existing);
        const { data } = updatedEvent as unknown as { data: object };
        const bannedEvent = {
          type: 'user.updated',
          data: { ...data, banned: true },
        };

        await service.handleEvent(bannedEvent);

        expect(userService.update).toHaveBeenCalledWith(
          existing.id,
          expect.objectContaining({ status: 'INACTIVE' }),
        );
      });

      it('maps a locked Clerk user to INACTIVE', async () => {
        const existing = buildUser();
        userService.findByClerkId.mockResolvedValue(existing);
        const { data } = updatedEvent as unknown as { data: object };
        const lockedEvent = {
          type: 'user.updated',
          data: { ...data, locked: true },
        };

        await service.handleEvent(lockedEvent);

        expect(userService.update).toHaveBeenCalledWith(
          existing.id,
          expect.objectContaining({ status: 'INACTIVE' }),
        );
      });

      it('does not throw and does not update when there is no local match', async () => {
        userService.findByClerkId.mockRejectedValue(
          new ItemNotFoundException({
            errCode: ERROR_CODES.USER.NOT_FOUND,
            field: 'clerkId',
            message: ERROR_MESSAGES.USER.NOT_FOUND,
            description: ERROR_DESCRIPTIONS.USER.NOT_FOUND_BY_CLERK_ID,
          }),
        );

        await expect(
          service.handleEvent(updatedEvent),
        ).resolves.toBeUndefined();
        expect(userService.update).not.toHaveBeenCalled();
      });
    });

    describe('user.deleted', () => {
      const deletedEvent = {
        type: 'user.deleted',
        data: { id: 'clerk-1' },
      } as never;

      it('soft-deletes the matching local user', async () => {
        const existing = buildUser();
        userService.findByClerkId.mockResolvedValue(existing);

        await service.handleEvent(deletedEvent);

        expect(userService.remove).toHaveBeenCalledWith(existing.id);
      });

      it('does not throw and does not delete when there is no local match', async () => {
        userService.findByClerkId.mockRejectedValue(
          new ItemNotFoundException({
            errCode: ERROR_CODES.USER.NOT_FOUND,
            field: 'clerkId',
            message: ERROR_MESSAGES.USER.NOT_FOUND,
            description: ERROR_DESCRIPTIONS.USER.NOT_FOUND_BY_CLERK_ID,
          }),
        );

        await expect(
          service.handleEvent(deletedEvent),
        ).resolves.toBeUndefined();
        expect(userService.remove).not.toHaveBeenCalled();
      });

      it('does not throw and does not look up when the event has no clerk id', async () => {
        const eventWithoutId = {
          type: 'user.deleted',
          data: { id: undefined },
        } as never;

        await expect(
          service.handleEvent(eventWithoutId),
        ).resolves.toBeUndefined();
        expect(userService.findByClerkId).not.toHaveBeenCalled();
      });
    });

    describe('unhandled event type', () => {
      it('does not throw and calls none of the UserService methods', async () => {
        const otherEvent = { type: 'session.created', data: {} } as never;

        await expect(service.handleEvent(otherEvent)).resolves.toBeUndefined();
        expect(userService.create).not.toHaveBeenCalled();
        expect(userService.findByClerkId).not.toHaveBeenCalled();
        expect(userService.update).not.toHaveBeenCalled();
        expect(userService.remove).not.toHaveBeenCalled();
      });
    });
  });
});
