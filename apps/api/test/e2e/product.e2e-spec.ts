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
import { ProductImageService } from './../../src/modules/product-image/services/product-image.service.js';
import { ProductVariantService } from './../../src/modules/product-variant/services/product-variant.service.js';
import {
  UserRole,
  UserStatus,
  DiscountType,
  ProductUnit,
  ProductStatus,
  RoastLevel,
  ProductSortBy,
} from '@repo/constants';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import type { User } from './../../src/modules/user/entities/user.entity.js';
import type { Category } from './../../src/modules/category/entities/category.entity.js';
import type { Product } from './../../src/modules/product/entities/product.entity.js';
import { ProductVariant } from './../../src/modules/product-variant/entities/product-variant.entity.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';
import { slugFrom } from './../../src/common/utils/slug.util.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

describe('ProductController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let productImageService: ProductImageService;
  let productVariantService: ProductVariantService;
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
    productImageService = app.get(ProductImageService);
    productVariantService = app.get(ProductVariantService);
  });

  // Each user removal calls Clerk, which fails slowly against test keys.
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
  }, 30_000);

  beforeEach(() => {
    (getAuth as Mock).mockReturnValue({ userId: null });
  });

  const uniqueName = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const validImages = (): Array<{ url: string; isPrimary?: boolean }> => [
    { url: 'https://example.com/1.jpg', isPrimary: true },
    { url: 'https://example.com/2.jpg' },
  ];

  const requiredProductFields = (): {
    roastLevel: RoastLevel;
    description: string;
    origin: string;
    processingMethod: string;
  } => ({
    roastLevel: RoastLevel.MEDIUM,
    description: 'A balanced, well-rounded coffee.',
    origin: 'Ethiopia',
    processingMethod: 'Washed',
  });

  const validVariant = (
    skuBase: string,
  ): {
    sku: string;
    weight: number;
    unit: ProductUnit;
    price: number;
  } => ({
    sku: uniqueName(skuBase),
    weight: 250,
    unit: ProductUnit.G,
    price: 12.5,
  });

  const createTestUser = async (
    role: UserRole,
    status?: UserStatus,
  ): Promise<User> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'E2E',
        lastName: 'Test',
        role,
      });
      createdUserIds.push(user.id);
      if (status && status !== (user.status as UserStatus)) {
        user = await userService.update(user.id, { status });
      }
      return user;
    });

  const createTestCategory = async (): Promise<Category> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: uniqueName('Coffee Category E2E'),
      });
      createdCategoryIds.push(category.id);
      return category;
    });

  const mockSessionFor = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  type VariantBody = {
    id: string;
    price: number;
    discountType: DiscountType;
    discountValue: number;
    quantity: number;
  };

  // A product with one variant priced 100, PERCENT 10, quantity 30, created
  // through the service (no session needed).
  const createPricedProduct = async (
    variant: {
      price?: string;
      discountType?: DiscountType;
      discountValue?: string;
    } = {},
  ): Promise<{ productId: string; variantId: string }> => {
    const category = await createTestCategory();
    const product = await RequestContext.create(orm.em, () =>
      productService.create({
        categoryId: category.id,
        name: uniqueName('Priced Product E2E'),
        status: ProductStatus.ACTIVE,
        ...requiredProductFields(),
        images: [],
        variants: [
          {
            sku: uniqueName('SKU-PRICED'),
            weight: '250',
            unit: ProductUnit.G,
            price: '100',
            discountType: DiscountType.PERCENT,
            discountValue: '10',
            quantity: 30,
            ...variant,
          },
        ],
      }),
    );
    createdProductIds.push(product.id);
    return {
      productId: product.id,
      variantId: product.variants.getItems()[0].id,
    };
  };

  const getVariants = async (productId: string): Promise<VariantBody[]> => {
    const response = await request(app.getHttpServer())
      .get(`${API_BASE_PATH}/products/${productId}`)
      .expect(200);
    return (response.body as { data: { variants: VariantBody[] } }).data
      .variants;
  };

  describe('public GET routes', () => {
    it('GET /products responds 200 with the paginated envelope, no session required', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('GET /products/:id responds 200 for an existing product, no session required', async () => {
      const category = await createTestCategory();
      const name = uniqueName('Ethiopia Yirgacheffe E2E');
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name,
          status: ProductStatus.ACTIVE,
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${product.id}`)
        .expect(200);

      const body = response.body as {
        data: { categoryId: string; images: unknown[]; variants: unknown[] };
      };
      expect(body.data).toMatchObject({
        id: product.id,
        categoryId: category.id,
        name,
        slug: slugFrom(name),
      });
      expect(body.data.images).toEqual([]);
      expect(body.data.variants).toEqual([]);
    });

    const createProductWithVariant = async (): Promise<Product> => {
      const category = await createTestCategory();
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Variant Read E2E'),
          status: ProductStatus.ACTIVE,
          ...requiredProductFields(),
          images: [],
          variants: [
            {
              sku: uniqueName('SKU-READ'),
              weight: '250',
              unit: ProductUnit.G,
              price: '120',
              quantity: 30,
            },
          ],
        }),
      );
      createdProductIds.push(product.id);
      return product;
    };

    // Writes columns the API itself no longer writes (null discounts, an older
    // createdAt), as data stored before this change would have them.
    const setVariantColumns = (
      id: string,
      data: Partial<
        Pick<ProductVariant, 'discountType' | 'discountValue' | 'createdAt'>
      >,
    ): Promise<number> =>
      orm.em.fork().nativeUpdate(ProductVariant, { id }, data);

    it('GET /products/:id reads a stored null/null discount as PERCENT 0', async () => {
      const product = await createProductWithVariant();
      const [variant] = product.variants.getItems();
      await setVariantColumns(variant.id, {
        discountType: null,
        discountValue: null,
      });

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${product.id}`)
        .expect(200);

      const body = response.body as {
        data: {
          variants: Array<{
            discountType: string;
            discountValue: number;
            quantity: number;
          }>;
        };
      };
      expect(body.data.variants[0]).toMatchObject({
        discountType: DiscountType.PERCENT,
        discountValue: 0,
        quantity: 30,
      });
    });

    it('GET /products/:id lists variants oldest first', async () => {
      const product = await createProductWithVariant();
      const [first] = product.variants.getItems();
      const older = await RequestContext.create(orm.em, () =>
        productVariantService.create({
          productId: product.id,
          sku: uniqueName('SKU-OLDER'),
          weight: '500',
          unit: ProductUnit.G,
          price: '200',
        }),
      );
      await setVariantColumns(older.id, {
        createdAt: new Date(first.createdAt.getTime() - 60_000),
      });

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${product.id}`)
        .expect(200);

      const body = response.body as {
        data: { variants: Array<{ id: string }> };
      };
      expect(body.data.variants.map((v) => v.id)).toEqual([older.id, first.id]);
    });

    it('GET /products/:id responds 404 for a missing product', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/00000000-0000-0000-0000-000000000000`)
        .expect(404);

      const body = response.body as {
        errors: Array<{ errCode: string }>;
      };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.PRODUCT.NOT_FOUND);
    });
  });

  describe('GET /products filtering and sorting (e2e)', () => {
    let filterCategory: Category;
    let otherCategory: Category;
    let nameCategory: Category;
    let priceCategory: Category;

    let pLight: Product;
    let pMedium: Product;
    let pDarkInactive: Product;
    let pSearchTarget: Product;
    let pOther: Product;

    let pNameA: Product;
    let pNameB: Product;
    let pNameC: Product;

    let pPrice10: Product;
    let pPrice20: Product;
    let pNoVariant: Product;
    let pGlobalMin: Product;
    let pSimple: Product;

    const searchTerm = uniqueName('SearchTerm');

    beforeAll(async () => {
      filterCategory = await createTestCategory();
      otherCategory = await createTestCategory();
      nameCategory = await createTestCategory();
      priceCategory = await createTestCategory();

      type ProductCreateInput = Parameters<typeof productService.create>[0];

      const create = (
        data: Partial<ProductCreateInput> &
          Pick<ProductCreateInput, 'categoryId' | 'name'>,
      ): Promise<Product> =>
        RequestContext.create(orm.em, () =>
          productService.create({
            ...requiredProductFields(),
            status: ProductStatus.ACTIVE,
            images: [],
            variants: [],
            ...data,
          }),
        );

      pLight = await create({
        categoryId: filterCategory.id,
        name: uniqueName('Filter Light'),
        roastLevel: RoastLevel.LIGHT,
        status: ProductStatus.ACTIVE,
      });
      pMedium = await create({
        categoryId: filterCategory.id,
        name: uniqueName('Filter Medium'),
        roastLevel: RoastLevel.MEDIUM,
        status: ProductStatus.ACTIVE,
      });
      pDarkInactive = await create({
        categoryId: filterCategory.id,
        name: uniqueName('Filter Dark'),
        roastLevel: RoastLevel.DARK,
        status: ProductStatus.INACTIVE,
      });
      pSearchTarget = await create({
        categoryId: filterCategory.id,
        name: `${searchTerm} Roast`,
        roastLevel: RoastLevel.LIGHT,
        status: ProductStatus.ACTIVE,
      });
      pOther = await create({
        categoryId: otherCategory.id,
        name: uniqueName('Other Category Product'),
      });

      pNameA = await create({
        categoryId: nameCategory.id,
        name: uniqueName('AAA Sort Product'),
      });
      pNameB = await create({
        categoryId: nameCategory.id,
        name: uniqueName('BBB Sort Product'),
      });
      pNameC = await create({
        categoryId: nameCategory.id,
        name: uniqueName('CCC Sort Product'),
      });

      pPrice10 = await create({
        categoryId: priceCategory.id,
        name: uniqueName('Price Ten'),
        variants: [
          {
            sku: uniqueName('SKU-10'),
            weight: '250.000',
            unit: ProductUnit.G,
            price: '10.00',
          },
        ],
      });
      pPrice20 = await create({
        categoryId: priceCategory.id,
        name: uniqueName('Price Twenty'),
        variants: [
          {
            sku: uniqueName('SKU-20'),
            weight: '250.000',
            unit: ProductUnit.G,
            price: '20.00',
          },
        ],
      });
      pNoVariant = await create({
        categoryId: priceCategory.id,
        name: uniqueName('Price NoVariant'),
      });
      pGlobalMin = await create({
        categoryId: priceCategory.id,
        name: uniqueName('Price GlobalMin'),
        variants: [
          {
            sku: uniqueName('SKU-GM-LOW'),
            weight: '100.000',
            unit: ProductUnit.G,
            price: '5.00',
          },
          {
            sku: uniqueName('SKU-GM-HIGH'),
            weight: '500.000',
            unit: ProductUnit.G,
            price: '18.00',
          },
        ],
      });
      pSimple = await create({
        categoryId: priceCategory.id,
        name: uniqueName('Price Simple'),
        variants: [
          {
            sku: uniqueName('SKU-SIMPLE'),
            weight: '250.000',
            unit: ProductUnit.G,
            price: '12.00',
          },
        ],
      });

      createdProductIds.push(
        pLight.id,
        pMedium.id,
        pDarkInactive.id,
        pSearchTarget.id,
        pOther.id,
        pNameA.id,
        pNameB.id,
        pNameC.id,
        pPrice10.id,
        pPrice20.id,
        pNoVariant.id,
        pGlobalMin.id,
        pSimple.id,
      );
      createdCategoryIds.push(
        filterCategory.id,
        otherCategory.id,
        nameCategory.id,
        priceCategory.id,
      );
    });

    const idsOf = (body: { data: Array<{ id: string }> }): string[] =>
      body.data.map((p) => p.id);

    it('filters by categoryId', async () => {
      // An active admin, since the category also holds an INACTIVE product.
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ categoryId: filterCategory.id, limit: 50 })
        .expect(200);

      const ids = idsOf(response.body as { data: Array<{ id: string }> });
      expect([...ids].sort()).toEqual(
        [pLight.id, pMedium.id, pDarkInactive.id, pSearchTarget.id].sort(),
      );
      expect(ids).not.toContain(pOther.id);
    });

    it('filters by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: filterCategory.id,
          status: ProductStatus.ACTIVE,
          limit: 50,
        })
        .expect(200);

      const ids = idsOf(response.body as { data: Array<{ id: string }> });
      expect([...ids].sort()).toEqual(
        [pLight.id, pMedium.id, pSearchTarget.id].sort(),
      );
      expect(ids).not.toContain(pDarkInactive.id);
    });

    it('filters by a single roastLevel', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: filterCategory.id,
          roastLevel: RoastLevel.MEDIUM,
          limit: 50,
        })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pMedium.id,
      ]);
    });

    it('filters by a comma-separated multi-value roastLevel', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: filterCategory.id,
          roastLevel: `${RoastLevel.LIGHT},${RoastLevel.MEDIUM}`,
          limit: 50,
        })
        .expect(200);

      const ids = idsOf(response.body as { data: Array<{ id: string }> });
      expect([...ids].sort()).toEqual(
        [pLight.id, pMedium.id, pSearchTarget.id].sort(),
      );
      expect(ids).not.toContain(pDarkInactive.id);
    });

    it('filters by minPrice/maxPrice, matching a product if any non-deleted variant is in range', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: priceCategory.id,
          minPrice: 15,
          maxPrice: 25,
          limit: 50,
        })
        .expect(200);

      const ids = idsOf(response.body as { data: Array<{ id: string }> });
      expect([...ids].sort()).toEqual([pPrice20.id, pGlobalMin.id].sort());
    });

    it('responds 400 when minPrice is greater than maxPrice', async () => {
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ minPrice: 100, maxPrice: 10 })
        .expect(400);
    });

    it('combines categoryId and search', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ categoryId: filterCategory.id, search: searchTerm, limit: 50 })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pSearchTarget.id,
      ]);
    });

    it('sortBy NAME_ASC orders alphabetically ascending', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: nameCategory.id,
          sortBy: ProductSortBy.NAME_ASC,
          limit: 50,
        })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pNameA.id,
        pNameB.id,
        pNameC.id,
      ]);
    });

    it('sortBy NAME_DESC orders alphabetically descending', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: nameCategory.id,
          sortBy: ProductSortBy.NAME_DESC,
          limit: 50,
        })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pNameC.id,
        pNameB.id,
        pNameA.id,
      ]);
    });

    it('sortBy PRICE_ASC orders by each product minimum variant price, with variant-less products last', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: priceCategory.id,
          sortBy: ProductSortBy.PRICE_ASC,
          limit: 50,
        })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pGlobalMin.id,
        pPrice10.id,
        pSimple.id,
        pPrice20.id,
        pNoVariant.id,
      ]);
    });

    it('sortBy PRICE_DESC orders by each product minimum variant price descending, with variant-less products still last', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: priceCategory.id,
          sortBy: ProductSortBy.PRICE_DESC,
          limit: 50,
        })
        .expect(200);

      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pPrice20.id,
        pSimple.id,
        pPrice10.id,
        pGlobalMin.id,
        pNoVariant.id,
      ]);
    });

    it('combining minPrice/maxPrice with sortBy PRICE_ASC still sorts by each product global minimum variant price', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({
          categoryId: priceCategory.id,
          minPrice: 10,
          maxPrice: 25,
          sortBy: ProductSortBy.PRICE_ASC,
          limit: 50,
        })
        .expect(200);

      // pGlobalMin only qualifies for the range via its 18 variant (its other variant, 5,
      // is outside 10-25) — but the sort key must still be its GLOBAL minimum (5), so it
      // sorts before pSimple (global min 12) even though pSimple's qualifying variant (12)
      // is lower than pGlobalMin's qualifying variant (18).
      expect(idsOf(response.body as { data: Array<{ id: string }> })).toEqual([
        pGlobalMin.id,
        pPrice10.id,
        pSimple.id,
        pPrice20.id,
      ]);
    });

    it.each([
      ['categoryId', 'not-a-uuid'],
      ['status', 'NOT_A_STATUS'],
      ['roastLevel', 'NOT_A_ROAST'],
      ['sortBy', 'NOT_A_SORT'],
      ['minPrice', '-5'],
    ])('responds 400 for an invalid %s query param', async (param, value) => {
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ [param]: value })
        .expect(400);
    });
  });

  describe('mutating routes without a Clerk session', () => {
    it.each([
      ['post', `${API_BASE_PATH}/products`],
      ['patch', `${API_BASE_PATH}/products/some-id`],
      ['delete', `${API_BASE_PATH}/products/some-id`],
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
    it('PATCH /products/:id with updateVariants responds 403 for a non-admin and leaves the variant unchanged', async () => {
      const user = await createTestUser(UserRole.USER);
      const { productId, variantId } = await createPricedProduct();
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/products/${productId}`)
        .send({ updateVariants: [{ id: variantId, price: 120 }] })
        .expect(403);

      expect((await getVariants(productId))[0].price).toBe(100);
    });

    it('POST /products responds 403', async () => {
      const user = await createTestUser(UserRole.USER);
      const category = await createTestCategory();
      mockSessionFor(user.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({ categoryId: category.id, name: 'Non Admin Product' })
        .expect(403);
    });
  });

  describe('mutating routes with an authenticated ADMIN user', () => {
    it('POST /products responds 201, derives a slug, and creates the supplied images and variants', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Guatemala Antigua E2E');
      const sku = uniqueName('SKU-E2E');

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          images: [
            { url: 'https://example.com/coffee.jpg', isPrimary: true },
            { url: 'https://example.com/coffee-2.jpg' },
          ],
          variants: [
            {
              sku,
              weight: 250,
              unit: ProductUnit.G,
              price: 12.5,
            },
          ],
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdProductIds.push(body.data.id);
      expect(body.data).toMatchObject({
        categoryId: category.id,
        name,
        slug: slugFrom(name),
      });

      const [images, variants] = await RequestContext.create(orm.em, () =>
        Promise.all([
          productImageService.findAllByProduct(body.data.id),
          productVariantService.findAllByProduct(body.data.id),
        ]),
      );
      expect(images).toHaveLength(2);
      expect(images[0]).toMatchObject({
        url: 'https://example.com/coffee.jpg',
      });
      expect(variants).toHaveLength(1);
      expect(variants[0]).toMatchObject({ sku, name: '250G' });
    });

    it('POST /products responds 201 for a description over 255 characters', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Long Description E2E');
      const description = 'a'.repeat(300);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          description,
          images: validImages(),
          variants: [validVariant('SKU-DESC')],
        })
        .expect(201);

      const body = response.body as {
        data: { id: string; description: string };
      };
      createdProductIds.push(body.data.id);
      expect(body.data.description).toBe(description);
    });

    it('POST /products responds 409 for a duplicate name', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Duplicate Product E2E');

      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          images: validImages(),
          variants: [validVariant('SKU-DUP')],
        })
        .expect(409);

      const body = response.body as {
        errors: Array<{ errCode: string }>;
      };
      expect(body.errors[0].errCode).toBe(ERROR_CODES.PRODUCT.NAME_EXISTS);
    });

    it('POST /products responds 400 for two primary images', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Two Primary Images E2E'),
          ...requiredProductFields(),
          images: [
            { url: 'https://example.com/a.jpg', isPrimary: true },
            { url: 'https://example.com/b.jpg', isPrimary: true },
          ],
        })
        .expect(400);
    });

    it('rolls back the whole product when a later variant fails, leaving nothing persisted', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const existingSku = uniqueName('SKU-EXISTING');
      const existing = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Existing Product E2E'),
          ...requiredProductFields(),
          images: [],
          variants: [
            {
              sku: existingSku,
              weight: '250',
              unit: ProductUnit.G,
              price: '10',
            },
          ],
        }),
      );
      createdProductIds.push(existing.id);

      const name = uniqueName('Rolled Back Product E2E');
      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          images: validImages(),
          variants: [
            {
              sku: uniqueName('SKU-NEW'),
              weight: 100,
              unit: ProductUnit.G,
              price: 5,
            },
            // Duplicates the pre-existing SKU above — fails after the first
            // variant (and the product row) were already written in this
            // same request, which must roll back atomically.
            { sku: existingSku, weight: 100, unit: ProductUnit.G, price: 5 },
          ],
        })
        .expect(409);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ search: name })
        .expect(200);

      const body = response.body as { meta: { totalCount: number } };
      expect(body.meta.totalCount).toBe(0);
    });

    it('POST /products responds 400 when a variant price exceeds the column precision', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Out Of Range Price E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [
            {
              sku: uniqueName('SKU-OOR'),
              weight: 1,
              unit: ProductUnit.G,
              price: 999999999,
            },
          ],
        })
        .expect(400);
    });

    it('POST /products responds 400 maxPercentDiscountValue for PERCENT 100', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Percent Discount E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [
            {
              sku: uniqueName('SKU-PCT'),
              weight: 1,
              unit: ProductUnit.G,
              price: 10,
              discountType: DiscountType.PERCENT,
              discountValue: 100,
            },
          ],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        message: 'Validation failed',
        errors: [
          {
            errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
            field: 'variants.0.discountValue',
            message:
              'DiscountValue must be less than 100 when DiscountType is PERCENT',
          },
        ],
      });
    });

    it('POST /products responds 400 maxPercentDiscountValue for a value of 150 without a type', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Untyped Discount E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [{ ...validVariant('SKU-UNTYPED'), discountValue: 150 }],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        errors: [
          {
            errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
            field: 'variants.0.discountValue',
          },
        ],
      });
    });

    it('POST /products responds 400 maxFixedDiscountValue for price 120 with FIXED 150', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const name = uniqueName('Fixed Above Price E2E');

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name,
          ...requiredProductFields(),
          images: validImages(),
          variants: [
            {
              ...validVariant('SKU-FIX-ABOVE'),
              price: 120,
              discountType: DiscountType.FIXED,
              discountValue: 150,
            },
          ],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        message: 'Validation failed',
        errors: [
          {
            errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
            field: 'variants.0.discountValue',
            message: 'Fixed discount must be less than base price',
          },
        ],
      });

      const list = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products`)
        .query({ search: name })
        .expect(200);
      expect((list.body as { data: unknown[] }).data).toHaveLength(0);
    });

    it('POST /products without a discount stores PERCENT 0', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('No Discount E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [validVariant('SKU-NODISC')],
        })
        .expect(201);

      const body = response.body as {
        data: { id: string; variants: Array<{ id: string }> };
      };
      createdProductIds.push(body.data.id);
      const stored = await orm.em
        .fork()
        .findOneOrFail(ProductVariant, { id: body.data.variants[0].id });
      expect(stored.discountType).toBe(DiscountType.PERCENT);
      expect(Number(stored.discountValue)).toBe(0);
    });

    it('POST /products responds 201 for a FIXED discount above 100 below the price', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Fixed Discount E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [
            {
              sku: uniqueName('SKU-FIX'),
              weight: 1,
              unit: ProductUnit.G,
              price: 600,
              discountType: DiscountType.FIXED,
              discountValue: 500,
            },
          ],
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdProductIds.push(body.data.id);
    });

    it('PATCH /products/:id responds 400 duplicateProductVariantIds for the same variant id twice', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);
      const variantId = '7d5b1c1e-1d2f-4c6a-9b1e-2f3a4b5c6d7e';

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/products/7d5b1c1e-1d2f-4c6a-9b1e-2f3a4b5c6d70`)
        .send({
          updateVariants: [
            { id: variantId, price: 10 },
            { id: variantId, quantity: 1 },
          ],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        errors: [
          {
            errCode: ERROR_CODES.PRODUCT_VARIANT.DUPLICATE_IDS,
            field: 'updateVariants',
          },
        ],
      });
    });

    it('POST /products responds 400 when an image sortOrder exceeds the max bound', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Huge Sort Order E2E'),
          ...requiredProductFields(),
          images: [
            {
              url: 'https://example.com/a.jpg',
              sortOrder: 1000000,
              isPrimary: true,
            },
            { url: 'https://example.com/b.jpg' },
          ],
          variants: [validVariant('SKU-SORT')],
        })
        .expect(400);
    });

    it('POST /products responds 201 for an image url over 255 characters', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const longUrl = `https://example.com/${'a'.repeat(280)}.jpg`;

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: category.id,
          name: uniqueName('Long Image Url E2E'),
          ...requiredProductFields(),
          images: [
            { url: longUrl, isPrimary: true },
            { url: 'https://example.com/short.jpg' },
          ],
          variants: [validVariant('SKU-URL')],
        })
        .expect(201);

      const body = response.body as { data: { id: string } };
      createdProductIds.push(body.data.id);

      const images = await RequestContext.create(orm.em, () =>
        productImageService.findAllByProduct(body.data.id),
      );
      expect(images[0]).toMatchObject({ url: longUrl });
    });

    it('POST /products responds 404 for a nonexistent category', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: '00000000-0000-0000-0000-000000000000',
          name: uniqueName('No Category Product E2E'),
          ...requiredProductFields(),
          images: validImages(),
          variants: [validVariant('SKU-CAT')],
        })
        .expect(404);
    });

    it('POST /products responds 400 with field-level errors for an invalid body', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/products`)
        .set('Idempotency-Key', randomUUID())
        .send({
          categoryId: 'not-a-uuid',
          name: 'x',
          ...requiredProductFields(),
          images: validImages(),
          variants: [{ sku: 'A', weight: 0, unit: 'KG', price: 1 }],
        })
        .expect(400);

      const body = response.body as {
        statusCode: number;
        errors: Array<{ errCode: string; field: string }>;
      };
      expect(body.statusCode).toBe(400);
      expect(body.errors.map(({ errCode, field }) => [errCode, field])).toEqual(
        [
          ['isUuid', 'categoryId'],
          ['minLength', 'name'],
          ['min', 'variants.0.weight'],
        ],
      );
    });

    describe('PATCH /products/:id updateVariants', () => {
      const patch = async (productId: string, body: object) => {
        const admin = await createTestUser(UserRole.ADMIN);
        mockSessionFor(admin.clerkId);
        return request(app.getHttpServer())
          .patch(`${API_BASE_PATH}/products/${productId}`)
          .send(body);
      };

      it("PATCH /products/:id updates the first variant's price and GET returns it", async () => {
        const { productId, variantId } = await createPricedProduct();

        await patch(productId, {
          updateVariants: [{ id: variantId, price: 120 }],
        }).then((response) => expect(response.status).toBe(200));

        mockSessionFor(null);
        expect((await getVariants(productId))[0]).toMatchObject({
          id: variantId,
          price: 120,
        });
      });

      it('PATCH /products/:id with only quantity keeps price and discount', async () => {
        const { productId, variantId } = await createPricedProduct();

        await patch(productId, {
          updateVariants: [{ id: variantId, quantity: 50 }],
        }).then((response) => expect(response.status).toBe(200));

        expect((await getVariants(productId))[0]).toMatchObject({
          price: 100,
          discountType: DiscountType.PERCENT,
          discountValue: 10,
          quantity: 50,
        });
      });

      it('PATCH /products/:id responds 400 maxFixedDiscountValue for FIXED 150 on a price of 120', async () => {
        const { productId, variantId } = await createPricedProduct({
          price: '120',
        });

        const response = await patch(productId, {
          name: uniqueName('Should Not Rename'),
          updateVariants: [
            {
              id: variantId,
              discountType: DiscountType.FIXED,
              discountValue: 150,
            },
          ],
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          message: 'Validation failed',
          errors: [
            {
              errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
              field: 'updateVariants.0.discountValue',
              message: 'Fixed discount must be less than base price',
            },
          ],
        });
        const product = await request(app.getHttpServer())
          .get(`${API_BASE_PATH}/products/${productId}`)
          .expect(200);
        const body = product.body as {
          data: { name: string; variants: VariantBody[] };
        };
        expect(body.data.name).not.toMatch(/^Should Not Rename/);
        expect(body.data.variants[0]).toMatchObject({
          price: 120,
          discountType: DiscountType.PERCENT,
          discountValue: 10,
        });
      });

      it('PATCH /products/:id responds 400 maxPercentDiscountValue for PERCENT 100', async () => {
        const { productId, variantId } = await createPricedProduct();

        const response = await patch(productId, {
          updateVariants: [
            {
              id: variantId,
              discountType: DiscountType.PERCENT,
              discountValue: 100,
            },
          ],
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          errors: [
            {
              errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
              field: 'updateVariants.0.discountValue',
              message:
                'DiscountValue must be less than 100 when DiscountType is PERCENT',
            },
          ],
        });
        expect((await getVariants(productId))[0].discountValue).toBe(10);
      });

      it("PATCH /products/:id responds 404 productVariantNotFound for another product's variant", async () => {
        const { productId } = await createPricedProduct();
        const other = await createPricedProduct();

        const response = await patch(productId, {
          updateVariants: [{ id: other.variantId, price: 90 }],
        });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          message: 'Item not found',
          errors: [
            {
              errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
              message: 'Product variant not found',
            },
          ],
        });
        expect((await getVariants(other.productId))[0].price).toBe(100);
      });

      it('PATCH /products/:id responds 400 on updateVariants.0.discountType for null', async () => {
        const { productId, variantId } = await createPricedProduct();

        const response = await patch(productId, {
          updateVariants: [{ id: variantId, discountType: null }],
        });

        expect(response.status).toBe(400);
        expect(
          (response.body as { errors: Array<{ field: string }> }).errors.map(
            (error) => error.field,
          ),
        ).toEqual(['updateVariants.0.discountType']);
        expect((await getVariants(productId))[0].discountType).toBe(
          DiscountType.PERCENT,
        );
      });

      it('PATCH /products/:id responds 400 on updateVariants.0.discountValue for null', async () => {
        const { productId, variantId } = await createPricedProduct();

        const response = await patch(productId, {
          updateVariants: [{ id: variantId, discountValue: null }],
        });

        expect(response.status).toBe(400);
        expect(
          (response.body as { errors: Array<{ field: string }> }).errors.map(
            (error) => error.field,
          ),
        ).toEqual(['updateVariants.0.discountValue']);
        expect((await getVariants(productId))[0].discountValue).toBe(10);
      });

      it('PATCH /products/:id updates the second variant only', async () => {
        const { productId, variantId } = await createPricedProduct();
        const second = await RequestContext.create(orm.em, () =>
          productVariantService.create({
            productId,
            sku: uniqueName('SKU-SECOND'),
            weight: '500',
            unit: ProductUnit.G,
            price: '200',
          }),
        );

        await patch(productId, {
          updateVariants: [{ id: second.id, price: 90 }],
        }).then((response) => expect(response.status).toBe(200));

        const variants = await getVariants(productId);
        expect(variants.find((v) => v.id === second.id)?.price).toBe(90);
        expect(variants.find((v) => v.id === variantId)?.price).toBe(100);
      });
    });

    it('PATCH /products/:id responds 200 and updates the product', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Kenya AA E2E'),
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);
      const newName = uniqueName('Kenya AA Renamed E2E');

      const response = await request(app.getHttpServer())
        .patch(`${API_BASE_PATH}/products/${product.id}`)
        .send({ name: newName })
        .expect(200);

      const body = response.body as { data: unknown };
      expect(body.data).toMatchObject({
        name: newName,
        slug: slugFrom(newName),
      });
    });

    it('DELETE /products/:id responds 204 and soft-deletes the product', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      mockSessionFor(admin.clerkId);
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Sumatra Mandheling E2E'),
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);

      await request(app.getHttpServer())
        .delete(`${API_BASE_PATH}/products/${product.id}`)
        .expect(204);

      mockSessionFor(null);
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${product.id}`)
        .expect(404);
    });

    it('GET /products includes soft-deleted rows for an ADMIN caller', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Deleted Visible Product E2E'),
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);
      await RequestContext.create(orm.em, () =>
        productService.remove(product.id),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(
          `${API_BASE_PATH}/products?search=${encodeURIComponent(product.name)}`,
        )
        .expect(200);

      const body = response.body as { data: Array<{ id: string }> };
      const ids = body.data.map((p) => p.id);
      expect(ids).toContain(product.id);
    });

    it('GET /products/:id returns a soft-deleted product for an ADMIN caller', async () => {
      const admin = await createTestUser(UserRole.ADMIN);
      const category = await createTestCategory();
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: uniqueName('Deleted By Id Product E2E'),
          ...requiredProductFields(),
          images: [],
          variants: [],
        }),
      );
      createdProductIds.push(product.id);
      await RequestContext.create(orm.em, () =>
        productService.remove(product.id),
      );
      mockSessionFor(admin.clerkId);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${product.id}`)
        .expect(200);

      const body = response.body as { data: { id: string } };
      expect(body.data.id).toBe(product.id);
    });
  });

  describe('visibility by caller', () => {
    let category: Category;
    let pActive: Product;
    let pDraft: Product;
    let pInactive: Product;
    let pArchived: Product;
    let pDeleted: Product;
    let customer: User;
    let inactiveAdmin: User;
    let activeAdmin: User;
    const namePart = uniqueName('Visibility');

    const createWithStatus = async (
      label: string,
      status: ProductStatus,
      quantity = 0,
    ): Promise<Product> => {
      const product = await RequestContext.create(orm.em, () =>
        productService.create({
          categoryId: category.id,
          name: `${namePart} ${label}`,
          status,
          ...requiredProductFields(),
          images: [],
          variants: [{ ...validVariant(`SKU-VIS-${label}`), quantity }],
        }),
      );
      createdProductIds.push(product.id);
      return product;
    };

    const listIds = async (query = ''): Promise<string[]> => {
      const response = await request(app.getHttpServer())
        .get(
          `${API_BASE_PATH}/products?categoryId=${category.id}&limit=50${query}`,
        )
        .expect(200);
      return (response.body as { data: Array<{ id: string }> }).data.map(
        (p) => p.id,
      );
    };

    beforeAll(async () => {
      category = await createTestCategory();
      pActive = await createWithStatus('A', ProductStatus.ACTIVE, 37);
      pDraft = await createWithStatus('B', ProductStatus.DRAFT);
      pInactive = await createWithStatus('C', ProductStatus.INACTIVE);
      pArchived = await createWithStatus('D', ProductStatus.ARCHIVED);
      pDeleted = await createWithStatus('E', ProductStatus.ACTIVE);
      await RequestContext.create(orm.em, () =>
        productService.remove(pDeleted.id),
      );
      customer = await createTestUser(UserRole.USER);
      inactiveAdmin = await createTestUser(UserRole.ADMIN, UserStatus.INACTIVE);
      activeAdmin = await createTestUser(UserRole.ADMIN);
    });

    it('lists only the Active product for a visitor', async () => {
      mockSessionFor(null);
      expect(await listIds()).toEqual([pActive.id]);
    });

    it('lists only the Active product for a visitor asking for DRAFT', async () => {
      mockSessionFor(null);
      expect(
        await listIds(
          `&status=${ProductStatus.DRAFT}&search=${encodeURIComponent(namePart)}`,
        ),
      ).toEqual([pActive.id]);
    });

    it('lists only the Active product for a signed-in customer', async () => {
      mockSessionFor(customer.clerkId);
      expect(await listIds()).toEqual([pActive.id]);
    });

    it('lists only the Active product for an inactive admin', async () => {
      mockSessionFor(inactiveAdmin.clerkId);
      expect(await listIds()).toEqual([pActive.id]);
    });

    it('lists every status for an active admin, and only B for DRAFT', async () => {
      mockSessionFor(activeAdmin.clerkId);

      expect(await listIds()).toEqual(
        expect.arrayContaining([
          pActive.id,
          pDraft.id,
          pInactive.id,
          pArchived.id,
          pDeleted.id,
        ]),
      );
      expect(await listIds(`&status=${ProductStatus.DRAFT}`)).toEqual([
        pDraft.id,
      ]);
    });

    it('answers 404 to a visitor reading the Draft product', async () => {
      mockSessionFor(null);
      const missing = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/00000000-0000-4000-8000-000000000000`)
        .expect(404);

      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${pDraft.id}`)
        .expect(404);

      expect((response.body as { errors: unknown }).errors).toEqual(
        (missing.body as { errors: unknown }).errors,
      );
    });

    it('answers 404 to a visitor reading the deleted product', async () => {
      mockSessionFor(null);
      await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${pDeleted.id}`)
        .expect(404);
    });

    it('lists and reads the deleted product for an active admin, with deletedAt', async () => {
      mockSessionFor(activeAdmin.clerkId);

      const list = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products?categoryId=${category.id}&limit=50`)
        .expect(200);
      const listed = (
        list.body as { data: Array<{ id: string; deletedAt: string | null }> }
      ).data.find((p) => p.id === pDeleted.id);
      expect(listed?.deletedAt).not.toBeNull();

      const read = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${pDeleted.id}`)
        .expect(200);
      expect(
        (read.body as { data: { deletedAt: string | null } }).data.deletedAt,
      ).not.toBeNull();
    });

    it('returns the exact variant quantity to a visitor', async () => {
      mockSessionFor(null);
      const response = await request(app.getHttpServer())
        .get(`${API_BASE_PATH}/products/${pActive.id}`)
        .expect(200);
      expect(
        (response.body as { data: { variants: Array<{ quantity: number }> } })
          .data.variants[0].quantity,
      ).toBe(37);
    });
  });
});
