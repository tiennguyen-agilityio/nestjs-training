import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import { ShippingMethodStatus, UserRole } from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { ShippingMethodService } from './../../src/modules/shipping-method/services/shipping-method.service.js';
import type { ShippingMethod } from './../../src/modules/shipping-method/entities/shipping-method.entity.js';
import type { User } from './../../src/modules/user/entities/user.entity.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface MethodBody {
  id: string;
  name: string;
  price: number;
  status: string;
  deletedAt: string | null;
}

interface ErrorBody {
  errors: Array<{ errCode: string; field: string; message: string }>;
}

describe('ShippingMethodController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let shippingMethodService: ShippingMethodService;
  const createdUserIds: string[] = [];
  const path = `${API_BASE_PATH}/shipping-methods`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await initTestApp(moduleFixture);
    orm = app.get(MikroORM);
    userService = app.get(UserService);
    shippingMethodService = app.get(ShippingMethodService);
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

  const createTestUser = async (role: UserRole): Promise<User> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create(
        {
          clerkId,
          email: `${clerkId}@example.com`,
          firstName: 'E2E',
          lastName: 'Test',
          role,
        },
        null,
      );
      createdUserIds.push(user.id);
      return user;
    });

  const mockSessionFor = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const uniqueTag = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const createMethod = (
    name: string,
    price: number,
    status: ShippingMethodStatus = ShippingMethodStatus.ACTIVE,
  ): Promise<ShippingMethod> =>
    RequestContext.create(orm.em, () =>
      shippingMethodService.create(
        { name, description: 'E2E method', price, status },
        null,
      ),
    );

  const deleteMethod = (id: string): Promise<void> =>
    RequestContext.create(orm.em, () => shippingMethodService.remove(id, null));

  /** S1 ACTIVE, S2 INACTIVE, S3 ACTIVE then deleted, all named with `tag`. */
  const createS1S2S3 = async (tag: string) => {
    const s1 = await createMethod(`S1 ${tag}`, 5);
    const s2 = await createMethod(
      `S2 ${tag}`,
      1,
      ShippingMethodStatus.INACTIVE,
    );
    const s3 = await createMethod(`S3 ${tag}`, 3);
    await deleteMethod(s3.id);
    return { s1, s2, s3 };
  };

  const list = async (query: string) => {
    const response = await request(app.getHttpServer())
      .get(`${path}?${query}`)
      .expect(200);
    return (response.body as { data: MethodBody[] }).data;
  };

  const idsOf = (methods: MethodBody[]) => methods.map(({ id }) => id);

  describe('GET /shipping-methods', () => {
    it('GET /shipping-methods as a guest returns only the ACTIVE, non-deleted method', async () => {
      const tag = uniqueTag();
      const { s1 } = await createS1S2S3(tag);

      expect(idsOf(await list(`search=${tag}`))).toEqual([s1.id]);
    });

    it('a signed-in USER also gets only S1, also with status=INACTIVE', async () => {
      const tag = uniqueTag();
      const { s1 } = await createS1S2S3(tag);
      const user = await createTestUser(UserRole.USER);
      mockSessionFor(user.clerkId);

      expect(idsOf(await list(`search=${tag}`))).toEqual([s1.id]);
      expect(idsOf(await list(`search=${tag}&status=INACTIVE`))).toEqual([
        s1.id,
      ]);
    });

    it("GET /shipping-methods as an admin returns S1, S2 and S3, with S3's deletedAt set", async () => {
      const tag = uniqueTag();
      const { s1, s2, s3 } = await createS1S2S3(tag);
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const all = await list(`search=${tag}`);
      expect(idsOf(all).sort()).toEqual([s1.id, s2.id, s3.id].sort());
      expect(all.find(({ id }) => id === s3.id)?.deletedAt).not.toBeNull();
      expect(all.find(({ id }) => id === s1.id)?.deletedAt).toBeNull();

      await request(app.getHttpServer())
        .get(`${path}?search=${tag}&status=DELETED`)
        .expect(400);
      expect(idsOf(await list(`search=${tag}&status=ACTIVE`))).toEqual([s1.id]);
      expect(idsOf(await list(`search=${tag}&status=INACTIVE`))).toEqual([
        s2.id,
      ]);
    });

    it("sortBy=PRICE_ASC orders the admin's methods by price", async () => {
      const tag = uniqueTag();
      const { s1, s2, s3 } = await createS1S2S3(tag);
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      expect(idsOf(await list(`search=${tag}&sortBy=PRICE_ASC`))).toEqual([
        s2.id,
        s3.id,
        s1.id,
      ]);
      expect(idsOf(await list(`search=${tag}&sortBy=NAME_DESC`))).toEqual([
        s3.id,
        s2.id,
        s1.id,
      ]);
    });

    it('methods created at the same time keep one order, by id, after an update', async () => {
      const tag = uniqueTag();
      const methods: ShippingMethod[] = [];
      for (const name of ['A', 'B', 'C', 'D']) {
        methods.push(await createMethod(`${name} ${tag}`, 10));
      }
      const ids = methods.map(({ id }) => id);
      await orm.em
        .fork()
        .getConnection()
        .execute(
          'update shipping_methods set created_at = ? where id in (?, ?, ?, ?)',
          [new Date('2026-01-01T00:00:00.000Z'), ...ids],
        );
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const byId = [...ids].sort();

      expect(idsOf(await list(`search=${tag}`))).toEqual(byId);

      for (const id of [byId[0], byId[2]]) {
        await request(app.getHttpServer())
          .patch(`${path}/${id}`)
          .send({ status: 'INACTIVE', price: 11 })
          .expect(200);
      }

      expect(idsOf(await list(`search=${tag}`))).toEqual(byId);
    });

    it('sortBy=PRICE_ASC breaks a price tie by id', async () => {
      const tag = uniqueTag();
      const methods: ShippingMethod[] = [];
      for (const name of ['A', 'B', 'C']) {
        methods.push(await createMethod(`${name} ${tag}`, 7));
      }
      const byId = methods.map(({ id }) => id).sort();
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      await request(app.getHttpServer())
        .patch(`${path}/${byId[0]}`)
        .send({ description: 'Changed' })
        .expect(200);

      expect(idsOf(await list(`search=${tag}&sortBy=PRICE_ASC`))).toEqual(byId);
    });

    it('GET ?search=_ matches "_" literally', async () => {
      const tag = uniqueTag();
      const withUnderscore = await createMethod(`Same_day ${tag}`, 9);
      const withoutUnderscore = await createMethod(`Sameday ${tag}`, 9);

      // Unescaped, "_" would match the "e" of "Sameday" too.
      const ids = idsOf(
        await list(`search=${encodeURIComponent(`_day ${tag}`)}`),
      );
      expect(ids).toEqual([withUnderscore.id]);
      expect(ids).not.toContain(withoutUnderscore.id);
    });

    it('GET ?status=deleted returns 400', async () => {
      await request(app.getHttpServer())
        .get(`${path}?status=deleted`)
        .expect(400);
    });
  });

  describe('admin routes', () => {
    it('an admin creates, reads, edits, deactivates and deletes a method', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const name = `Same day ${uniqueTag()}`;

      const created = await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({ name, description: 'Delivered today', price: 25 })
        .expect(201);
      const method = (created.body as { data: MethodBody }).data;
      expect(method).toMatchObject({
        name,
        price: 25,
        status: 'ACTIVE',
        deletedAt: null,
      });

      await request(app.getHttpServer())
        .get(`${path}/${method.id}`)
        .expect(200);

      const repriced = await request(app.getHttpServer())
        .patch(`${path}/${method.id}`)
        .send({ price: 30 })
        .expect(200);
      expect((repriced.body as { data: MethodBody }).data.price).toBe(30);

      const deactivated = await request(app.getHttpServer())
        .patch(`${path}/${method.id}`)
        .send({ status: 'INACTIVE' })
        .expect(200);
      expect((deactivated.body as { data: MethodBody }).data.status).toBe(
        'INACTIVE',
      );

      await request(app.getHttpServer())
        .delete(`${path}/${method.id}`)
        .expect(204);

      const deleted = await request(app.getHttpServer())
        .get(`${path}/${method.id}`)
        .expect(200);
      expect(
        (deleted.body as { data: MethodBody }).data.deletedAt,
      ).not.toBeNull();

      for (const call of [
        () =>
          request(app.getHttpServer())
            .patch(`${path}/${method.id}`)
            .send({ price: 1 }),
        () => request(app.getHttpServer()).delete(`${path}/${method.id}`),
      ]) {
        const response = await call().expect(404);
        expect((response.body as ErrorBody).errors[0]).toMatchObject({
          errCode: 'shippingMethodNotFound',
          field: 'id',
        });
      }
    });

    it('POST a second "Roast Express" returns 409 "Shipping method name already exists"', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const name = `Roast Express ${uniqueTag()}`;
      await createMethod(name, 12);

      const response = await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: `  ${name.toLowerCase()} `,
          description: 'Again',
          price: 12,
        })
        .expect(409);

      expect((response.body as ErrorBody).errors[0]).toMatchObject({
        errCode: 'shippingMethodNameExists',
        field: 'name',
        message: 'Shipping method name already exists',
      });
    });

    it('POST "50%_x" twice: the second is 409 and a method named "50 x" is not a conflict', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const tag = uniqueTag();
      await createMethod(`50 x ${tag}`, 1);
      const send = () =>
        request(app.getHttpServer())
          .post(path)
          .set('Idempotency-Key', randomUUID())
          .send({ name: `50%_x ${tag}`, description: 'Promo', price: 1 });

      await send().expect(201);
      await send().expect(409);
    });

    it('POST with price -1 returns 400 on price', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Negative ${uniqueTag()}`, description: 'No', price: -1 })
        .expect(400);

      const fields = (response.body as ErrorBody).errors.map(
        ({ field }) => field,
      );
      expect(fields).toEqual(['price']);
    });

    it('POST without Idempotency-Key returns 400', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .post(path)
        .send({ name: `No key ${uniqueTag()}`, description: 'No', price: 1 })
        .expect(400);
    });

    it('a signed-in USER gets 403 on POST, PATCH and DELETE', async () => {
      const method = await createMethod(`Forbidden ${uniqueTag()}`, 4);
      const user = await createTestUser(UserRole.USER);
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `User ${uniqueTag()}`, description: 'No', price: 1 })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${path}/${method.id}`)
        .send({ price: 1 })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${path}/${method.id}`)
        .expect(403);
    });

    it('a guest gets 401 on GET /:id, POST, PATCH and DELETE', async () => {
      const method = await createMethod(`Guest ${uniqueTag()}`, 4);

      await request(app.getHttpServer())
        .get(`${path}/${method.id}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Guest ${uniqueTag()}`, description: 'No', price: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${path}/${method.id}`)
        .send({ price: 1 })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`${path}/${method.id}`)
        .expect(401);
    });
  });

  describe('audit', () => {
    type AuditFields = {
      id: string;
      createdBy?: string | null;
      updatedBy?: string | null;
      deletedBy?: string | null;
    };

    it('create, update and delete stamp the admin', async () => {
      const a1 = await createTestUser(UserRole.ADMIN);
      const a2 = await createTestUser(UserRole.ADMIN);

      mockSessionFor(a1.clerkId);
      const created = await request(app.getHttpServer())
        .post(path)
        .set('Idempotency-Key', randomUUID())
        .send({ name: `Audit ${uniqueTag()}`, description: 'Audit', price: 7 })
        .expect(201);
      const { data: afterCreate } = created.body as { data: AuditFields };
      expect(afterCreate).toMatchObject({
        createdBy: a1.id,
        updatedBy: a1.id,
        deletedBy: null,
      });

      mockSessionFor(a2.clerkId);
      const updated = await request(app.getHttpServer())
        .patch(`${path}/${afterCreate.id}`)
        .send({ price: 8 })
        .expect(200);
      expect((updated.body as { data: AuditFields }).data).toMatchObject({
        createdBy: a1.id,
        updatedBy: a2.id,
        deletedBy: null,
      });

      await request(app.getHttpServer())
        .delete(`${path}/${afterCreate.id}`)
        .expect(204);
      const read = await request(app.getHttpServer())
        .get(`${path}/${afterCreate.id}`)
        .expect(200);
      expect((read.body as { data: AuditFields }).data).toMatchObject({
        createdBy: a1.id,
        updatedBy: a2.id,
        deletedBy: a2.id,
      });
    });

    const expectNoAuditKeys = (methods: MethodBody[]) => {
      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        expect(method).not.toHaveProperty('createdBy');
        expect(method).not.toHaveProperty('updatedBy');
        expect(method).not.toHaveProperty('deletedBy');
      }
    };

    it("a guest's response has no audit keys", async () => {
      const tag = uniqueTag();
      await createMethod(`Audit guest ${tag}`, 2);

      expectNoAuditKeys(await list(`search=${tag}`));
    });

    it("a USER's response has no audit keys", async () => {
      const tag = uniqueTag();
      await createMethod(`Audit user ${tag}`, 2);
      const user = await createTestUser(UserRole.USER);
      mockSessionFor(user.clerkId);

      expectNoAuditKeys(await list(`search=${tag}`));
    });

    it('the admin list includes the audit keys', async () => {
      const tag = uniqueTag();
      const method = await createMethod(`Audit admin ${tag}`, 2);
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const methods = (await list(`search=${tag}`)) as unknown as AuditFields[];
      expect(methods).toEqual([
        expect.objectContaining({
          id: method.id,
          createdBy: null,
          updatedBy: null,
          deletedBy: null,
        }),
      ]);
    });
  });
});
