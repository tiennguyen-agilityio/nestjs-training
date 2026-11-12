import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import { UserService } from '../services/user.service.js';
import {
  OUTBOX_CONSUMERS,
  OUTBOX_TOPICS,
} from '../../../common/constants/outbox.constant.js';
import type { UserRoleSyncPayload } from '../../../common/interfaces/outbox-payload.interface.js';

/**
 * Delivers `user.role-sync` messages, written with the user row by
 * `UserRepository.createWithRoleSync`. A rejection is a failed attempt: the
 * relay retries it, then dead-letters it (`OUTBOX_RETRY`).
 */
@Injectable()
export class UserRoleSyncHandler {
  constructor(private readonly userService: UserService) {}

  @OnOutboxMessage(OUTBOX_TOPICS.USER_ROLE_SYNC, {
    consumer: OUTBOX_CONSUMERS.USER_ROLE_SYNC,
  })
  handle(payload: UserRoleSyncPayload): Promise<void> {
    return this.userService.syncRoleToAuthProvider(payload.clerkId);
  }
}
