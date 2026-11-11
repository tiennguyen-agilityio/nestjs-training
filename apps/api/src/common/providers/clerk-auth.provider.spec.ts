import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  CircuitOpenError,
  ResilienceModule,
  ResilienceService,
  type ResiliencePolicy,
} from '@nestjs/resilience';
import { createClerkClient, getAuth } from '@clerk/express';
import { Webhook } from 'svix';
import type { Mock } from 'vitest';
import {
  CLERK_SYNC_BREAKER_NAME,
  ClerkAuthProvider,
} from './clerk-auth.provider.js';
import {
  DependencyTimeoutException,
  DependencyUnavailableException,
} from '../exceptions/base.exception.js';
import { UserRole, UserStatus } from '@repo/constants';

const TEST_TIMEOUT_MS = 50;
const UNBAN_DELAY_MS = 45;

const hang = (): Promise<never> => new Promise(() => {});

const clerkError = (status: number, message: string): Error =>
  Object.assign(new Error(message), { status });

const { verify, updateUserMetadata, banUser, unbanUser, unlockUser } =
  vi.hoisted(() => ({
    verify: vi.fn(),
    updateUserMetadata: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    unlockUser: vi.fn(),
  }));

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function Webhook() {
    return { verify };
  }),
}));

vi.mock('@clerk/express', () => ({
  getAuth: vi.fn(),
  createClerkClient: vi.fn().mockImplementation(() => ({
    users: { updateUserMetadata, banUser, unbanUser, unlockUser },
  })),
}));

describe('ClerkAuthProvider', () => {
  let provider: ClerkAuthProvider;
  let configService: { getOrThrow: Mock; get: Mock };

  const buildProvider = async (): Promise<ClerkAuthProvider> => {
    const moduleRef = await Test.createTestingModule({
      imports: [ResilienceModule.forRoot()],
      providers: [
        ClerkAuthProvider,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    return moduleRef.get(ClerkAuthProvider);
  };

  beforeEach(async () => {
    configService = {
      getOrThrow: vi.fn().mockReturnValue('secret'),
      get: vi.fn().mockReturnValue(TEST_TIMEOUT_MS),
    };
    provider = await buildProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // clearAllMocks keeps implementations, so a `hang` or a rejection set by one
    // test would leak into the next.
    for (const clerkMock of [
      verify,
      updateUserMetadata,
      banUser,
      unbanUser,
      unlockUser,
    ]) {
      clerkMock.mockReset();
    }
  });

  it('builds the Clerk client and webhook verifier from ConfigService', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('CLERK_SECRET_KEY');
    expect(configService.getOrThrow).toHaveBeenCalledWith(
      'CLERK_WEBHOOK_SECRET',
    );
    expect(createClerkClient).toHaveBeenCalledWith({ secretKey: 'secret' });
    expect(Webhook).toHaveBeenCalledWith('secret');
  });

  const headers = {
    'svix-id': 'msg-1',
    'svix-timestamp': '1700000000',
    'svix-signature': 'v1,abc',
  };

  describe('verifyWebhook', () => {
    it('returns the parsed event when the signature verifies', () => {
      const event = { type: 'user.created', data: { id: 'clerk-1' } };
      verify.mockReturnValue(event);

      const result = provider.verifyWebhook(Buffer.from('{}'), headers);

      expect(verify).toHaveBeenCalledWith(Buffer.from('{}'), headers);
      expect(result).toBe(event);
    });

    it('throws BadRequestException when signature verification fails', () => {
      verify.mockImplementation(() => {
        throw new Error('bad signature');
      });

      expect(() => provider.verifyWebhook(Buffer.from('{}'), headers)).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException without calling the verifier when the raw body is missing', () => {
      expect(() => provider.verifyWebhook(undefined, headers)).toThrow(
        BadRequestException,
      );
      expect(verify).not.toHaveBeenCalled();
    });
  });

  describe('syncUserRole', () => {
    it('pushes the role into the provider publicMetadata', async () => {
      updateUserMetadata.mockResolvedValue(undefined);

      await provider.syncUserRole('clerk-1', UserRole.ADMIN);

      expect(updateUserMetadata).toHaveBeenCalledWith('clerk-1', {
        publicMetadata: { role: UserRole.ADMIN },
      });
    });

    it('propagates an error from the underlying client unchanged', async () => {
      updateUserMetadata.mockRejectedValue(new Error('clerk api down'));

      await expect(
        provider.syncUserRole('clerk-1', UserRole.USER),
      ).rejects.toThrow('clerk api down');
    });
  });

  describe('syncUserStatus', () => {
    it('bans the provider user when the status is INACTIVE', async () => {
      banUser.mockResolvedValue(undefined);

      await provider.syncUserStatus('clerk-1', UserStatus.INACTIVE);

      expect(banUser).toHaveBeenCalledWith('clerk-1');
      expect(unbanUser).not.toHaveBeenCalled();
    });

    it('unbans and unlocks the provider user when the status is ACTIVE', async () => {
      unbanUser.mockResolvedValue(undefined);
      unlockUser.mockResolvedValue(undefined);

      await provider.syncUserStatus('clerk-1', UserStatus.ACTIVE);

      expect(unbanUser).toHaveBeenCalledWith('clerk-1');
      expect(unlockUser).toHaveBeenCalledWith('clerk-1');
      expect(banUser).not.toHaveBeenCalled();
    });

    it('propagates an error from the underlying client unchanged', async () => {
      banUser.mockRejectedValue(new Error('clerk api down'));

      await expect(
        provider.syncUserStatus('clerk-1', UserStatus.INACTIVE),
      ).rejects.toThrow('clerk api down');
    });
  });

  describe('timeout', () => {
    it('reads the timeout from CLERK_SYNC_TIMEOUT_MS, defaulting to 5000 ms', async () => {
      const createSpy = vi.spyOn(ResilienceService.prototype, 'create');

      configService.get.mockReturnValue(undefined);
      await buildProvider();
      configService.get.mockReturnValue(TEST_TIMEOUT_MS);
      await buildProvider();

      expect(configService.get).toHaveBeenCalledWith('CLERK_SYNC_TIMEOUT_MS');
      expect(createSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ timeout: 5000 }),
        expect.any(String),
      );
      expect(createSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ timeout: TEST_TIMEOUT_MS }),
        expect.any(String),
      );
    });

    // An empty `CLERK_SYNC_TIMEOUT_MS=` arrives as 0 after env validation.
    it.each([undefined, '', 0])(
      'falls back to 5000 ms when CLERK_SYNC_TIMEOUT_MS is %o',
      async (value) => {
        const createSpy = vi.spyOn(ResilienceService.prototype, 'create');
        configService.get.mockReturnValue(value);

        await buildProvider();

        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({ timeout: 5000 }),
          expect.any(String),
        );
      },
    );

    it('fails syncUserRole with DependencyTimeoutException after the configured timeout', async () => {
      updateUserMetadata.mockImplementation(hang);
      const started = Date.now();

      await expect(
        provider.syncUserRole('clerk-1', UserRole.ADMIN),
      ).rejects.toBeInstanceOf(DependencyTimeoutException);
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('fails syncUserStatus with DependencyTimeoutException after the configured timeout', async () => {
      banUser.mockImplementation(hang);
      const started = Date.now();

      await expect(
        provider.syncUserStatus('clerk-1', UserStatus.INACTIVE),
      ).rejects.toBeInstanceOf(DependencyTimeoutException);
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('bounds unban + unlock by one timeout budget', async () => {
      unbanUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, UNBAN_DELAY_MS)),
      );
      unlockUser.mockImplementation(hang);
      const started = Date.now();

      await expect(
        provider.syncUserStatus('clerk-1', UserStatus.ACTIVE),
      ).rejects.toBeInstanceOf(DependencyTimeoutException);
      // One budget for both calls ends near 50 ms; a fresh budget per call would end at 45 + 50 ms.
      expect(Date.now() - started).toBeLessThan(
        UNBAN_DELAY_MS + TEST_TIMEOUT_MS,
      );
      expect(unlockUser).toHaveBeenCalledWith('clerk-1');
    });
  });

  describe('circuit breaker', () => {
    const openBreakerThroughRole = async (): Promise<void> => {
      updateUserMetadata.mockRejectedValue(clerkError(500, 'clerk 500'));
      for (let i = 0; i < 5; i++) {
        await expect(
          provider.syncUserRole('clerk-1', UserRole.USER),
        ).rejects.toThrow('clerk 500');
      }
    };

    it('opens the shared breaker after repeated Clerk failures', async () => {
      await openBreakerThroughRole();

      await expect(
        provider.syncUserRole('clerk-1', UserRole.USER),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
      expect(updateUserMetadata).toHaveBeenCalledTimes(5);
    });

    it('fails both calls immediately with DependencyUnavailableException while the breaker is open', async () => {
      await openBreakerThroughRole();
      updateUserMetadata.mockImplementation(hang);
      banUser.mockImplementation(hang);
      const started = Date.now();

      const roleError: unknown = await provider
        .syncUserRole('clerk-1', UserRole.USER)
        .catch((error: unknown) => error);
      const statusError: unknown = await provider
        .syncUserStatus('clerk-1', UserStatus.INACTIVE)
        .catch((error: unknown) => error);

      expect(Date.now() - started).toBeLessThan(TEST_TIMEOUT_MS);
      expect(roleError).toBeInstanceOf(DependencyUnavailableException);
      expect(statusError).toBeInstanceOf(DependencyUnavailableException);
      const { retryAfterSeconds } =
        statusError as DependencyUnavailableException;
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(30);
      expect(banUser).not.toHaveBeenCalled();
    });

    it('sends a Retry-After of at least 1 s when the breaker gives no wait', async () => {
      // A half-open breaker rejects extra calls with retryAfterMs 0.
      vi.spyOn(ResilienceService.prototype, 'create').mockReturnValue({
        execute: vi
          .fn()
          .mockRejectedValue(new CircuitOpenError(CLERK_SYNC_BREAKER_NAME, 0)),
      } as unknown as ResiliencePolicy);
      provider = await buildProvider();

      const error: unknown = await provider
        .syncUserRole('clerk-1', UserRole.USER)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DependencyUnavailableException);
      expect((error as DependencyUnavailableException).retryAfterSeconds).toBe(
        1,
      );
    });

    it('does not open the breaker on Clerk client errors', async () => {
      updateUserMetadata.mockRejectedValue(clerkError(404, 'not found'));

      for (let i = 0; i < 10; i++) {
        await expect(
          provider.syncUserRole('clerk-1', UserRole.USER),
        ).rejects.toThrow('not found');
      }
      expect(updateUserMetadata).toHaveBeenCalledTimes(10);
    });

    it('calls Clerk once per sync, without retrying', async () => {
      updateUserMetadata.mockRejectedValue(clerkError(500, 'clerk 500'));

      await expect(
        provider.syncUserRole('clerk-1', UserRole.USER),
      ).rejects.toThrow('clerk 500');
      expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSessionUserId', () => {
    it('returns the userId from the Clerk session', () => {
      (getAuth as Mock).mockReturnValue({ userId: 'clerk-1' });

      expect(provider.getSessionUserId({} as never)).toBe('clerk-1');
    });

    it('returns null when there is no Clerk session', () => {
      (getAuth as Mock).mockReturnValue({ userId: null });

      expect(provider.getSessionUserId({} as never)).toBeNull();
    });
  });
});
