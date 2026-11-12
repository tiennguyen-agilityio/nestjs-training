import { Inject, Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import { User } from '../entities/user.entity.js';
import type { CreateUserInput, UserFilters } from '../dto/user.schema.js';
import type { UserRole } from '@repo/constants';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import {
  FindOptions,
  ListOptions,
} from '../../../common/interfaces/repository-options.interface.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import { OUTBOX_TOPICS } from '../../../common/constants/outbox.constant.js';
import type { UserRoleSyncPayload } from '../../../common/interfaces/outbox-payload.interface.js';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected readonly entity = User;

  // Property injection keeps BaseRepository's constructor, the only one that sees the ORM.
  @Inject(Outbox)
  private readonly outbox!: Outbox;

  findByEmail(email: string, options?: FindOptions): Promise<User | null> {
    return this.findOneBy({ email }, options);
  }

  findByClerkId(clerkId: string, options?: FindOptions): Promise<User | null> {
    return this.findOneBy({ clerkId }, options);
  }

  findAll(
    query: QueryParams,
    filters: UserFilters = {},
    options?: FindOptions,
  ): Promise<PaginatedResult<User>> {
    const where: ListOptions<User>['where'] = {};
    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;

    return this.paginate(query, {
      where,
      includeDeleted: options?.includeDeleted,
      excludeId: options?.excludeId,
      search: {
        term: query.search,
        fields: ['email', 'firstName', 'lastName'],
      },
    });
  }

  create(data: CreateUserInput): Promise<User> {
    return this.createAndSave({ ...data });
  }

  /** The role of a (not soft-deleted) user, from a context of its own: callable outside a request. */
  findRoleByClerkId(clerkId: string): Promise<UserRole | null> {
    return this.inOwnContext(async () => {
      const user = await this.findByClerkId(clerkId);
      return user ? user.role : null;
    });
  }

  /**
   * Inserts the user and, in the same transaction, the outbox message that
   * syncs its role to the auth provider; then wakes the relay.
   */
  async createWithRoleSync(data: CreateUserInput): Promise<User> {
    const user = await this.inTransaction(async (tx) => {
      const created = await this.createAndSave({ ...data });
      await this.outbox.add<UserRoleSyncPayload>(tx, {
        topic: OUTBOX_TOPICS.USER_ROLE_SYNC,
        key: created.clerkId,
        payload: { clerkId: created.clerkId },
      });
      return created;
    });
    this.outbox.notify();

    return user;
  }
}
