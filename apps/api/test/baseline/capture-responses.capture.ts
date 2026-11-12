import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import {
  UserRole,
  ProductStatus,
  RoastLevel,
  DiscountType,
  ProductUnit,
} from '@repo/constants';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';

/**
 * Captures the status and full JSON body of the user, category and product
 * endpoints against a fixed synthetic dataset, so two runs can be diffed.
 * Generated ids and timestamps are replaced with stable labels. Not part of
 * the regular suites (the name does not match `*.e2e-spec.ts`).
 *
 * Run against an empty test database:
 *   pnpm run pretest:e2e
 *   CAPTURE_OUT=<file.json> pnpm vitest run --config ./vitest.config.e2e.ts \
 *     test/baseline/capture-responses.capture.ts
 */

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface CapturedResponse {
  name: string;
  method: string;
  path: string;
  status: number;
  body: unknown;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;

describe('API response capture', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  const responses: CapturedResponse[] = [];
  const labels = new Map<string, string>();

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
    await app.close();
  });

  beforeEach(() => {
    (getAuth as Mock).mockReturnValue({ userId: null });
  });

  const mockSessionFor = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const label = (id: string, name: string): void => {
    labels.set(id, name);
  };

  const record = async (
    name: string,
    method: string,
    path: string,
    pending: request.Test,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await pending;
    const body: unknown = response.text === '' ? null : response.body;
    responses.push({ name, method, path, status: response.status, body });
    return { status: response.status, body };
  };

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  const api = {
    get: (name: string, path: string) =>
      record(name, 'GET', path, http().get(`${API_BASE_PATH}${path}`)),
    post: (name: string, path: string, payload: object) =>
      record(
        name,
        'POST',
        path,
        http()
          .post(`${API_BASE_PATH}${path}`)
          .set('Idempotency-Key', randomUUID())
          .send(payload),
      ),
    patch: (name: string, path: string, payload: object) =>
      record(
        name,
        'PATCH',
        path,
        http().patch(`${API_BASE_PATH}${path}`).send(payload),
      ),
    delete: (name: string, path: string) =>
      record(name, 'DELETE', path, http().delete(`${API_BASE_PATH}${path}`)),
  };

  const idOf = (result: { body: unknown }): string =>
    (result.body as { data: { id: string } }).data.id;

  const seedUser = (
    key: string,
    role: UserRole,
    firstName: string,
    lastName: string,
  ) =>
    RequestContext.create(orm.em, async () => {
      const user = await userService.create({
        clerkId: `clerk-baseline-${key}`,
        email: `${key}@baseline.test`,
        firstName,
        lastName,
        role,
      });
      label(user.id, `user:${key}`);
      return user;
    });

  const seedCategory = (key: string, name: string) =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({ name });
      label(category.id, `category:${key}`);
      return category;
    });

  type ProductCreateInput = Parameters<typeof productService.create>[0];

  const seedProduct = (
    key: string,
    data: Partial<ProductCreateInput> &
      Pick<ProductCreateInput, 'categoryId' | 'name'>,
  ) =>
    RequestContext.create(orm.em, async () => {
      const product = await productService.create({
        roastLevel: RoastLevel.MEDIUM,
        description: 'A balanced, well-rounded coffee.',
        origin: 'Ethiopia',
        processingMethod: 'Washed',
        images: [],
        variants: [],
        ...data,
      });
      label(product.id, `product:${key}`);
      return product;
    });

  it('captures the user, category and product responses', async () => {
    const existing = await RequestContext.create(orm.em, () =>
      userService.findAll({ page: 1, limit: 1 }),
    );
    if (existing.meta.totalCount !== 0) {
      throw new Error(
        'The test database is not empty. Run `pnpm run pretest:e2e` first.',
      );
    }

    const admin = await seedUser('admin', UserRole.ADMIN, 'Baseline', 'Admin');
    const member = await seedUser(
      'member',
      UserRole.USER,
      'Baseline',
      'Member',
    );
    const target = await seedUser(
      'target',
      UserRole.USER,
      'Baseline',
      'Target',
    );

    const espresso = await seedCategory('espresso', 'Baseline Espresso');
    const filter = await seedCategory('filter', 'Baseline Filter');

    const ethiopia = await seedProduct('ethiopia', {
      categoryId: espresso.id,
      name: 'Baseline Ethiopia Yirgacheffe',
      roastLevel: RoastLevel.LIGHT,
      status: ProductStatus.ACTIVE,
      isOrganic: true,
      tastingNotes: 'Jasmine, bergamot, lemon',
      origin: 'Ethiopia',
      processingMethod: 'Washed',
      images: [
        {
          url: 'https://example.com/baseline/ethiopia-1.jpg',
          isPrimary: true,
          sortOrder: 0,
        },
        {
          url: 'https://example.com/baseline/ethiopia-2.jpg',
          isPrimary: false,
          sortOrder: 1,
        },
      ],
      variants: [
        {
          sku: 'BASELINE-ETH-250G',
          weight: '250.000',
          unit: ProductUnit.G,
          price: '12.50',
          quantity: 40,
        },
        {
          sku: 'BASELINE-ETH-1KG',
          weight: '1.000',
          unit: ProductUnit.KG,
          price: '40.00',
          discountType: DiscountType.PERCENT,
          discountValue: '10.00',
          quantity: 12,
        },
      ],
    });
    await seedProduct('colombia', {
      categoryId: espresso.id,
      name: 'Baseline Colombia Supremo',
      roastLevel: RoastLevel.MEDIUM,
      status: ProductStatus.ACTIVE,
      variants: [
        {
          sku: 'BASELINE-COL-500G',
          weight: '500.000',
          unit: ProductUnit.G,
          price: '20.00',
          quantity: 25,
        },
      ],
    });
    await seedProduct('sumatra', {
      categoryId: filter.id,
      name: 'Baseline Sumatra Mandheling',
      roastLevel: RoastLevel.DARK,
      status: ProductStatus.ACTIVE,
      variants: [
        {
          sku: 'BASELINE-SUM-250G',
          weight: '250.000',
          unit: ProductUnit.G,
          price: '8.00',
          quantity: 60,
        },
      ],
    });
    await seedProduct('kenya', {
      categoryId: filter.id,
      name: 'Baseline Kenya AA',
      roastLevel: RoastLevel.LIGHT,
      status: ProductStatus.DRAFT,
    });

    // Reads first, so list order is the insertion order of the fresh tables.
    mockSessionFor(null);
    await api.get('category: list', '/categories');
    await api.get('category: get by id', `/categories/${espresso.id}`);
    await api.get('product: list', '/products');
    await api.get(
      'product: list filtered by category',
      `/products?categoryId=${espresso.id}`,
    );
    await api.get(
      'product: list sorted by price',
      '/products?sortBy=PRICE_ASC',
    );
    await api.get(
      'product: get by id with images and variants',
      `/products/${ethiopia.id}`,
    );

    mockSessionFor(admin.clerkId);
    await api.get('user: list', '/users');
    await api.get('user: get by id', `/users/${target.id}`);

    mockSessionFor(member.clerkId);
    await api.get('user: me', '/users/me');

    // Mutations as ADMIN.
    mockSessionFor(admin.clerkId);
    const createdCategory = await api.post('category: create', '/categories', {
      name: 'Baseline Cold Brew',
    });
    label(idOf(createdCategory), 'category:created');
    await api.patch(
      'category: update',
      `/categories/${idOf(createdCategory)}`,
      { name: 'Baseline Cold Brew Renamed' },
    );
    await api.delete(
      'category: delete',
      `/categories/${idOf(createdCategory)}`,
    );

    const createdProduct = await api.post('product: create', '/products', {
      categoryId: filter.id,
      name: 'Baseline Guatemala Antigua',
      roastLevel: RoastLevel.MEDIUM,
      description: 'A balanced, well-rounded coffee.',
      origin: 'Guatemala',
      processingMethod: 'Washed',
      status: ProductStatus.ACTIVE,
      images: [
        {
          url: 'https://example.com/baseline/guatemala-1.jpg',
          isPrimary: true,
        },
        { url: 'https://example.com/baseline/guatemala-2.jpg' },
      ],
      variants: [
        {
          sku: 'BASELINE-GUA-250G',
          weight: 250,
          unit: ProductUnit.G,
          price: 14.5,
          discountType: DiscountType.FIXED,
          discountValue: 1.5,
          quantity: 30,
        },
      ],
    });
    label(idOf(createdProduct), 'product:created');
    await api.patch('product: update', `/products/${idOf(createdProduct)}`, {
      name: 'Baseline Guatemala Antigua Reserve',
      status: ProductStatus.INACTIVE,
    });
    await api.delete('product: delete', `/products/${idOf(createdProduct)}`);

    await api.patch('user: update', `/users/${target.id}`, {
      firstName: 'Updated',
      status: 'INACTIVE',
    });
    await api.delete('user: delete', `/users/${target.id}`);

    // Error responses.
    await api.post('error 400: invalid category name', '/categories', {
      name: 'a',
    });
    mockSessionFor('clerk-baseline-unknown');
    await api.get('error 401: session without a local user', '/users');
    mockSessionFor(member.clerkId);
    await api.post('error 403: category create as non-ADMIN', '/categories', {
      name: 'Baseline Forbidden',
    });
    mockSessionFor(null);
    await api.get('error 404: missing product', `/products/${NIL_UUID}`);
    mockSessionFor(admin.clerkId);
    await api.post('error 409: duplicate product name', '/products', {
      categoryId: espresso.id,
      name: 'Baseline Colombia Supremo',
      roastLevel: RoastLevel.MEDIUM,
      description: 'A balanced, well-rounded coffee.',
      origin: 'Colombia',
      processingMethod: 'Washed',
      images: [
        { url: 'https://example.com/baseline/colombia-1.jpg', isPrimary: true },
        { url: 'https://example.com/baseline/colombia-2.jpg' },
      ],
      variants: [
        {
          sku: 'BASELINE-COL-DUP',
          weight: 250,
          unit: ProductUnit.G,
          price: 10,
        },
      ],
    });

    let unknownCount = 0;
    const normalized = JSON.stringify({ responses }, null, 2)
      .replace(TIMESTAMP_PATTERN, '<timestamp>')
      .replace(UUID_PATTERN, (id) => {
        if (id === NIL_UUID) return id;
        if (!labels.has(id)) {
          unknownCount += 1;
          labels.set(id, `uuid-${unknownCount}`);
        }
        return `<${labels.get(id)}>`;
      });

    const outFile = resolve(
      process.env.CAPTURE_OUT ?? 'baseline-responses.json',
    );
    writeFileSync(outFile, `${normalized}\n`);
  });
});
