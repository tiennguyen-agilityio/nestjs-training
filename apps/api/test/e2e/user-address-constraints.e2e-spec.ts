import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { App } from 'supertest/types';
import { UserRole } from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';

describe('user_addresses (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;

  const execute = (sql: string, params: unknown[] = []): Promise<unknown[]> =>
    orm.em.getConnection().execute(sql, params);

  const createUser = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-address-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create(
        {
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'Address',
          lastName: 'Test',
          role: UserRole.USER,
        },
        null,
      );
      return user.id;
    });

  const insertAddress = (
    userId: string,
    isDefault: boolean,
  ): Promise<unknown[]> =>
    execute(
      `insert into user_addresses (id, user_id, address_line, ward, district, city, postal_code, is_default, created_at, updated_at)
       values (?, ?, '12 Roast Street', 'Ben Nghe', 'District 1', 'Ho Chi Minh', '700000', ?, now(), now())`,
      [randomUUID(), userId, isDefault],
    );

  const countOf = async (userId: string): Promise<number> => {
    const rows = (await execute(
      `select count(*)::int as count from user_addresses where user_id = ?`,
      [userId],
    )) as { count: number }[];
    return rows[0].count;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture);
    orm = app.get(MikroORM);
    userService = app.get(UserService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a second live default address for one user is rejected', async () => {
    const userId = await createUser();
    await insertAddress(userId, true);

    await expect(insertAddress(userId, true)).rejects.toThrow(/unique/i);
  });

  it('a soft-deleted default does not block a new default', async () => {
    const userId = await createUser();
    await insertAddress(userId, true);
    await execute(
      `update user_addresses set deleted_at = now() where user_id = ?`,
      [userId],
    );

    await expect(insertAddress(userId, true)).resolves.toBeDefined();
    expect(await countOf(userId)).toBe(2);
  });

  it('a user may have several non-default addresses', async () => {
    const userId = await createUser();
    await insertAddress(userId, false);
    await insertAddress(userId, false);

    expect(await countOf(userId)).toBe(2);
  });

  it('deleting the user row deletes its addresses', async () => {
    const userId = await createUser();
    await insertAddress(userId, true);
    await insertAddress(userId, false);

    await execute(`delete from users where id = ?`, [userId]);

    expect(await countOf(userId)).toBe(0);
  });
});
