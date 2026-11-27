import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock, MockInstance } from 'vitest';
import { AppModule } from './../../src/app.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { AuthProvider } from './../../src/common/providers/auth.provider.js';
import { UserRole, UserStatus, VALIDATION_RULES } from '@repo/constants';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import type { User } from './../../src/modules/user/entities/user.entity.js';
import { UserAddressRepository } from './../../src/modules/user/repositories/user-address.repository.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

describe('UserController auth (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let syncUserName: MockInstance<AuthProvider['syncUserName']>;
  let userService: UserService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await initTestApp(moduleFixture);

    orm = app.get(MikroORM);
    userService = app.get(UserService);

    // Name/role/status syncing is covered in src/common/providers/clerk-auth.provider.spec.ts;
    // here it would hit the real Clerk API with .env.test's placeholder credentials and fail.
    const authProvider = app.get(AuthProvider);
    syncUserName = vi
      .spyOn(authProvider, 'syncUserName')
      .mockResolvedValue(undefined);
    vi.spyOn(authProvider, 'syncUserRole').mockResolvedValue(undefined);
    vi.spyOn(authProvider, 'syncUserStatus').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await RequestContext.create(orm.em, async () => {
      for (const id of createdUserIds) {
        await userService.remove(id, null).catch(() => undefined);
      }
    });
    await app.close();
  });

  beforeEach(() => {
    (getAuth as Mock).mockReturnValue({ userId: null });
  });

  // Matches Clerk's own id shape for a User resource (createUserSchema's clerkId regex).
  const generateClerkId = (): string =>
    `user_e2e${Date.now()}${Math.random().toString(36).slice(2)}`;

  const createTestUser = async (
    overrides: { role?: UserRole; status?: UserStatus } = {},
  ): Promise<User> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = generateClerkId();
      let user = await userService.create(
        {
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          role: overrides.role,
        },
        null,
      );
      createdUserIds.push(user.id);

      if (
        overrides.status &&
        overrides.status !== (user.status as UserStatus)
      ) {
        user = await userService.update(user.id, { status: overrides.status });
      }

      return user;
    });

  const mockSessionFor = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  describe('no Clerk session', () => {
    it.each([
      ['get', `${API_BASE_PATH}/users`],
      ['get', `${API_BASE_PATH}/users/some-id`],
      ['post', `${API_BASE_PATH}/users`],
      ['patch', `${API_BASE_PATH}/users/some-id`],
      ['delete', `${API_BASE_PATH}/users/some-id`],
      ['get', `${API_BASE_PATH}/users/me`],
    ])('%s %s responds 401', async (method, path) => {
      await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (path: string) => request.Test
        >
      )
        [method](path)
        .expect(401);
    });
  });

  describe('Clerk session with no matching local user', () => {
    it('GET /users responds 401', async () => {
      mockSessionFor('clerk-id-that-does-not-exist');

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users`)
        .expect(401);
    });
  });

  describe('authenticated but INACTIVE local user', () => {
    it('GET /users responds 403', async () => {
      const user = await createTestUser({
        role: UserRole.ADMIN,
        status: UserStatus.INACTIVE,
      });
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users`)
        .expect(403);
    });

    it('GET /me responds 403', async () => {
      const user = await createTestUser({ status: UserStatus.INACTIVE });
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(403);
    });
  });

  describe('authenticated ACTIVE non-ADMIN local user', () => {
    it('GET /users responds 403', async () => {
      const user = await createTestUser({ role: UserRole.USER });
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users`)
        .expect(403);
    });

    it('GET /me responds 200 with the caller own profile', async () => {
      const user = await createTestUser({ role: UserRole.USER });
      mockSessionFor(user.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          id: user.id,
          clerkId: user.clerkId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          avatarUrl: user.avatarUrl,
          phoneNumber: null,
          addresses: [],
          deletedAt: user.deletedAt,
        },
      });
    });

    it('GET /users/me returns phoneNumber', async () => {
      const clerkId = generateClerkId();
      const user = await RequestContext.create(orm.em, () =>
        userService.create(
          {
            clerkId,
            email: `${clerkId}@example.com`,
            firstName: 'E2E',
            lastName: 'Phone',
            phoneNumber: '0912345678',
          },
          null,
        ),
      );
      createdUserIds.push(user.id);
      mockSessionFor(user.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(200);

      expect(
        (response.body as { data: { phoneNumber: string | null } }).data
          .phoneNumber,
      ).toBe('0912345678');
    });

    it("GET /users/me returns the caller's addresses, default first", async () => {
      const user = await createTestUser({ role: UserRole.USER });
      const other = await createTestUser({ role: UserRole.USER });
      const addresses = app.get(UserAddressRepository);
      const fields = {
        ward: 'Ben Nghe',
        district: 'District 1',
        city: 'Ho Chi Minh',
        postalCode: '700000',
      };
      await RequestContext.create(orm.em, async () => {
        await addresses.create({
          userId: user.id,
          addressLine: '5 Side Lane',
          ...fields,
          isDefault: false,
        });
        await addresses.create({
          userId: user.id,
          addressLine: '12 Roast Street',
          ...fields,
          isDefault: true,
        });
        await addresses.create({
          userId: other.id,
          addressLine: '1 Not Mine Road',
          ...fields,
          isDefault: true,
        });
      });
      mockSessionFor(user.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(200);

      const data = (
        response.body as { data: { addresses: Record<string, unknown>[] } }
      ).data.addresses;
      expect(data.map((row) => row.addressLine)).toEqual([
        '12 Roast Street',
        '5 Side Lane',
      ]);
      expect(data.map((row) => row.isDefault)).toEqual([true, false]);
      expect(Object.keys(data[0]).sort()).toEqual(
        [
          'id',
          'userId',
          'addressLine',
          'ward',
          'district',
          'city',
          'postalCode',
          'isDefault',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
      expect(data[0]).toMatchObject({ userId: user.id, ...fields });
    });

    it('GET /users/me/addresses no longer exists', async () => {
      const user = await createTestUser({ role: UserRole.USER });
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me/addresses`)
        .expect(404);
    });
  });

  describe('authenticated ACTIVE ADMIN local user', () => {
    // An admin session plus one active, one inactive and one soft-deleted user.
    const seedStatusUsers = async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const activeUser = await createTestUser({ role: UserRole.USER });
      const inactiveUser = await createTestUser({
        role: UserRole.USER,
        status: UserStatus.INACTIVE,
      });
      const deletedUser = await createTestUser({ role: UserRole.USER });
      await RequestContext.create(orm.em, () =>
        userService.remove(deletedUser.id, null),
      );
      mockSessionFor(admin.clerkId);
      return { activeUser, inactiveUser, deletedUser };
    };

    it('GET /users responds 200 with the paginated envelope', async () => {
      const user = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(user.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('GET /users excludes the calling admin from the results', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?limit=100`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((u) => u.id);
      expect(ids).not.toContain(admin.id);
    });

    it('GET /users?role= filters the results by role', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const otherAdmin = await createTestUser({ role: UserRole.ADMIN });
      const regularUser = await createTestUser({ role: UserRole.USER });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?role=ADMIN&limit=100`)
        .expect(200);

      const body = response.body as {
        data: Array<{ id: string; role: string }>;
      };
      const ids = body.data.map((u) => u.id);
      expect(ids).toContain(otherAdmin.id);
      expect(ids).not.toContain(regularUser.id);
      expect(body.data.every((u) => u.role === 'ADMIN')).toBe(true);
    });

    it('GET /users?status=INACTIVE returns only inactive users, including soft-deleted ones', async () => {
      const { activeUser, inactiveUser, deletedUser } = await seedStatusUsers();

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?status=INACTIVE&limit=100`)
        .expect(200);

      const body = response.body as {
        data: Array<{ id: string; status: string }>;
      };
      const ids = body.data.map((u) => u.id);
      expect(ids).toContain(inactiveUser.id);
      expect(ids).toContain(deletedUser.id);
      expect(ids).not.toContain(activeUser.id);
      expect(body.data.every((u) => u.status === 'INACTIVE')).toBe(true);
    });

    it('GET /users?status=ACTIVE excludes inactive and soft-deleted users', async () => {
      const { activeUser, inactiveUser, deletedUser } = await seedStatusUsers();

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?status=ACTIVE&limit=100`)
        .expect(200);

      const body = response.body as {
        data: Array<{ id: string; status: string }>;
      };
      const ids = body.data.map((u) => u.id);
      expect(ids).toContain(activeUser.id);
      expect(ids).not.toContain(inactiveUser.id);
      expect(ids).not.toContain(deletedUser.id);
      expect(body.data.every((u) => u.status === 'ACTIVE')).toBe(true);
    });

    it('GET /users?role=&status= applies both filters', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const inactiveAdmin = await createTestUser({
        role: UserRole.ADMIN,
        status: UserStatus.INACTIVE,
      });
      const activeAdmin = await createTestUser({ role: UserRole.ADMIN });
      const inactiveUser = await createTestUser({
        role: UserRole.USER,
        status: UserStatus.INACTIVE,
      });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?role=ADMIN&status=INACTIVE&limit=100`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((u) => u.id);
      expect(ids).toContain(inactiveAdmin.id);
      expect(ids).not.toContain(activeAdmin.id);
      expect(ids).not.toContain(inactiveUser.id);
    });

    it('GET /users?status= responds 400 for an unknown status', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?status=DISABLED`)
        .expect(400);
    });

    it('GET /users?role= responds 400 for an unknown role', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?role=SUPERUSER`)
        .expect(400);
    });

    it('GET /users includes a soft-deleted user', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const deletedUser = await createTestUser({ role: UserRole.USER });
      await RequestContext.create(orm.em, () =>
        userService.remove(deletedUser.id, null),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users?limit=100`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((u) => u.id);
      expect(ids).toContain(deletedUser.id);
    });

    it('GET /users/:id returns a soft-deleted user', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const deletedUser = await createTestUser({ role: UserRole.USER });
      await RequestContext.create(orm.em, () =>
        userService.remove(deletedUser.id, null),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/${deletedUser.id}`)
        .expect(200);

      expect(response.body).toEqual({
        data: expect.objectContaining({ id: deletedUser.id }) as unknown,
      });
    });

    it('POST /users responds 400 for a firstName over the max length', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'a'.repeat(VALIDATION_RULES.NAME.MAX_LENGTH + 1),
          lastName: 'Test',
        })
        .expect(400);

      const body = response.body as {
        statusCode: number;
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.statusCode).toBe(400);
      expect(body.errors.some((error) => error.field === 'firstName')).toBe(
        true,
      );
    });

    it('POST /users responds 400 for an invalid avatarUrl', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          avatarUrl: 'not-a-url',
        })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.some((error) => error.field === 'avatarUrl')).toBe(
        true,
      );
    });

    it('POST /users accepts an explicit null avatarUrl', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          avatarUrl: null,
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdUserIds.push(body.data.id);
    });

    it('POST /users responds 400 for an empty clerkId', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId: '',
          email: `clerk-e2e-${Date.now()}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
        })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.some((error) => error.field === 'clerkId')).toBe(true);
    });

    it('POST /users responds 400 for a malformed phoneNumber', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          phoneNumber: 'abc',
        })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.some((error) => error.field === 'phoneNumber')).toBe(
        true,
      );
    });

    it('POST /users accepts an explicit null phoneNumber', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          phoneNumber: null,
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdUserIds.push(body.data.id);
    });

    it('POST /users accepts a valid 10-digit phoneNumber', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          phoneNumber: '0987654321',
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdUserIds.push(body.data.id);
    });

    it('POST /users responds 400 for a phoneNumber over 10 digits', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);
      const clerkId = generateClerkId();

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          phoneNumber: '098765432100',
        })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.some((error) => error.field === 'phoneNumber')).toBe(
        true,
      );
    });

    it('POST /users responds 400 for a clerkId missing the Clerk "user_" prefix', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .send({
          clerkId: 'not-a-clerk-id',
          email: `clerk-e2e-${Date.now()}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
        })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.some((error) => error.field === 'clerkId')).toBe(true);
    });

    it('PATCH /users/:id ignores phoneNumber (admin-facing update excludes it)', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const target = await createTestUser({ role: UserRole.USER });
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/users/${target.id}`)
        .send({ firstName: 'Updated', phoneNumber: '0987654321' })
        .expect(200);

      const body = response.body as { data: { firstName: string } };
      expect(body.data.firstName).toBe('Updated');

      const persisted = await RequestContext.create(orm.em, () =>
        userService.findOne(target.id),
      );
      expect(persisted.phoneNumber).toBeNull();
    });

    it('PATCH /users/:id pushes a new name to the auth provider and saves it', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const target = await createTestUser({ role: UserRole.USER });
      mockSessionFor(admin.clerkId);
      syncUserName.mockClear();

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/users/${target.id}`)
        .send({ lastName: 'Renamed' })
        .expect(200);

      expect(syncUserName).toHaveBeenCalledExactlyOnceWith(target.clerkId, {
        firstName: target.firstName,
        lastName: 'Renamed',
      });
      const body = response.body as { data: { lastName: string } };
      expect(body.data.lastName).toBe('Renamed');
    });
  });

  describe('audit', () => {
    type AuditIds = {
      id: string;
      createdBy?: string | null;
      updatedBy?: string | null;
      deletedBy?: string | null;
    };

    const auditRow = async (
      table: string,
      id: string,
    ): Promise<{ updated_by: string | null; deleted_by: string | null }> => {
      const [row] = (await orm.em
        .getConnection()
        .execute(`select updated_by, deleted_by from ${table} where id = ?`, [
          id,
        ])) as { updated_by: string | null; deleted_by: string | null }[];
      return row;
    };

    it('POST /users records the admin as creator', async () => {
      const a1 = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(a1.clerkId);
      const suffix = `${Date.now()}${Math.random().toString(36).slice(2)}`;

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/users`)
        .set('Idempotency-Key', randomUUID())
        .send({
          clerkId: `user_audit${suffix}`,
          email: `audit-${suffix}@example.com`,
          firstName: 'Audit',
          lastName: 'Created',
        })
        .expect(201);

      const { data } = response.body as { data: AuditIds };
      createdUserIds.push(data.id);
      expect(data).toMatchObject({
        createdBy: a1.id,
        updatedBy: a1.id,
        deletedBy: null,
      });
    });

    it('PATCH /users/:id with only a role records the admin before any webhook', async () => {
      const a2 = await createTestUser({ role: UserRole.ADMIN });
      const target = await createTestUser({ role: UserRole.USER });
      mockSessionFor(a2.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/users/${target.id}`)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      expect((await auditRow('users', target.id)).updated_by).toBe(a2.id);
    });

    it('DELETE /users/:id records the admin', async () => {
      const a2 = await createTestUser({ role: UserRole.ADMIN });
      const target = await createTestUser({ role: UserRole.USER });
      mockSessionFor(a2.clerkId);

      await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/users/${target.id}`)
        .expect(204);

      expect(await auditRow('users', target.id)).toEqual({
        updated_by: a2.id,
        deleted_by: a2.id,
      });
    });

    it('GET /users/me has audit ids for an active admin only', async () => {
      const admin = await createTestUser({ role: UserRole.ADMIN });
      const customer = await createTestUser({ role: UserRole.USER });

      mockSessionFor(customer.clerkId);
      const asCustomer = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(200);
      expect((asCustomer.body as { data: AuditIds }).data).not.toHaveProperty(
        'createdBy',
      );

      mockSessionFor(admin.clerkId);
      const asAdmin = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/users/me`)
        .expect(200);
      expect((asAdmin.body as { data: AuditIds }).data).toHaveProperty(
        'createdBy',
        null,
      );
    });

    it('keeps the ids of a deleted admin', async () => {
      const a1 = await createTestUser({ role: UserRole.ADMIN });
      const a2 = await createTestUser({ role: UserRole.ADMIN });
      mockSessionFor(a1.clerkId);
      const created = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Audit Deleted Admin ${Date.now()}` })
        .expect(201);
      const categoryId = (created.body as { data: AuditIds }).data.id;

      await RequestContext.create(orm.em, () =>
        userService.remove(a1.id, null),
      );

      mockSessionFor(a2.clerkId);
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/${categoryId}`)
        .expect(200);
      expect((response.body as { data: AuditIds }).data.createdBy).toBe(a1.id);

      await orm.em
        .getConnection()
        .execute('delete from categories where id = ?', [categoryId]);
    });
  });
});
