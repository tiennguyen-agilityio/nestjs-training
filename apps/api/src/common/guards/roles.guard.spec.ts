import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole, UserStatus } from '@repo/constants';
import type { User } from '../../modules/user/entities/user.entity.js';

import type { Mock } from 'vitest';
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: Mock };

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-id-1',
    clerkId: 'clerk-1',
    email: 'jane@example.com',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    firstName: 'Jane',
    lastName: 'Doe',
    phoneNumber: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    ...overrides,
  });

  const buildContext = (user: User): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as never);
  });

  describe('canActivate', () => {
    it('allows the request through when no @Roles() metadata is present', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const result = guard.canActivate(buildContext(buildUser()));

      expect(result).toBe(true);
    });

    it('allows the request through when the user role matches the required roles', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(
        buildContext(buildUser({ role: UserRole.ADMIN })),
      );

      expect(result).toBe(true);
    });

    it('throws ForbiddenException when the user role does not match', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      expect(() =>
        guard.canActivate(buildContext(buildUser({ role: UserRole.USER }))),
      ).toThrow(ForbiddenException);
    });

    it('reads metadata using the exported ROLES_KEY', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      guard.canActivate(buildContext(buildUser()));

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        ROLES_KEY,
        expect.any(Array),
      );
    });
  });
});
