import type { IncomingHttpHeaders } from 'http';
import type { Request } from 'express';
import { UserRole, UserStatus } from '@repo/constants';

export class AuthWebhookEvent {
  type!: string;
  data!: unknown;
}

export abstract class AuthProvider {
  abstract verifyWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): AuthWebhookEvent;
  abstract syncUserName(
    providerId: string,
    name: { firstName: string; lastName: string },
  ): Promise<void>;
  abstract syncUserRole(providerId: string, role: UserRole): Promise<void>;
  abstract syncUserStatus(
    providerId: string,
    status: UserStatus,
  ): Promise<void>;
  abstract getSessionUserId(req: Request): string | null;
}
