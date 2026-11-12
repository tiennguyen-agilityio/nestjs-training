import { Injectable, Logger } from '@nestjs/common';
import type { WebhookEvent, UserWebhookEvent } from '@clerk/express';
import type { IncomingHttpHeaders } from 'http';
import { UserService } from '../../user/services/user.service.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import {
  AuthProvider,
  type AuthWebhookEvent,
} from '../../../common/providers/auth.provider.js';
import { UserRole, UserStatus } from '@repo/constants';

const ClerkWebhookEventType = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
} as const;

// `user.created` and `user.updated` share the exact same `Webhook<'user.created' | 'user.updated', UserJSON>`
// branch in @clerk/backend's UserWebhookEvent union, so Extract must target that combined literal
// union — extracting on a single literal here resolves to `never` because the branch's own
// `type` field isn't assignable to just one of the two literals.
type UserCreatedOrUpdatedEvent = Extract<
  UserWebhookEvent,
  { type: 'user.created' | 'user.updated' }
>;

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(
    private readonly authProvider: AuthProvider,
    private readonly userService: UserService,
  ) {}

  verifyAndParse(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): AuthWebhookEvent {
    return this.authProvider.verifyWebhook(rawBody, headers);
  }

  async handleEvent(authEvent: AuthWebhookEvent): Promise<void> {
    // The Clerk-specific field shapes below (email_addresses, primary_email_address_id, ...)
    // are only valid once we know the provider is Clerk — this cast is the one place that
    // boundary is crossed; AuthProvider itself stays provider-agnostic.
    const event = authEvent as unknown as WebhookEvent;
    switch (event.type) {
      case ClerkWebhookEventType.USER_CREATED:
        await this.handleUserCreated(event);
        break;
      case ClerkWebhookEventType.USER_UPDATED:
        await this.handleUserUpdated(event);
        break;
      case ClerkWebhookEventType.USER_DELETED:
        await this.handleUserDeleted(event);
        break;
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleUserCreated(
    event: UserCreatedOrUpdatedEvent,
  ): Promise<void> {
    const { data } = event;
    const primaryEmail = data.email_addresses.find(
      (address) => address.id === data.primary_email_address_id,
    );

    if (!primaryEmail) {
      this.logger.warn(
        `Clerk user.created for ${data.id} has no primary email, skipping`,
      );
      return;
    }

    const publicMetadata = data.public_metadata as { role?: UserRole };

    try {
      await this.userService.createFromAuthProvider({
        clerkId: data.id,
        email: primaryEmail.email_address,
        firstName: data.first_name ?? '',
        lastName: data.last_name ?? '',
        phoneNumber: data.phone_numbers.find(
          (phone) => phone.id === data.primary_phone_number_id,
        )?.phone_number,
        avatarUrl: data.image_url,
        role: publicMetadata.role,
      });
    } catch (err) {
      if (err instanceof DuplicateResourceException) {
        this.logger.warn(
          `Clerk user.created for ${data.id} already synced, skipping`,
        );
        return;
      }
      throw err;
    }
  }

  private async handleUserUpdated(
    event: UserCreatedOrUpdatedEvent,
  ): Promise<void> {
    const { data } = event;
    const existing = await this.findByClerkIdOrNull(data.id);
    if (!existing) {
      return;
    }

    const publicMetadata = data.public_metadata as { role?: UserRole };

    await this.userService.update(existing.id, {
      firstName: data.first_name ?? '',
      lastName: data.last_name ?? '',
      phoneNumber: data.phone_numbers.find(
        (phone) => phone.id === data.primary_phone_number_id,
      )?.phone_number,
      avatarUrl: data.image_url,
      role: publicMetadata.role,
      status:
        data.banned || data.locked ? UserStatus.INACTIVE : UserStatus.ACTIVE,
    });
  }

  private async handleUserDeleted(
    event: Extract<UserWebhookEvent, { type: 'user.deleted' }>,
  ): Promise<void> {
    const clerkId = event.data.id;
    if (!clerkId) {
      this.logger.warn('Clerk user.deleted received without an id, skipping');
      return;
    }

    const existing = await this.findByClerkIdOrNull(clerkId);
    if (!existing) {
      return;
    }

    await this.userService.remove(existing.id);
  }

  private async findByClerkIdOrNull(
    clerkId: string,
  ): Promise<{ id: string } | null> {
    try {
      return await this.userService.findByClerkId(clerkId);
    } catch (err) {
      if (err instanceof ItemNotFoundException) {
        this.logger.warn(
          `Clerk webhook for ${clerkId} has no matching local user, skipping`,
        );
        return null;
      }
      throw err;
    }
  }
}
