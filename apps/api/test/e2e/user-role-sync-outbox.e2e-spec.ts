import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import {
  Outbox,
  OutboxDeadLetters,
  OutboxRelay,
  type NewOutboxMessage,
} from '@nestjs/outbox';
import { UserRole } from '@repo/constants';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import type { Mock } from 'vitest';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';
import { OUTBOX_RETRY } from './../../src/configs/outbox.config.js';
import { OutboxStoreModule } from './../../src/modules/outbox/outbox.module.js';
import { UserModule } from './../../src/modules/user/user.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { AuthProvider } from './../../src/common/providers/auth.provider.js';
import { AuthProviderModule } from './../../src/common/providers/auth-provider.module.js';
import {
  DependencyUnavailableException,
  DuplicateResourceException,
  ItemNotFoundException,
} from './../../src/common/exceptions/base.exception.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from './../../src/common/constants/message.constant.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';

/**
 * The outbox against the real PostgreSQL store. The relay's poll is off and
 * the tests drive it with `runOnce()`; retries wait 0 ms so the retry budget
 * can be walked through in one test. Clerk is a mock.
 */
function createOutboxTestModule(authProvider: object): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      MikroOrmModule.forRoot(mikroOrmConfig),
      OutboxStoreModule.forRoot({
        relay: { enabled: false },
        retry: { ...OUTBOX_RETRY, backoff: () => 0 },
      }),
      AuthProviderModule,
      UserModule,
    ],
  })
    .overrideProvider(AuthProvider)
    .useValue(authProvider)
    .compile();
}

describe('User role sync outbox (e2e)', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  let userService: UserService;
  let outbox: Outbox;
  let relay: OutboxRelay;
  let deadLetters: OutboxDeadLetters;
  const authProvider: { syncUserRole: Mock; syncUserStatus: Mock } = {
    syncUserRole: vi.fn(),
    syncUserStatus: vi.fn(),
  };

  const sql = (query: string): Promise<Record<string, unknown>[]> =>
    orm.em.getConnection().execute(query);
  // Outside an HTTP request MikroORM needs a context of its own, as the relay's handler does.
  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    RequestContext.create(orm.em, work);

  const buildDto = () => {
    const id = randomUUID();
    return {
      clerkId: `clerk-${id}`,
      email: `outbox-${id}@example.com`,
      firstName: 'Jane',
      lastName: 'Doe',
    };
  };

  beforeAll(async () => {
    moduleRef = await createOutboxTestModule(authProvider);
    await moduleRef.init();
    orm = moduleRef.get(MikroORM);
    userService = moduleRef.get(UserService);
    outbox = moduleRef.get(Outbox);
    relay = moduleRef.get(OutboxRelay);
    deadLetters = moduleRef.get(OutboxDeadLetters);
  });

  beforeEach(async () => {
    await sql('delete from nest_outbox.messages');
    await sql('delete from nest_outbox.dead_letters');
    await sql('delete from nest_outbox.inbox');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    authProvider.syncUserRole.mockReset();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('starts against the migrated store schema', async () => {
    expect(moduleRef.get(PostgresOutboxStore)).toBeInstanceOf(
      PostgresOutboxStore,
    );
    const [row] = await sql(
      'select max(version)::int as version from nest_outbox.migrations',
    );
    expect(row.version).toBe(PostgresOutboxStore.schemaVersion);
  });

  describe('producer', () => {
    it('commits the outbox message next to the user row', async () => {
      const dto = buildDto();

      const user = await inContext(() =>
        userService.createFromAuthProvider(dto),
      );

      await expect(
        inContext(() => userService.findByClerkId(dto.clerkId)),
      ).resolves.toMatchObject({ id: user.id });
      expect(
        await sql('select topic, key, payload from nest_outbox.messages'),
      ).toEqual([
        {
          topic: 'user.role-sync',
          key: dto.clerkId,
          payload: { clerkId: dto.clerkId },
        },
      ]);
    });

    it('rolls the outbox message back with the user row', async () => {
      const dto = buildDto();
      // `add` is overloaded; the single-message form is the one the repository uses.
      const add = outbox.add.bind(outbox) as (
        tx: unknown,
        message: NewOutboxMessage,
      ) => Promise<unknown>;
      vi.spyOn(outbox, 'add').mockImplementationOnce(async (tx, message) => {
        await add(tx, message);
        throw new Error('fail after add');
      });

      await expect(
        inContext(() => userService.createFromAuthProvider(dto)),
      ).rejects.toThrow('fail after add');

      await expect(
        inContext(() => userService.findByClerkId(dto.clerkId)),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(await sql('select 1 from nest_outbox.messages')).toEqual([]);
      expect((await relay.runOnce()).claimed).toBe(0);
    });

    it('a redelivered user.created writes no second message', async () => {
      const dto = buildDto();
      await inContext(() => userService.createFromAuthProvider(dto));

      await expect(
        inContext(() => userService.createFromAuthProvider(dto)),
      ).rejects.toBeInstanceOf(DuplicateResourceException);

      expect(await sql('select 1 from nest_outbox.messages')).toHaveLength(1);
    });
  });

  // The relay runs the handler from the test, outside any HTTP request, as it
  // does in production.
  describe('consumer', () => {
    const unavailable = () =>
      new DependencyUnavailableException({
        errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
        message: ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
        description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
      });

    it('delivers the role the user has at delivery time', async () => {
      const dto = buildDto();
      const user = await inContext(() =>
        userService.createFromAuthProvider(dto),
      );
      // What the user.updated webhook writes back after an admin's change.
      await inContext(() =>
        userService.update(user.id, { role: UserRole.ADMIN }),
      );

      expect(await relay.runOnce()).toMatchObject({ published: 1 });

      expect(authProvider.syncUserRole).toHaveBeenCalledExactlyOnceWith(
        dto.clerkId,
        UserRole.ADMIN,
      );
      expect(await sql('select 1 from nest_outbox.messages')).toEqual([]);
    });

    it('retries a failed delivery and keeps the message until it succeeds', async () => {
      authProvider.syncUserRole.mockRejectedValueOnce(unavailable());
      const dto = buildDto();
      await inContext(() => userService.createFromAuthProvider(dto));

      expect(await relay.runOnce()).toMatchObject({
        retried: 1,
        deadLettered: 0,
      });
      expect(await sql('select attempts from nest_outbox.messages')).toEqual([
        { attempts: 1 },
      ]);

      expect(await relay.runOnce()).toMatchObject({ published: 1 });
      expect(authProvider.syncUserRole).toHaveBeenCalledTimes(2);
    });

    it('dead-letters the message after 10 failed attempts', async () => {
      authProvider.syncUserRole.mockRejectedValue(new Error('clerk down'));
      const dto = buildDto();
      await inContext(() => userService.createFromAuthProvider(dto));

      for (let attempt = 1; attempt < 10; attempt++) {
        expect(await relay.runOnce()).toMatchObject({ retried: 1 });
      }
      expect(await relay.runOnce()).toMatchObject({ deadLettered: 1 });

      expect(authProvider.syncUserRole).toHaveBeenCalledTimes(10);

      expect(await deadLetters.list({ topic: 'user.role-sync' })).toEqual([
        expect.objectContaining({
          key: dto.clerkId,
          attempts: 10,
          reason: 'exhausted',
        }),
      ]);
      expect(await sql('select 1 from nest_outbox.messages')).toEqual([]);
    });
  });
});
