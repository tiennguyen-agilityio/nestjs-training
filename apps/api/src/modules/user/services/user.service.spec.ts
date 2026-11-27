import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { User } from '../entities/user.entity.js';
import { UserRole, UserStatus } from '@repo/constants';
import { AuthProvider } from '../../../common/providers/auth.provider.js';
import { UserRepository } from '../repositories/user.repository.js';
import { UserAddressService } from './user-address.service.js';
import type { Mock } from 'vitest';
import {
  DuplicateResourceException,
  ItemNotFoundException,
  InvalidRequestException,
} from '../../../common/exceptions/base.exception.js';

const ACTOR = 'admin-1';

describe('UserService', () => {
  let service: UserService;
  let authProvider: {
    syncUserName: Mock;
    syncUserRole: Mock;
    syncUserStatus: Mock;
  };
  let userRepository: {
    findById: Mock;
    findByEmail: Mock;
    findByClerkId: Mock;
    findAll: Mock;
    create: Mock;
    createWithRoleSync: Mock;
    findRoleByClerkId: Mock;
    save: Mock;
    softDelete: Mock;
    transactional: Mock;
  };
  let userAddressService: { softDeleteAllOf: Mock };
  let insideTransaction: boolean;

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-id-1',
    clerkId: 'clerk-1',
    email: 'jane@example.com',
    role: UserRole.USER,
    firstName: 'Jane',
    lastName: 'Doe',
    phoneNumber: null,
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    ...overrides,
  });

  beforeEach(async () => {
    authProvider = {
      syncUserName: vi.fn(),
      syncUserRole: vi.fn(),
      syncUserStatus: vi.fn(),
    };
    userRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByClerkId: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      createWithRoleSync: vi.fn(),
      findRoleByClerkId: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      transactional: vi.fn(async (work: () => Promise<unknown>) => {
        insideTransaction = true;
        try {
          return await work();
        } finally {
          insideTransaction = false;
        }
      }),
    };
    insideTransaction = false;
    userAddressService = { softDeleteAllOf: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepository },
        { provide: AuthProvider, useValue: authProvider },
        { provide: UserAddressService, useValue: userAddressService },
      ],
    }).compile();

    service = module.get(UserService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      clerkId: 'clerk-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('creates and returns a user', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.findByClerkId.mockResolvedValue(null);
      const created = buildUser();
      userRepository.create.mockResolvedValue(created);

      const result = await service.create(dto, ACTOR);

      expect(userRepository.create).toHaveBeenCalledWith(dto, ACTOR);
      expect(result).toBe(created);
    });

    it('checks duplicates including soft-deleted rows, since the unique constraints span them', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.findByClerkId.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(buildUser());

      await service.create(
        {
          clerkId: 'clerk-1',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
        },
        ACTOR,
      );

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'jane@example.com',
        { includeDeleted: true },
      );
      expect(userRepository.findByClerkId).toHaveBeenCalledWith('clerk-1', {
        includeDeleted: true,
      });
    });

    it('throws DuplicateResourceException on duplicate email', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());

      await expect(service.create(dto, ACTOR)).rejects.toBeInstanceOf(
        DuplicateResourceException,
      );
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('throws DuplicateResourceException on duplicate clerkId', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.findByClerkId.mockResolvedValue(buildUser());

      await expect(service.create(dto, ACTOR)).rejects.toBeInstanceOf(
        DuplicateResourceException,
      );
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('passes a client-provided role through to the repository', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.findByClerkId.mockResolvedValue(null);
      const dtoWithRole = { ...dto, role: UserRole.ADMIN };
      userRepository.create.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN }),
      );

      await service.create(dtoWithRole, ACTOR);

      expect(userRepository.create).toHaveBeenCalledWith(dtoWithRole, ACTOR);
    });
  });

  describe('createFromAuthProvider', () => {
    const dto = {
      clerkId: 'clerk-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('creates the user through createWithRoleSync', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.findByClerkId.mockResolvedValue(null);
      const created = buildUser();
      userRepository.createWithRoleSync.mockResolvedValue(created);

      const result = await service.createFromAuthProvider(dto);

      expect(userRepository.createWithRoleSync).toHaveBeenCalledWith(dto, null);
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('throws DuplicateResourceException on duplicate email or clerkId, checking soft-deleted rows too', async () => {
      userRepository.findByEmail.mockResolvedValueOnce(buildUser());
      await expect(service.createFromAuthProvider(dto)).rejects.toBeInstanceOf(
        DuplicateResourceException,
      );
      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'jane@example.com',
        { includeDeleted: true },
      );

      userRepository.findByEmail.mockResolvedValueOnce(null);
      userRepository.findByClerkId.mockResolvedValueOnce(buildUser());
      await expect(service.createFromAuthProvider(dto)).rejects.toBeInstanceOf(
        DuplicateResourceException,
      );
      expect(userRepository.findByClerkId).toHaveBeenCalledWith('clerk-1', {
        includeDeleted: true,
      });

      expect(userRepository.createWithRoleSync).not.toHaveBeenCalled();
    });
  });

  describe('syncRoleToAuthProvider', () => {
    it("pushes the user's current role to the auth provider", async () => {
      userRepository.findRoleByClerkId.mockResolvedValue(UserRole.ADMIN);

      await service.syncRoleToAuthProvider('clerk-1');

      expect(userRepository.findRoleByClerkId).toHaveBeenCalledWith('clerk-1');
      expect(authProvider.syncUserRole).toHaveBeenCalledWith(
        'clerk-1',
        UserRole.ADMIN,
      );
    });

    it('skips a user that no longer exists, without calling the auth provider', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      userRepository.findRoleByClerkId.mockResolvedValue(null);

      await expect(
        service.syncRoleToAuthProvider('clerk-1'),
      ).resolves.toBeUndefined();

      expect(authProvider.syncUserRole).not.toHaveBeenCalled();
    });

    it('lets an auth provider error propagate, so the relay retries', async () => {
      userRepository.findRoleByClerkId.mockResolvedValue(UserRole.USER);
      authProvider.syncUserRole.mockRejectedValue(new Error('clerk down'));

      await expect(service.syncRoleToAuthProvider('clerk-1')).rejects.toThrow(
        'clerk down',
      );
    });

    it('a second delivery of the same message pushes the same current role again', async () => {
      userRepository.findRoleByClerkId.mockResolvedValue(UserRole.USER);

      await service.syncRoleToAuthProvider('clerk-1');
      await service.syncRoleToAuthProvider('clerk-1');

      expect(authProvider.syncUserRole).toHaveBeenCalledTimes(2);
      expect(authProvider.syncUserRole).toHaveBeenNthCalledWith(
        1,
        'clerk-1',
        UserRole.USER,
      );
      expect(authProvider.syncUserRole).toHaveBeenNthCalledWith(
        2,
        'clerk-1',
        UserRole.USER,
      );
      expect(authProvider.syncUserStatus).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('forwards the pagination query and options to the repository and returns its result, unmodified', async () => {
      // Soft-delete exclusion is enforced by BaseEntity's default MikroORM
      // @Filter at the DB layer, not by this service — that mechanism can
      // only be genuinely verified against a real DB (see the e2e suite).
      // This test only guards against the service re-filtering or wrapping
      // the repository's result.
      const paginatedUsers = {
        data: [buildUser()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      userRepository.findAll.mockResolvedValue(paginatedUsers);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { role: UserRole.ADMIN },
        { includeDeleted: true },
      );

      expect(userRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        { role: UserRole.ADMIN },
        { includeDeleted: true },
      );
      expect(result).toBe(paginatedUsers);
    });

    it('passes a client-provided status through to the repository', async () => {
      const paginatedUsers = {
        data: [buildUser()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      userRepository.findAll.mockResolvedValue(paginatedUsers);

      await service.findAll(
        { page: 1, limit: 10 },
        { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
        { includeDeleted: true },
      );

      expect(userRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
        { includeDeleted: true },
      );
    });

    it('throws InvalidRequestException when the requested page exceeds pageCount', async () => {
      userRepository.findAll.mockResolvedValue({
        data: [],
        meta: { limit: 10, currentPage: 5, pageCount: 4, totalCount: 35 },
      });

      await expect(
        service.findAll({ page: 5, limit: 10 }),
      ).rejects.toBeInstanceOf(InvalidRequestException);
    });

    it('does not throw for an in-range page equal to pageCount', async () => {
      const paginatedUsers = {
        data: [buildUser()],
        meta: { limit: 10, currentPage: 4, pageCount: 4, totalCount: 35 },
      };
      userRepository.findAll.mockResolvedValue(paginatedUsers);

      const result = await service.findAll({ page: 4, limit: 10 });

      expect(result).toBe(paginatedUsers);
    });

    it('does not throw for page 1 when there is no data at all', async () => {
      const paginatedUsers = {
        data: [],
        meta: { limit: 10, currentPage: 1, pageCount: 0, totalCount: 0 },
      };
      userRepository.findAll.mockResolvedValue(paginatedUsers);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toBe(paginatedUsers);
    });
  });

  describe('findOne', () => {
    it('returns an existing user', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      const result = await service.findOne('user-id-1', {
        includeDeleted: true,
      });

      expect(userRepository.findById).toHaveBeenCalledWith('user-id-1', {
        includeDeleted: true,
      });
      expect(result).toBe(user);
    });

    it('throws ItemNotFoundException when the repository has no match (covers both a missing id and a soft-deleted one, since soft-delete filtering happens at the MikroORM/DB layer, not here)', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
    });
  });

  describe('findByClerkId', () => {
    it('returns the matching user', async () => {
      const user = buildUser();
      userRepository.findByClerkId.mockResolvedValue(user);

      const result = await service.findByClerkId('clerk-1');

      expect(userRepository.findByClerkId).toHaveBeenCalledWith('clerk-1');
      expect(result).toBe(user);
    });

    it('throws ItemNotFoundException for a non-matching clerkId', async () => {
      userRepository.findByClerkId.mockResolvedValue(null);

      await expect(
        service.findByClerkId('missing-clerk-id'),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });

  describe('update', () => {
    const admin = 'admin-1';

    it('update from the webhook sets updatedBy null when a profile field changes', async () => {
      const user = buildUser({ updatedBy: admin });
      userRepository.findById.mockResolvedValue(user);

      await service.update('user-id-1', { firstName: 'Janet' });

      expect(user.updatedBy).toBeNull();
      expect(userRepository.save).toHaveBeenCalledWith(user, null);
    });

    it('update from the webhook keeps updatedBy when only role or status changes', async () => {
      const user = buildUser({ updatedBy: admin });
      userRepository.findById.mockResolvedValue(user);

      await service.update('user-id-1', {
        firstName: 'Jane',
        lastName: 'Doe',
        role: UserRole.ADMIN,
        status: UserStatus.INACTIVE,
      });

      expect(user.role).toBe(UserRole.ADMIN);
      expect(user.updatedBy).toBe(admin);
      expect(userRepository.save).toHaveBeenCalledWith(user, null);
    });

    it('update from the webhook sets updatedBy null when profile and role both change', async () => {
      const user = buildUser({ updatedBy: admin });
      userRepository.findById.mockResolvedValue(user);

      await service.update('user-id-1', {
        lastName: 'Smith',
        role: UserRole.ADMIN,
      });

      expect(user.updatedBy).toBeNull();
    });

    it('update from the webhook saves nothing when nothing changes', async () => {
      const user = buildUser({ updatedBy: admin });
      userRepository.findById.mockResolvedValue(user);

      await service.update('user-id-1', {
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: null,
        avatarUrl: null,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      expect(user.updatedBy).toBe(admin);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('updates and returns the user', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      const dto = { firstName: 'Janet' };

      const result = await service.update('user-id-1', dto);

      expect(user.firstName).toBe('Janet');
      expect(userRepository.save).toHaveBeenCalledWith(user, null);
      expect(result).toBe(user);
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { firstName: 'Janet' }),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateByAdmin', () => {
    it('pushes a status change to the auth provider and records the admin without writing the status', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      const result = await service.updateByAdmin(
        'user-id-1',
        {
          status: UserStatus.INACTIVE,
        },
        ACTOR,
      );

      expect(authProvider.syncUserStatus).toHaveBeenCalledWith(
        'clerk-1',
        UserStatus.INACTIVE,
      );
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
      expect(result).toBe(user);
    });

    it('updateByAdmin stamps updatedBy when only role changes', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin('user-id-1', { role: UserRole.ADMIN }, ACTOR);

      expect(authProvider.syncUserRole).toHaveBeenCalledWith(
        'clerk-1',
        UserRole.ADMIN,
      );
      expect(user.role).toBe(UserRole.USER);
      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
      expect(
        authProvider.syncUserRole.mock.invocationCallOrder[0],
      ).toBeLessThan(userRepository.save.mock.invocationCallOrder[0]);
    });

    it('skips the auth provider when role and status are unchanged', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin(
        'user-id-1',
        {
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
        ACTOR,
      );

      expect(authProvider.syncUserRole).not.toHaveBeenCalled();
      expect(authProvider.syncUserStatus).not.toHaveBeenCalled();
    });

    it('pushes a name change to the auth provider before writing it locally', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin('user-id-1', { lastName: 'Nguyen' }, ACTOR);

      expect(authProvider.syncUserName).toHaveBeenCalledWith('clerk-1', {
        firstName: 'Jane',
        lastName: 'Nguyen',
      });
      expect(user.lastName).toBe('Nguyen');
      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
      expect(
        authProvider.syncUserName.mock.invocationCallOrder[0],
      ).toBeLessThan(userRepository.save.mock.invocationCallOrder[0]);
    });

    it('skips the name push when the names are unchanged', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin(
        'user-id-1',
        { firstName: 'Jane', lastName: 'Doe' },
        ACTOR,
      );

      expect(authProvider.syncUserName).not.toHaveBeenCalled();
    });

    it('keeps the old name locally when the name push fails', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserName.mockRejectedValue(new Error('clerk down'));

      await expect(
        service.updateByAdmin('user-id-1', { firstName: 'Janet' }, ACTOR),
      ).rejects.toThrow('clerk down');
      expect(user.firstName).toBe('Jane');
    });

    it('updateByAdmin saves nothing when nothing changed', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin(
        'user-id-1',
        { role: UserRole.USER, status: UserStatus.ACTIVE },
        ACTOR,
      );

      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('writes profile fields locally alongside a provider-synced status', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin(
        'user-id-1',
        {
          firstName: 'Janet',
          status: UserStatus.INACTIVE,
        },
        ACTOR,
      );

      expect(authProvider.syncUserStatus).toHaveBeenCalled();
      expect(user.firstName).toBe('Janet');
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
    });

    it('does not apply the profile fields when the auth provider call fails', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserStatus.mockRejectedValue(new Error('clerk down'));

      await expect(
        service.updateByAdmin(
          'user-id-1',
          {
            firstName: 'Janet',
            status: UserStatus.INACTIVE,
          },
          ACTOR,
        ),
      ).rejects.toThrow('clerk down');
      expect(user.firstName).toBe('Jane');
    });

    it('records the admin when a status-only push fails, since it may have reached the provider', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserStatus.mockRejectedValue(new Error('clerk timeout'));

      await expect(
        service.updateByAdmin(
          'user-id-1',
          { status: UserStatus.INACTIVE },
          ACTOR,
        ),
      ).rejects.toThrow('clerk timeout');

      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
    });

    it('records the admin when the role push fails, since it may have reached the provider', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserRole.mockRejectedValue(new Error('clerk timeout'));

      await expect(
        service.updateByAdmin('user-id-1', { role: UserRole.ADMIN }, ACTOR),
      ).rejects.toThrow('clerk timeout');

      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
    });

    it('keeps the auth provider error when recording the admin fails too', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserStatus.mockRejectedValue(new Error('clerk down'));
      userRepository.save.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateByAdmin(
          'user-id-1',
          { role: UserRole.ADMIN, status: UserStatus.INACTIVE },
          ACTOR,
        ),
      ).rejects.toThrow('clerk down');
      expect(
        authProvider.syncUserRole.mock.invocationCallOrder[0],
      ).toBeLessThan(userRepository.save.mock.invocationCallOrder[0]);
    });

    it('records the admin when the role push succeeded but the status push fails', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      authProvider.syncUserStatus.mockRejectedValue(new Error('clerk down'));

      await expect(
        service.updateByAdmin(
          'user-id-1',
          {
            firstName: 'Janet',
            role: UserRole.ADMIN,
            status: UserStatus.INACTIVE,
          },
          ACTOR,
        ),
      ).rejects.toThrow('clerk down');

      expect(authProvider.syncUserRole).toHaveBeenCalled();
      expect(user.firstName).toBe('Jane');
      expect(userRepository.save).toHaveBeenCalledWith(user, ACTOR);
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateByAdmin(
          'missing-id',
          { status: UserStatus.INACTIVE },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(authProvider.syncUserStatus).not.toHaveBeenCalled();
    });

    it('looks up a soft-deleted user too, so it can be reactivated', async () => {
      const user = buildUser({
        status: UserStatus.INACTIVE,
        deletedAt: new Date(),
      });
      userRepository.findById.mockResolvedValue(user);

      await service.updateByAdmin(
        'user-id-1',
        {
          status: UserStatus.ACTIVE,
        },
        ACTOR,
      );

      expect(userRepository.findById).toHaveBeenCalledWith('user-id-1', {
        includeDeleted: true,
      });
      expect(authProvider.syncUserStatus).toHaveBeenCalledWith(
        'clerk-1',
        UserStatus.ACTIVE,
      );
    });
  });

  describe('saveFirstPhone', () => {
    it('saveFirstPhone stores the phone, stamped by the user, when the user has none', async () => {
      const user = buildUser({ phoneNumber: null });
      userRepository.findById.mockResolvedValue(user);

      await service.saveFirstPhone('user-id-1', '0901234567');

      expect(userRepository.findById).toHaveBeenCalledWith('user-id-1');
      expect(user.phoneNumber).toBe('0901234567');
      expect(userRepository.save).toHaveBeenCalledWith(user, 'user-id-1');
    });

    it('saveFirstPhone does nothing when the user is gone', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.saveFirstPhone('user-id-1', '0901234567'),
      ).resolves.toBeUndefined();

      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('saveFirstPhone leaves an existing phone unchanged', async () => {
      const user = buildUser({ phoneNumber: '0912345678' });
      userRepository.findById.mockResolvedValue(user);

      await service.saveFirstPhone('user-id-1', '0901234567');

      expect(user.phoneNumber).toBe('0912345678');
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('sets status to INACTIVE and soft-deletes the user', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.remove('user-id-1', ACTOR);

      expect(user.status).toBe(UserStatus.INACTIVE);
      expect(userRepository.softDelete).toHaveBeenCalledWith(user, ACTOR);
    });

    it('bans the user in Clerk before soft-deleting locally', async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);

      await service.remove('user-id-1', ACTOR);

      expect(authProvider.syncUserStatus).toHaveBeenCalledWith(
        user.clerkId,
        UserStatus.INACTIVE,
      );
      const syncOrder = authProvider.syncUserStatus.mock.invocationCallOrder[0];
      const softDeleteOrder =
        userRepository.softDelete.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(softDeleteOrder);
    });

    it('throws ItemNotFoundException for a missing or already-deleted id', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.remove('missing-id', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });

    it("remove soft-deletes the user's addresses in the same transaction", async () => {
      const user = buildUser();
      userRepository.findById.mockResolvedValue(user);
      const calledInside: Record<string, boolean> = {};
      userAddressService.softDeleteAllOf.mockImplementation(() => {
        calledInside.addresses = insideTransaction;
      });
      userRepository.softDelete.mockImplementation(() => {
        calledInside.user = insideTransaction;
      });

      await service.remove('user-id-1', ACTOR);

      expect(userRepository.transactional).toHaveBeenCalledTimes(1);
      expect(userAddressService.softDeleteAllOf).toHaveBeenCalledWith(
        'user-id-1',
        ACTOR,
      );
      expect(userRepository.softDelete).toHaveBeenCalledWith(user, ACTOR);
      expect(calledInside).toEqual({ addresses: true, user: true });
    });

    it('remove from the webhook passes a null actor', async () => {
      userRepository.findById.mockResolvedValue(buildUser());

      await service.remove('user-id-1', null);

      expect(userAddressService.softDeleteAllOf).toHaveBeenCalledWith(
        'user-id-1',
        null,
      );
    });
  });
});
