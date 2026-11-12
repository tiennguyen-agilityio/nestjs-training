import { UserRoleSyncHandler } from './user-role-sync.handler.js';
import type { UserService } from '../services/user.service.js';

describe('UserRoleSyncHandler', () => {
  const userService = { syncRoleToAuthProvider: vi.fn() };
  const handler = new UserRoleSyncHandler(
    userService as unknown as UserService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes the payload's clerk id to UserService.syncRoleToAuthProvider", async () => {
    userService.syncRoleToAuthProvider.mockResolvedValue(undefined);

    await handler.handle({ clerkId: 'clerk-1' });

    expect(userService.syncRoleToAuthProvider).toHaveBeenCalledWith('clerk-1');
  });

  it('rejects when the sync fails, so the attempt counts as failed', async () => {
    const error = new Error('clerk down');
    userService.syncRoleToAuthProvider.mockRejectedValue(error);

    await expect(handler.handle({ clerkId: 'clerk-1' })).rejects.toBe(error);
  });
});
