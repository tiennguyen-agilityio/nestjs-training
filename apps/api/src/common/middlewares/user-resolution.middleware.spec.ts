import type { Request, Response } from 'express';
import { UserResolutionMiddleware } from './user-resolution.middleware.js';
import { UserRole, UserStatus } from '@repo/constants';
import type { User } from '../../modules/user/entities/user.entity.js';
import { ItemNotFoundException } from '../exceptions/base.exception.js';

import type { Mock } from 'vitest';
describe('UserResolutionMiddleware', () => {
  let middleware: UserResolutionMiddleware;
  let authProvider: { getSessionUserId: Mock };
  let userService: { findByClerkId: Mock };
  let req: { user?: User };
  let next: Mock;

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

  beforeEach(() => {
    req = {};
    authProvider = { getSessionUserId: vi.fn() };
    userService = { findByClerkId: vi.fn() };
    middleware = new UserResolutionMiddleware(
      authProvider as never,
      userService as never,
    );
    next = vi.fn();
  });

  describe('use', () => {
    it('calls next() without looking up a user when the provider resolves no session', async () => {
      authProvider.getSessionUserId.mockReturnValue(null);

      await middleware.use(req as Request, {} as Response, next);

      expect(userService.findByClerkId).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('attaches the matching user (any status) and calls next()', async () => {
      const user = buildUser({ status: UserStatus.INACTIVE });
      authProvider.getSessionUserId.mockReturnValue('clerk-1');
      userService.findByClerkId.mockResolvedValue(user);

      await middleware.use(req as Request, {} as Response, next);

      expect(req.user).toBe(user);
      expect(next).toHaveBeenCalledWith();
    });

    it('leaves req.user undefined and calls next() when the session matches no local user', async () => {
      authProvider.getSessionUserId.mockReturnValue('clerk-1');
      userService.findByClerkId.mockRejectedValue(
        new ItemNotFoundException({
          errCode: 'userNotFound',
          field: 'clerkId',
          message: 'User not found',
          description:
            'The user might have been deleted, or the clerk id is incorrect.',
        }),
      );

      await middleware.use(req as Request, {} as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('forwards a genuinely unexpected lookup error to next(), unlike ItemNotFoundException', async () => {
      const error = new Error('boom');
      authProvider.getSessionUserId.mockReturnValue('clerk-1');
      userService.findByClerkId.mockRejectedValue(error);

      await middleware.use(req as Request, {} as Response, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
