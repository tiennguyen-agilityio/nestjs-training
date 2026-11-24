import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { UserRole, UserStatus } from '@repo/constants';
import type { User } from '../../modules/user/entities/user.entity.js';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let req: { user?: User };

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

  const buildContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    req = {};
    guard = new AuthGuard();
  });

  describe('canActivate', () => {
    it('throws UnauthorizedException when req.user was not resolved (no session, or no matching local user)', () => {
      expect(() => guard.canActivate(buildContext())).toThrow(
        UnauthorizedException,
      );
    });

    it('throws ForbiddenException when req.user is INACTIVE', () => {
      req.user = buildUser({ status: UserStatus.INACTIVE });

      expect(() => guard.canActivate(buildContext())).toThrow(
        ForbiddenException,
      );
    });

    it('allows the request through when req.user is ACTIVE', () => {
      req.user = buildUser();

      expect(guard.canActivate(buildContext())).toBe(true);
    });
  });
});
