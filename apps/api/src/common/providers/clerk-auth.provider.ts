import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, getAuth, type ClerkClient } from '@clerk/express';
import {
  CircuitOpenError,
  ResilienceService,
  ResilienceTimeoutError,
  type ResiliencePolicy,
} from '@nestjs/resilience';
import type { IncomingHttpHeaders } from 'http';
import type { Request } from 'express';
import { Webhook, type WebhookRequiredHeaders } from 'svix';
import { AuthProvider, AuthWebhookEvent } from './auth.provider.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../constants/message.constant.js';
import { ERROR_CODES } from '../constants/error-code.constant.js';
import { DEFAULT_CLERK_SYNC_TIMEOUT_MS } from '../constants/env.constant.js';
import {
  DependencyTimeoutException,
  DependencyUnavailableException,
} from '../exceptions/base.exception.js';
import { UserRole, UserStatus } from '@repo/constants';

function requiredHeader(
  headers: IncomingHttpHeaders,
  name: keyof WebhookRequiredHeaders,
): string {
  const value = headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export const CLERK_SYNC_BREAKER_NAME = 'clerk-sync';

@Injectable()
export class ClerkAuthProvider implements AuthProvider {
  private readonly clerkClient: ClerkClient;
  private readonly verifier: Webhook;
  // One policy for both sync methods, so they share one breaker; the timeout
  // bounds a whole method. Clerk's SDK takes no AbortSignal, so a timeout stops
  // our wait but cannot cancel the request already sent.
  private readonly syncPolicy: ResiliencePolicy;

  constructor(configService: ConfigService, resilience: ResilienceService) {
    this.clerkClient = createClerkClient({
      secretKey: configService.getOrThrow<string>('CLERK_SECRET_KEY'),
    });
    this.verifier = new Webhook(
      configService.getOrThrow<string>('CLERK_WEBHOOK_SECRET'),
    );
    this.syncPolicy = resilience.create(
      {
        // An empty CLERK_SYNC_TIMEOUT_MS= reaches here as 0 after env validation; 0, '' or an
        // unset value all mean the default.
        timeout:
          Number(configService.get<number | string>('CLERK_SYNC_TIMEOUT_MS')) ||
          DEFAULT_CLERK_SYNC_TIMEOUT_MS,
        circuitBreaker: {
          name: CLERK_SYNC_BREAKER_NAME,
          slidingWindow: { type: 'count', size: 10 },
          minimumCalls: 5,
          failureRateThreshold: 50,
          openDuration: '30s',
          halfOpenMaxCalls: 1,
        },
      },
      CLERK_SYNC_BREAKER_NAME,
    );
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): AuthWebhookEvent {
    if (!rawBody) {
      throw new BadRequestException(ERROR_MESSAGES.WEBHOOK.INVALID_SIGNATURE);
    }

    const svixHeaders: WebhookRequiredHeaders = {
      'svix-id': requiredHeader(headers, 'svix-id'),
      'svix-timestamp': requiredHeader(headers, 'svix-timestamp'),
      'svix-signature': requiredHeader(headers, 'svix-signature'),
    };

    try {
      return this.verifier.verify(rawBody, svixHeaders) as AuthWebhookEvent;
    } catch {
      throw new BadRequestException(ERROR_MESSAGES.WEBHOOK.INVALID_SIGNATURE);
    }
  }

  syncUserRole(providerId: string, role: UserRole): Promise<void> {
    return this.runSync(async () => {
      await this.clerkClient.users.updateUserMetadata(providerId, {
        publicMetadata: { role },
      });
    });
  }

  syncUserStatus(providerId: string, status: UserStatus): Promise<void> {
    return this.runSync(async () => {
      if (status === UserStatus.INACTIVE) {
        await this.clerkClient.users.banUser(providerId);
        return;
      }

      // A user may be blocked in Clerk by either ban or lock, and the webhook maps both to
      // INACTIVE, so re-activating has to clear both.
      await this.clerkClient.users.unbanUser(providerId);
      await this.clerkClient.users.unlockUser(providerId);
    });
  }

  getSessionUserId(req: Request): string | null {
    return getAuth(req).userId ?? null;
  }

  private async runSync(fn: () => Promise<void>): Promise<void> {
    try {
      await this.syncPolicy.execute(fn);
    } catch (error) {
      if (error instanceof ResilienceTimeoutError) {
        throw new DependencyTimeoutException({
          errCode: ERROR_CODES.AUTH_PROVIDER.TIMEOUT,
          field: '',
          message: ERROR_MESSAGES.AUTH_PROVIDER.TIMEOUT,
          description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.TIMEOUT,
        });
      }
      if (error instanceof CircuitOpenError) {
        throw new DependencyUnavailableException(
          {
            errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
            field: '',
            message: ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
            description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
          },
          // A half-open breaker rejects with retryAfterMs 0; never tell clients to retry at once.
          Math.max(1, Math.ceil(error.retryAfterMs / 1000)),
        );
      }
      throw error;
    }
  }
}
