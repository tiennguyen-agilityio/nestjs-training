import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import { AppModule } from './../../src/app.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { RoastLevel, UserRole } from '@repo/constants';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';
import type { User } from './../../src/modules/user/entities/user.entity.js';
import { Category } from './../../src/modules/category/entities/category.entity.js';
import { slugFrom } from './../../src/common/utils/slug.util.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

describe('CategoryController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = await initTestApp(moduleFixture);

    orm = app.get(MikroORM);
    userService = app.get(UserService);
    categoryService = app.get(CategoryService);
    productService = app.get(ProductService);
  });

  afterAll(async () => {
    await RequestContext.create(orm.em, async () => {
      for (const id of createdCategoryIds) {
        await categoryService.remove(id).catch(() => undefined);
      }
      for (const id of createdUserIds) {
        await userService.remove(id).catch(() => undefined);
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
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'E2E',
        lastName: 'Test',
        role,
      });
      createdUserIds.push(user.id);
      return user;
    });

  const createTestCategory = async (name: string): Promise<Category> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({ name });
      createdCategoryIds.push(category.id);
      return category;
    });

  const mockSessionFor = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const uniqueName = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  describe('public GET routes', () => {
    it('GET /categories responds 200 with the paginated envelope, no session required', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('GET /categories?search=% returns no categories when no name contains "%"', async () => {
      await createTestCategory(uniqueName('Wildcard E2E'));

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories?search=${encodeURIComponent('%')}`)
        .expect(200);

      const body = response.body as { data: unknown[] };
      expect(body.data).toHaveLength(0);
    });

    it('GET /categories?search=_ matches "_" literally, not as a single-character wildcard', async () => {
      const withUnderscore = await createTestCategory(
        uniqueName('Cold_Brew E2E'),
      );
      const withoutUnderscore = await createTestCategory(
        uniqueName('Plain E2E'),
      );

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories?search=${encodeURIComponent('_')}`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((c) => c.id);
      expect(ids).toContain(withUnderscore.id);
      expect(ids).not.toContain(withoutUnderscore.id);
    });

    it('GET /categories?search=50% finds names containing "50%" only', async () => {
      const withPercent = await createTestCategory(uniqueName('50% off E2E'));
      const withoutPercent = await createTestCategory(
        uniqueName('500 Beans E2E'),
      );

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories?search=${encodeURIComponent('50%')}`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((c) => c.id);
      expect(ids).toContain(withPercent.id);
      expect(ids).not.toContain(withoutPercent.id);
    });

    it('GET /categories?search= (empty) does not filter the list', async () => {
      const category = await createTestCategory(uniqueName('Empty Search E2E'));

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories?search=`)
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((c) => c.id);
      expect(ids).toContain(category.id);
    });

    it('GET /categories/:id responds 200 for an existing category, no session required', async () => {
      const category = await createTestCategory(uniqueName('Espresso E2E'));

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          id: category.id,
          name: category.name,
          slug: category.slug,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
          deletedAt: category.deletedAt
            ? category.deletedAt.toISOString()
            : null,
        },
      });
    });

    it('GET /categories/:id responds 404 for a missing category', async () => {
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/00000000-0000-0000-0000-000000000000`)
        .expect(404);
    });

    it('GET /categories/:id responds 400 for a malformed id', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/not-a-uuid`)
        .expect(400);

      const body = response.body as {
        statusCode: number;
        errors: Array<{ errCode: string }>;
      };
      expect(body.statusCode).toBe(400);
      expect(body.errors).toEqual([
        expect.objectContaining({ errCode: 'isUuid', field: 'id' }),
      ]);
    });
  });

  describe('mutating routes without a Clerk session', () => {
    it.each([
      ['post', `${API_BASE_PATH}/categories`],
      ['patch', `${API_BASE_PATH}/categories/some-id`],
      ['delete', `${API_BASE_PATH}/categories/some-id`],
      ['patch', `${API_BASE_PATH}/categories/some-id/restore`],
    ])('%s %s responds 401', async (method, path) => {
      await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (path: string) => request.Test
        >
      )
        [method](path)
        .send({ name: 'Whatever' })
        .expect(401);
    });
  });

  describe('mutating routes with an authenticated non-ADMIN user', () => {
    it('POST /categories responds 403', async () => {
      const user = await createTestUser(UserRole.USER);
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Non Admin Category' })
        .expect(403);
    });

    it('PATCH /categories/:id/restore responds 403 and leaves the category deleted', async () => {
      const user = await createTestUser(UserRole.USER);
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory(
        uniqueName('Restore Forbidden E2E'),
      );
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(403);

      mockSessionFor(admin.clerkId);
      const response = await request(app.getHttpServer())
        .get(
          `${API_BASE_PATH}/categories?search=${encodeURIComponent(category.name)}`,
        )
        .expect(200);

      const body = response.body as {
        data: Array<{ id: string; deletedAt: string | null }>;
      };
      const found = body.data.find((c) => c.id === category.id);
      expect(found).toBeDefined();
      expect(found?.deletedAt).not.toBeNull();
    });
  });

  describe('mutating routes with an authenticated ADMIN user', () => {
    it('POST /categories responds 201 and creates a category with a derived slug', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Cold Brew E2E');

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdCategoryIds.push(body.data.id);
      expect(body.data).toMatchObject({
        name,
        slug: slugFrom(name),
      });
    });

    it('POST /categories responds 400 with field-level errors for an invalid name', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'a' })
        .expect(400);

      const body = response.body as {
        statusCode: number;
        message: string;
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.statusCode).toBe(400);
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors.every((error) => error.field === 'name')).toBe(true);
    });

    it('POST /categories responds 400 for a name over the max length', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'a'.repeat(256) })
        .expect(400);

      const body = response.body as {
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.errors.every((error) => error.field === 'name')).toBe(true);
    });

    it('POST /categories responds 409 for a duplicate name', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const category = await createTestCategory(uniqueName('Duplicate E2E'));

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: category.name })
        .expect(409);
    });

    it('POST /categories twice with the same body and no Idempotency-Key: both respond 400, no row', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Baseline E2E');

      for (let attempt = 0; attempt < 2; attempt++) {
        await request(app.getHttpServer())
          .post(`${API_BASE_PATH}/categories`)
          .send({ name })
          .expect(400);
      }

      expect(
        await orm.em.fork().count(Category, { name }, { filters: false }),
      ).toBe(0);
    });

    it('PATCH /categories/:id responds 200 and updates the category', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const category = await createTestCategory(uniqueName('Latte E2E'));
      const newName = uniqueName('Latte Renamed E2E');

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}`)
        .send({ name: newName })
        .expect(200);

      const body = response.body as { data: unknown };
      expect(body.data).toMatchObject({
        name: newName,
        slug: slugFrom(newName),
      });
    });

    it('DELETE /categories/:id responds 204 and soft-deletes the category', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const category = await createTestCategory(uniqueName('Mocha E2E'));

      await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(204);

      mockSessionFor(null);
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(404);
    });

    it('DELETE /categories/:id responds 409 while the category still has products', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const category = await createTestCategory(uniqueName('In Use E2E'));
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('In Use Product E2E'),
          roastLevel: RoastLevel.MEDIUM,
          description: 'A balanced, well-rounded coffee.',
          origin: 'Ethiopia',
          processingMethod: 'Washed',
          images: [],
          variants: [],
        }),
      );

      const response = await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(409);

      const body = response.body as { errors: Array<{ errCode: string }> };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.CATEGORY.HAS_PRODUCTS);

      await RequestContext.create(orm.em, () =>
        productService.remove(product.id),
      );

      await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(204);
    });

    it.each(['patch', 'delete'] as const)(
      '%s /categories/:id responds 400 for a malformed id',
      async (method) => {
        const admin = await createTestUser(UserRole.ADMIN);
        mockSessionFor(admin.clerkId);

        await request(app.getHttpServer())
          [method](`${API_BASE_PATH}/categories/not-a-uuid`)
          .send({ name: 'Whatever' })
          .expect(400);
      },
    );

    it('GET /categories includes soft-deleted rows for an ADMIN caller', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory(
        uniqueName('Deleted Visible E2E'),
      );
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(
          `${API_BASE_PATH}/categories?search=${encodeURIComponent(category.name)}`,
        )
        .expect(200);

      const body = response.body as {
        data: Array<{ id: string; deletedAt: string | null }>;
      };
      const deleted = body.data.find((c) => c.id === category.id);
      expect(deleted).toBeDefined();
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('GET /categories excludes soft-deleted rows for a non-ADMIN caller', async () => {
      const user = await createTestUser(UserRole.USER);
      const category = await createTestCategory(
        uniqueName('Deleted Hidden E2E'),
      );
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(user.clerkId);

      const response = await request(app.getHttpServer())
        .get(
          `${API_BASE_PATH}/categories?search=${encodeURIComponent(category.name)}`,
        )
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((c) => c.id);
      expect(ids).not.toContain(category.id);
    });

    it('PATCH /categories/:id/restore responds 200 and a non-ADMIN sees the category again', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory(uniqueName('Restore E2E'));
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(200);

      const body = response.body as {
        data: { id: string; deletedAt: string | null };
      };
      expect(body.data.id).toBe(category.id);
      expect(body.data.deletedAt).toBeNull();

      mockSessionFor(null);
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(200);
    });

    it('PATCH /categories/:id/restore responds 404 for a missing category', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .patch(
          `${API_BASE_PATH}/categories/00000000-0000-0000-0000-000000000000/restore`,
        )
        .expect(404);

      const body = response.body as { errors: Array<{ errCode: string }> };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.CATEGORY.NOT_FOUND);
    });

    it('PATCH /categories/:id/restore responds 409 for a category that is not deleted', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const category = await createTestCategory(uniqueName('Not Deleted E2E'));

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(409);

      const body = response.body as { errors: Array<{ errCode: string }> };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.CATEGORY.NOT_DELETED);
    });

    it('PATCH /categories/:id/restore responds 409 on a second restore', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory(
        uniqueName('Double Restore E2E'),
      );
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(409);

      const body = response.body as { errors: Array<{ errCode: string }> };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.CATEGORY.NOT_DELETED);
    });

    it('a restored category can be deleted again', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory(
        uniqueName('Restore Then Delete E2E'),
      );
      await RequestContext.create(orm.em, () =>
        categoryService.remove(category.id),
      );
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/${category.id}/restore`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/categories/${category.id}`)
        .expect(204);
    });

    it('PATCH /categories/:id/restore responds 400 for a malformed id', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/categories/not-a-uuid/restore`)
        .expect(400);
    });
  });
});
