import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import { ProductUnit, RoastLevel, UserRole } from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { Category } from './../../src/modules/category/entities/category.entity.js';
import { Product } from './../../src/modules/product/entities/product.entity.js';
import type { User } from './../../src/modules/user/entities/user.entity.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';
import { ERROR_MESSAGES } from './../../src/common/constants/message.constant.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

type ErrorBody = {
  errors: Array<{ errCode: string; field: string; message: string }>;
};

describe('Idempotency-Key on create routes (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];

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
      for (const id of createdProductIds) {
        await productService.remove(id).catch(() => undefined);
      }
      for (const id of createdCategoryIds) {
        await categoryService.remove(id).catch(() => undefined);
      }
      for (const id of createdUserIds) {
        await userService.remove(id).catch(() => undefined);
      }
    });
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const uniqueName = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const signInAdmin = async (): Promise<User> => {
    const admin = await RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'E2E',
        lastName: 'Test',
        role: UserRole.ADMIN,
      });
      createdUserIds.push(user.id);
      return user;
    });
    (getAuth as Mock).mockReturnValue({ userId: admin.clerkId });
    return admin;
  };

  const seedCategory = async (name: string): Promise<Category> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({ name });
      createdCategoryIds.push(category.id);
      return category;
    });

  const productBody = (categoryId: string, name: string) => ({
    categoryId,
    name,
    roastLevel: RoastLevel.MEDIUM,
    description: 'A balanced, well-rounded coffee.',
    origin: 'Ethiopia',
    processingMethod: 'Washed',
    images: [
      { url: 'https://example.com/1.jpg', isPrimary: true },
      { url: 'https://example.com/2.jpg' },
    ],
    variants: [
      {
        sku: uniqueName('SKU-IDEM'),
        weight: 250,
        unit: ProductUnit.G,
        price: 12.5,
      },
    ],
  });

  const postCategory = (body: object, key?: string) => {
    const req = request(app.getHttpServer()).post(
      `${API_BASE_PATH}/categories`,
    );
    return (key === undefined ? req : req.set('Idempotency-Key', key)).send(
      body,
    );
  };

  const postProduct = (body: object, key?: string) => {
    const req = request(app.getHttpServer()).post(`${API_BASE_PATH}/products`);
    return (key === undefined ? req : req.set('Idempotency-Key', key)).send(
      body,
    );
  };

  const countCategories = (name: string) =>
    orm.em.fork().count(Category, { name }, { filters: false });

  const countProducts = (name: string) =>
    orm.em.fork().count(Product, { name }, { filters: false });

  it('POST /categories replays the original 201 for the same Idempotency-Key and body', async () => {
    await signInAdmin();
    const key = randomUUID();
    const body = { name: uniqueName('Replay E2E') };

    const first = await postCategory(body, key).expect(201);
    createdCategoryIds.push((first.body as { data: { id: string } }).data.id);
    expect(first.headers['idempotent-replayed']).toBeUndefined();

    const second = await postCategory(body, key).expect(201);

    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await countCategories(body.name)).toBe(1);
  });

  it('POST /products replays the original 201 for the same Idempotency-Key and body', async () => {
    await signInAdmin();
    const category = await seedCategory(
      uniqueName('Replay Product Category E2E'),
    );
    const key = randomUUID();
    const body = productBody(category.id, uniqueName('Replay Product E2E'));

    const first = await postProduct(body, key).expect(201);
    createdProductIds.push((first.body as { data: { id: string } }).data.id);

    const second = await postProduct(body, key).expect(201);

    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await countProducts(body.name)).toBe(1);
  });

  it('POST /categories responds 422 for the same Idempotency-Key with a different body', async () => {
    await signInAdmin();
    const key = randomUUID();
    const name = uniqueName('Mismatch E2E');

    const first = await postCategory({ name }, key).expect(201);
    createdCategoryIds.push((first.body as { data: { id: string } }).data.id);

    await postCategory({ name: uniqueName('Mismatch Other E2E') }, key).expect(
      422,
    );
  });

  it('POST /categories responds 409 NAME_EXISTS for a different Idempotency-Key with the same body', async () => {
    await signInAdmin();
    const body = { name: uniqueName('Different Key E2E') };

    const first = await postCategory(body, randomUUID()).expect(201);
    createdCategoryIds.push((first.body as { data: { id: string } }).data.id);

    const second = await postCategory(body, randomUUID()).expect(409);

    expect((second.body as ErrorBody).errors[0].errCode).toBe(
      ERROR_CODES.CATEGORY.NAME_EXISTS,
    );
    expect(second.headers['idempotent-replayed']).toBeUndefined();
  });

  it('POST /categories without an Idempotency-Key responds 400 and creates nothing', async () => {
    await signInAdmin();
    const name = uniqueName('No Key E2E');

    const response = await postCategory({ name }).expect(400);

    const error = (response.body as ErrorBody).errors[0];
    expect(error.errCode).toBe(ERROR_CODES.INVALID_REQUEST);
    expect(error.message).toBe(ERROR_MESSAGES.IDEMPOTENCY.KEY_REQUIRED);
    expect(await countCategories(name)).toBe(0);
  });

  it('POST /products without an Idempotency-Key responds 400 and creates nothing', async () => {
    await signInAdmin();
    const category = await seedCategory(
      uniqueName('No Key Product Category E2E'),
    );
    const body = productBody(category.id, uniqueName('No Key Product E2E'));

    await postProduct(body).expect(400);

    expect(await countProducts(body.name)).toBe(0);
  });

  it('POST /categories with the same Idempotency-Key while the first is still running responds 409 and one row is created', async () => {
    await signInAdmin();
    const key = randomUUID();
    const body = { name: uniqueName('In Flight E2E') };
    const create: CategoryService['create'] = (dto) =>
      categoryService.create(dto);
    let entered!: () => void;
    const handlerEntered = new Promise<void>((resolve) => (entered = resolve));
    let release!: () => void;
    const handlerReleased = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(categoryService, 'create').mockImplementationOnce(async (dto) => {
      entered();
      await handlerReleased;
      return create(dto);
    });

    const firstResponse = postCategory(body, key).then((res) => res);
    await handlerEntered;

    let second: Awaited<ReturnType<typeof postCategory>>;
    try {
      second = await postCategory(body, key);
    } finally {
      release();
    }
    const first = await firstResponse;

    expect(second.status).toBe(409);

    expect(second.headers['retry-after']).toBe('1');
    expect((second.body as ErrorBody).errors[0].errCode).toBe(
      ERROR_CODES.DUPLICATE_RESOURCE,
    );
    expect(first.status).toBe(201);
    createdCategoryIds.push((first.body as { data: { id: string } }).data.id);
    expect(await countCategories(body.name)).toBe(1);
  });

  it('same Idempotency-Key and body after a 409 still responds 409 NAME_EXISTS on /categories', async () => {
    await signInAdmin();
    const name = uniqueName('Taken E2E');
    await seedCategory(name);
    const key = randomUUID();

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await postCategory({ name }, key).expect(409);
      const error = (response.body as ErrorBody).errors[0];
      expect(error.errCode).toBe(ERROR_CODES.CATEGORY.NAME_EXISTS);
      expect(error.field).toBe('name');
      expect(response.headers['idempotent-replayed']).toBeUndefined();
    }
  });

  it('same Idempotency-Key and body after a 409 still responds 409 NAME_EXISTS on /products', async () => {
    await signInAdmin();
    const category = await seedCategory(
      uniqueName('Taken Product Category E2E'),
    );
    const name = uniqueName('Taken Product E2E');
    const seeded = await postProduct(
      productBody(category.id, name),
      randomUUID(),
    ).expect(201);
    createdProductIds.push((seeded.body as { data: { id: string } }).data.id);
    const key = randomUUID();
    const body = productBody(category.id, name);

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await postProduct(body, key).expect(409);
      const error = (response.body as ErrorBody).errors[0];
      expect(error.errCode).toBe(ERROR_CODES.PRODUCT.NAME_EXISTS);
      expect(error.field).toBe('name');
      expect(response.headers['idempotent-replayed']).toBeUndefined();
    }
  });
});
