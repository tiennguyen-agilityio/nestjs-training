import { Injectable, Logger } from '@nestjs/common';
import { User } from '../entities/user.entity.js';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserProfileSyncInput,
} from '../dto/user.schema.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { FindOptions } from '../../../common/interfaces/repository-options.interface.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
  InvalidRequestException,
} from '../../../common/exceptions/base.exception.js';
import { AuthProvider } from '../../../common/providers/auth.provider.js';
import { UserRole, UserStatus } from '@repo/constants';
import { assignDefinedFields } from '../../../common/utils/object.util.js';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly authProvider: AuthProvider,
  ) {}

  async create(dto: CreateUserInput): Promise<User> {
    await this.assertNotDuplicate(dto);
    return this.userRepository.create(dto);
  }

  // A user from the auth provider's `user.created`: its role is synced back
  // through the outbox, committed with the user row.
  async createFromAuthProvider(dto: CreateUserInput): Promise<User> {
    await this.assertNotDuplicate(dto);
    return this.userRepository.createWithRoleSync(dto);
  }

  /**
   * The outbox's `user.role-sync`: pushes the role the user has now. An error
   * from the auth provider propagates, so the relay retries the message.
   */
  async syncRoleToAuthProvider(clerkId: string): Promise<void> {
    const role = await this.userRepository.findRoleByClerkId(clerkId);
    if (!role) {
      this.logger.warn(
        `Role sync for ${clerkId} skipped: no such user (deleted since it was created)`,
      );
      return;
    }

    await this.authProvider.syncUserRole(clerkId, role);
  }

  private async assertNotDuplicate(dto: CreateUserInput): Promise<void> {
    const existingByEmail = await this.userRepository.findByEmail(dto.email, {
      includeDeleted: true,
    });
    if (existingByEmail) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.USER.EMAIL_EXISTS,
        field: 'email',
        message: ERROR_MESSAGES.USER.EMAIL_EXISTS,
        description: ERROR_DESCRIPTIONS.USER.EMAIL_EXISTS,
      });
    }

    const existingByClerkId = await this.userRepository.findByClerkId(
      dto.clerkId,
      { includeDeleted: true },
    );
    if (existingByClerkId) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.USER.CLERK_ID_EXISTS,
        field: 'clerkId',
        message: ERROR_MESSAGES.USER.CLERK_ID_EXISTS,
        description: ERROR_DESCRIPTIONS.USER.CLERK_ID_EXISTS,
      });
    }
  }

  async findAll(
    query: QueryParams,
    filters: UserFilters = {},
    options?: FindOptions,
  ): Promise<PaginatedResult<User>> {
    const result = await this.userRepository.findAll(query, filters, options);
    const { totalCount, pageCount } = result.meta;

    if (totalCount > 0 && query.page > pageCount) {
      throw new InvalidRequestException({
        errCode: ERROR_CODES.PAGINATION.PAGE_OUT_OF_RANGE,
        field: 'page',
        message: ERROR_MESSAGES.PAGINATION.PAGE_OUT_OF_RANGE,
        description: ERROR_DESCRIPTIONS.PAGINATION.PAGE_OUT_OF_RANGE(pageCount),
      });
    }

    return result;
  }

  async findOne(id: string, options?: FindOptions): Promise<User> {
    const user = await this.userRepository.findById(id, options);
    if (!user) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.USER.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.USER.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.USER.NOT_FOUND_BY_ID,
      });
    }

    return user;
  }

  async findByClerkId(clerkId: string): Promise<User> {
    const user = await this.userRepository.findByClerkId(clerkId);
    if (!user) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.USER.NOT_FOUND,
        field: 'clerkId',
        message: ERROR_MESSAGES.USER.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.USER.NOT_FOUND_BY_CLERK_ID,
      });
    }

    return user;
  }

  // Local write only — used by the auth-provider webhook to mirror provider state into the DB.
  async update(id: string, dto: UserProfileSyncInput): Promise<User> {
    const user = await this.findOne(id);
    return this.applyUpdates(user, dto);
  }

  // `role` and `status` are owned by the auth provider: push them there and let the
  // `user.updated` webhook write them back to the DB. Everything else is written locally.
  // The returned user therefore still holds the previous role/status until the webhook lands.
  async updateByAdmin(id: string, dto: UpdateUserInput): Promise<User> {
    const { role, status, ...profile } = dto;
    const user = await this.findOne(id, { includeDeleted: true });

    if (role !== undefined && role !== (user.role as UserRole)) {
      await this.authProvider.syncUserRole(user.clerkId, role);
    }
    if (status !== undefined && status !== (user.status as UserStatus)) {
      await this.authProvider.syncUserStatus(user.clerkId, status);
    }

    return this.applyUpdates(user, profile);
  }

  private async applyUpdates(
    user: User,
    dto: UserProfileSyncInput,
  ): Promise<User> {
    if (Object.values(dto).every((value) => value === undefined)) {
      return user;
    }

    assignDefinedFields(user, dto);
    await this.userRepository.save(user);

    return user;
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.authProvider.syncUserStatus(user.clerkId, UserStatus.INACTIVE);
    user.status = UserStatus.INACTIVE;
    await this.userRepository.softDelete(user);
  }
}
