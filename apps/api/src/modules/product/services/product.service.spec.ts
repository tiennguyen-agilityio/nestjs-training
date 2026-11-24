import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service.js';
import { Product } from '../entities/product.entity.js';
import { ProductImage } from '../../product-image/entities/product-image.entity.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { ProductRepository } from '../repositories/product.repository.js';
import { CategoryService } from '../../category/services/category.service.js';
import { ProductImageService } from '../../product-image/services/product-image.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import {
  DiscountType,
  ProductUnit,
  ProductStatus,
  RoastLevel,
} from '@repo/constants';
import type { CreateProductInput } from '../dto/product.schema.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../../../common/constants/message.constant.js';

import type { Mock } from 'vitest';
describe('ProductService', () => {
  let service: ProductService;
  let productRepository: {
    findById: Mock;
    findByName: Mock;
    findAll: Mock;
    create: Mock;
    save: Mock;
    softDelete: Mock;
    transactional: Mock;
  };
  let categoryService: { findOne: Mock };
  let productImageService: { create: Mock };
  let productVariantService: { create: Mock };

  const buildProduct = (overrides: Partial<Product> = {}): Product =>
    ({
      id: 'product-id-1',
      category: { id: 'category-id-1' },
      name: 'Espresso Blend',
      slug: 'espresso-blend',
      description: null,
      roastLevel: null,
      isOrganic: false,
      isFairTrade: false,
      status: 'DRAFT',
      tastingNotes: null,
      origin: null,
      processingMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as Product;

  beforeEach(async () => {
    productRepository = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      transactional: vi.fn((callback: () => Promise<unknown>) => callback()),
    };
    categoryService = { findOne: vi.fn() };
    productImageService = { create: vi.fn() };
    productVariantService = { create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: productRepository },
        { provide: CategoryService, useValue: categoryService },
        { provide: ProductImageService, useValue: productImageService },
        { provide: ProductVariantService, useValue: productVariantService },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createData: CreateProductInput = {
    categoryId: 'category-id-1',
    name: 'Espresso Blend',
    roastLevel: RoastLevel.MEDIUM,
    description: 'A balanced, well-rounded coffee.',
    origin: 'Ethiopia',
    processingMethod: 'Washed',
    images: [],
    variants: [],
  };

  describe('create', () => {
    it('creates and returns a product with a slug derived from the name', async () => {
      productRepository.findByName.mockResolvedValue(null);
      categoryService.findOne.mockResolvedValue({ id: 'category-id-1' });
      const created = buildProduct();
      productRepository.create.mockResolvedValue(created);

      const result = await service.create(createData);

      expect(categoryService.findOne).toHaveBeenCalledWith('category-id-1');
      expect(productRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Espresso Blend',
          slug: 'espresso-blend',
        }),
      );
      expect(result).toBe(created);
    });

    it('creates the supplied images and variants against the new product id, then re-fetches the populated product', async () => {
      productRepository.findByName.mockResolvedValue(null);
      categoryService.findOne.mockResolvedValue({ id: 'category-id-1' });
      const created = buildProduct();
      const refetched = buildProduct();
      productRepository.create.mockResolvedValue(created);
      productRepository.findById.mockResolvedValue(refetched);

      const result = await service.create({
        ...createData,
        images: [{ url: 'https://example.com/a.jpg', isPrimary: true }],
        variants: [
          {
            sku: 'SKU-1',
            weight: '250.000',
            unit: ProductUnit.G,
            price: '10.00',
          },
        ],
      });

      expect(productImageService.create).toHaveBeenCalledWith({
        productId: 'product-id-1',
        url: 'https://example.com/a.jpg',
        isPrimary: true,
      });
      expect(productVariantService.create).toHaveBeenCalledWith({
        productId: 'product-id-1',
        sku: 'SKU-1',
        weight: '250.000',
        unit: ProductUnit.G,
        price: '10.00',
      });
      expect(productRepository.findById).toHaveBeenCalledWith(
        'product-id-1',
        {},
      );
      expect(result).toBe(refetched);
    });

    it('rejects two added images without sortOrder, without persisting', async () => {
      await expect(
        service.create({
          ...createData,
          images: [
            { url: 'https://example.com/a.jpg', isPrimary: true },
            { url: 'https://example.com/b.jpg' },
          ],
        }),
      ).rejects.toThrow(ERROR_MESSAGES.PRODUCT.DUPLICATE_SORT_ORDERS);
      expect(productRepository.create).not.toHaveBeenCalled();
      expect(productImageService.create).not.toHaveBeenCalled();
    });

    it('rejects more than one primary image, without checking the name or persisting', async () => {
      await expect(
        service.create({
          ...createData,
          images: [
            { url: 'https://example.com/a.jpg', isPrimary: true },
            { url: 'https://example.com/b.jpg', isPrimary: true },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(productRepository.findByName).not.toHaveBeenCalled();
      expect(productRepository.create).not.toHaveBeenCalled();
      expect(productImageService.create).not.toHaveBeenCalled();
    });

    it('allows a single primary image on create', async () => {
      productRepository.findByName.mockResolvedValue(null);
      categoryService.findOne.mockResolvedValue({ id: 'category-id-1' });
      const created = buildProduct();
      const refetched = buildProduct();
      productRepository.create.mockResolvedValue(created);
      productRepository.findById.mockResolvedValue(refetched);

      await service.create({
        ...createData,
        images: [{ url: 'https://example.com/a.jpg', isPrimary: true }],
      });

      expect(productImageService.create).toHaveBeenCalledWith({
        productId: 'product-id-1',
        url: 'https://example.com/a.jpg',
        isPrimary: true,
      });
    });

    it('does not re-fetch the product when no images or variants are supplied', async () => {
      productRepository.findByName.mockResolvedValue(null);
      categoryService.findOne.mockResolvedValue({ id: 'category-id-1' });
      const created = buildProduct();
      productRepository.create.mockResolvedValue(created);

      const result = await service.create(createData);

      expect(productRepository.findById).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });

    it('throws DuplicateResourceException on a duplicate name, without persisting or calling image/variant services', async () => {
      productRepository.findByName.mockResolvedValue(buildProduct());
      expect.assertions(5);

      try {
        await service.create(createData);
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateResourceException);
        expect(
          (error as DuplicateResourceException).getErrors()[0].errCode,
        ).toBe(ERROR_CODES.PRODUCT.NAME_EXISTS);
      }
      expect(productRepository.create).not.toHaveBeenCalled();
      expect(productImageService.create).not.toHaveBeenCalled();
      expect(productVariantService.create).not.toHaveBeenCalled();
    });

    it('propagates an ItemNotFoundException from CategoryService.findOne for an invalid category, without persisting', async () => {
      productRepository.findByName.mockResolvedValue(null);
      categoryService.findOne.mockRejectedValue(
        new ItemNotFoundException({
          errCode: ERROR_CODES.CATEGORY.NOT_FOUND,
          field: 'id',
          message: ERROR_MESSAGES.CATEGORY.NOT_FOUND,
          description: ERROR_DESCRIPTIONS.CATEGORY.NOT_FOUND,
        }),
      );

      await expect(service.create(createData)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('forwards the query to the repository and returns its result, unmodified', async () => {
      const paginated = {
        data: [buildProduct()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      productRepository.findAll.mockResolvedValue(paginated);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(productRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        {},
        undefined,
      );
      expect(result).toBe(paginated);
    });

    it('forwards supplied filters to the repository', async () => {
      const paginated = {
        data: [buildProduct()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      productRepository.findAll.mockResolvedValue(paginated);
      const filters = { categoryId: 'category-id-1' };

      await service.findAll({ page: 1, limit: 10 }, filters);

      expect(productRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        filters,
        undefined,
      );
    });

    it('forwards includeDeleted options to the repository', async () => {
      const paginated = {
        data: [buildProduct()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      productRepository.findAll.mockResolvedValue(paginated);

      await service.findAll(
        { page: 1, limit: 10 },
        {},
        { includeDeleted: true },
      );

      expect(productRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        {},
        { includeDeleted: true },
      );
    });
  });

  describe('findOne', () => {
    it('returns an existing product', async () => {
      const product = buildProduct();
      productRepository.findById.mockResolvedValue(product);

      const result = await service.findOne('product-id-1');

      expect(result).toBe(product);
    });

    it('throws ItemNotFoundException when the repository has no match', async () => {
      productRepository.findById.mockResolvedValue(null);
      expect.assertions(2);

      try {
        await service.findOne('missing-id');
      } catch (error) {
        expect(error).toBeInstanceOf(ItemNotFoundException);
        expect((error as ItemNotFoundException).getErrors()[0].errCode).toBe(
          ERROR_CODES.PRODUCT.NOT_FOUND,
        );
      }
    });

    it('throws ItemNotFoundException for a DRAFT product when activeOnly', async () => {
      productRepository.findById.mockResolvedValue(
        buildProduct({ status: ProductStatus.DRAFT }),
      );
      expect.assertions(2);

      try {
        await service.findOne('product-id-1', { activeOnly: true });
      } catch (error) {
        expect(error).toBeInstanceOf(ItemNotFoundException);
        expect((error as ItemNotFoundException).getErrors()[0]).toMatchObject({
          errCode: ERROR_CODES.PRODUCT.NOT_FOUND,
          field: 'id',
        });
      }
    });

    it('returns an ACTIVE product when activeOnly', async () => {
      const product = buildProduct({ status: ProductStatus.ACTIVE });
      productRepository.findById.mockResolvedValue(product);

      const result = await service.findOne('product-id-1', {
        activeOnly: true,
      });

      expect(result).toBe(product);
    });

    it('returns a DRAFT product when activeOnly is not set', async () => {
      const product = buildProduct({ status: ProductStatus.DRAFT });
      productRepository.findById.mockResolvedValue(product);

      const result = await service.findOne('product-id-1');

      expect(result).toBe(product);
    });

    it('does not pass activeOnly to the repository', async () => {
      productRepository.findById.mockResolvedValue(
        buildProduct({ status: ProductStatus.ACTIVE }),
      );

      await service.findOne('product-id-1', {
        includeDeleted: false,
        activeOnly: true,
      });

      expect(productRepository.findById).toHaveBeenCalledWith('product-id-1', {
        includeDeleted: false,
      });
    });
  });

  describe('update', () => {
    it('does not re-check name uniqueness or re-validate the category when those fields are unchanged', async () => {
      const product = buildProduct();
      productRepository.findById.mockResolvedValue(product);

      await service.update('product-id-1', { description: 'Updated' });

      expect(productRepository.findByName).not.toHaveBeenCalled();
      expect(categoryService.findOne).not.toHaveBeenCalled();
      expect(productRepository.save).toHaveBeenCalledWith(product);
    });

    it('throws DuplicateResourceException when the new name collides with another product', async () => {
      const product = buildProduct();
      productRepository.findById.mockResolvedValue(product);
      productRepository.findByName.mockResolvedValue(
        buildProduct({ id: 'other-product-id', name: 'Other' }),
      );
      expect.assertions(3);

      try {
        await service.update('product-id-1', { name: 'Other' });
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateResourceException);
        expect(
          (error as DuplicateResourceException).getErrors()[0].errCode,
        ).toBe(ERROR_CODES.PRODUCT.NAME_EXISTS);
      }
      expect(productRepository.save).not.toHaveBeenCalled();
    });

    it('does not throw when the colliding row is the product being updated itself', async () => {
      const product = buildProduct();
      productRepository.findById.mockResolvedValue(product);
      productRepository.findByName.mockResolvedValue(product);

      const result = await service.update('product-id-1', {
        name: 'Espresso Blend Reserve',
      });

      expect(productRepository.findByName).toHaveBeenCalledWith(
        'Espresso Blend Reserve',
        { includeDeleted: true },
      );
      expect(result).toBe(product);
      expect(productRepository.save).toHaveBeenCalledWith(product);
    });

    it('re-validates the category via CategoryService.findOne when categoryId changes, and assigns the loaded category', async () => {
      const product = buildProduct();
      const loadedCategory = { id: 'category-id-2' };
      productRepository.findById.mockResolvedValue(product);
      categoryService.findOne.mockResolvedValue(loadedCategory);

      await service.update('product-id-1', { categoryId: 'category-id-2' });

      expect(categoryService.findOne).toHaveBeenCalledWith('category-id-2');
      expect(product.category).toBe(loadedCategory);
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { description: 'x' }),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(productRepository.save).not.toHaveBeenCalled();
    });

    describe('images', () => {
      const idA = '11111111-1111-4111-8111-111111111111';
      const idB = '22222222-2222-4222-8222-222222222222';
      const idC = '33333333-3333-4333-8333-333333333333';

      const buildImage = (
        id: string,
        overrides: Partial<ProductImage> = {},
      ): ProductImage =>
        ({
          id,
          url: `https://example.com/${id}.png`,
          isPrimary: false,
          sortOrder: 0,
          deletedAt: null,
          ...overrides,
        }) as ProductImage;

      const productWithImages = (images: ProductImage[]) => {
        const add = vi.fn((image: ProductImage) => images.push(image));
        const product = buildProduct({
          images: { getItems: () => images, add } as never,
        });
        productRepository.findById.mockResolvedValue(product);
        return { product, images, add };
      };

      it('soft-deletes the removed images, clears their sortOrder and saves once', async () => {
        const { images } = productWithImages([
          buildImage(idA, { sortOrder: 0 }),
          buildImage(idB, { isPrimary: true, sortOrder: 1 }),
        ]);

        await service.update('product-id-1', { removeImageIds: [idA] });

        expect(images[0].deletedAt).toBeInstanceOf(Date);
        expect(images[0].sortOrder).toBeNull();
        expect(images[1].deletedAt).toBeNull();
        expect(images[1].sortOrder).toBe(1);
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('rejects two added images without sortOrder', async () => {
        const { add } = productWithImages([]);

        await expect(
          service.update('product-id-1', {
            addImages: [
              { url: 'https://example.com/a.png', isPrimary: true },
              { url: 'https://example.com/b.png' },
            ],
          }),
        ).rejects.toThrow(ERROR_MESSAGES.PRODUCT.DUPLICATE_SORT_ORDERS);
        expect(add).not.toHaveBeenCalled();
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('rejects an added image without sortOrder when a remaining image is at 0', async () => {
        const { add } = productWithImages([
          buildImage(idA, { isPrimary: true, sortOrder: 0 }),
        ]);

        await expect(
          service.update('product-id-1', {
            addImages: [{ url: 'https://example.com/added.png' }],
          }),
        ).rejects.toThrow(ERROR_MESSAGES.PRODUCT.DUPLICATE_SORT_ORDERS);
        expect(add).not.toHaveBeenCalled();
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('patches only the supplied fields of an image', async () => {
        const { images } = productWithImages([
          buildImage(idA, { sortOrder: 3 }),
          buildImage(idB, { isPrimary: true }),
        ]);

        await service.update('product-id-1', {
          updateImages: [{ id: idA, url: 'https://example.com/new.png' }],
        });

        expect(images[0]).toMatchObject({
          url: 'https://example.com/new.png',
          isPrimary: false,
          sortOrder: 3,
        });
        expect(images[1].url).toBe(`https://example.com/${idB}.png`);
      });

      it('patches the sortOrder field when supplied', async () => {
        const { images } = productWithImages([
          buildImage(idA, { sortOrder: 0 }),
          buildImage(idB, { isPrimary: true }),
        ]);

        await service.update('product-id-1', {
          updateImages: [{ id: idA, sortOrder: 5 }],
        });

        expect(images[0].sortOrder).toBe(5);
      });

      it('adds new images to the product with defaults', async () => {
        const { product, add } = productWithImages([
          buildImage(idA, { isPrimary: true, sortOrder: 1 }),
        ]);

        await service.update('product-id-1', {
          addImages: [{ url: 'https://example.com/added.png' }],
        });

        expect(add).toHaveBeenCalledTimes(1);
        expect(add.mock.calls[0][0]).toMatchObject({
          product,
          url: 'https://example.com/added.png',
          isPrimary: false,
          sortOrder: 0,
        });
      });

      it('applies remove, update and add together', async () => {
        const { images, add } = productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB, { sortOrder: 1 }),
        ]);

        await service.update('product-id-1', {
          removeImageIds: [idA],
          updateImages: [{ id: idB, isPrimary: true }],
          addImages: [{ url: 'https://example.com/added.png' }],
        });

        expect(images[0].deletedAt).toBeInstanceOf(Date);
        expect(images[1].isPrimary).toBe(true);
        expect(add).toHaveBeenCalledTimes(1);
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('rejects removing an image that does not belong to the product', async () => {
        const { images } = productWithImages([buildImage(idA)]);

        await expect(
          service.update('product-id-1', { removeImageIds: [idA, idC] }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(images[0].deletedAt).toBeNull();
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('rejects updating an image that is removed in the same request', async () => {
        productWithImages([buildImage(idA)]);

        await expect(
          service.update('product-id-1', {
            removeImageIds: [idA],
            updateImages: [{ id: idA, sortOrder: 1 }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('ignores images that are already soft-deleted', async () => {
        productWithImages([buildImage(idA, { deletedAt: new Date() })]);

        await expect(
          service.update('product-id-1', { removeImageIds: [idA] }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('allows exactly the maximum number of images', async () => {
        const existing = Array.from({ length: 5 }, (_, i) =>
          buildImage(`00000000-0000-4000-8000-00000000000${i}`, {
            isPrimary: i === 0,
            sortOrder: i,
          }),
        );
        productWithImages(existing);

        await service.update('product-id-1', {
          addImages: [{ url: 'https://example.com/sixth.png', sortOrder: 5 }],
        });

        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('rejects more than the maximum number of images, counting removals', async () => {
        // existing[0] is non-primary (will be removed later); existing[1] is primary
        const existing = Array.from({ length: 6 }, (_, i) =>
          buildImage(`00000000-0000-4000-8000-00000000000${i}`, {
            isPrimary: i === 1,
            sortOrder: i,
          }),
        );
        const { add } = productWithImages(existing);

        await expect(
          service.update('product-id-1', {
            addImages: [{ url: 'https://example.com/seventh.png' }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(add).not.toHaveBeenCalled();
        expect(productRepository.save).not.toHaveBeenCalled();

        await service.update('product-id-1', {
          removeImageIds: [existing[0].id],
          addImages: [{ url: 'https://example.com/seventh.png' }],
        });
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('rejects a second primary image, from a patch or from an added image', async () => {
        productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB),
        ]);

        await expect(
          service.update('product-id-1', {
            updateImages: [{ id: idB, isPrimary: true }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          service.update('product-id-1', {
            addImages: [{ url: 'https://example.com/x.png', isPrimary: true }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('allows moving the primary flag to another image', async () => {
        const { images } = productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB, { sortOrder: 1 }),
        ]);

        await service.update('product-id-1', {
          updateImages: [
            { id: idA, isPrimary: false },
            { id: idB, isPrimary: true },
          ],
        });

        expect(images.map((image) => image.isPrimary)).toEqual([false, true]);
      });

      it('rejects removing the primary image when another image remains but has no primary', async () => {
        // idA is primary, idB is not — removing idA leaves idB with no primary
        productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB),
        ]);

        await expect(
          service.update('product-id-1', { removeImageIds: [idA] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('rejects a patch that demotes the only primary without promoting another', async () => {
        productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB),
        ]);

        await expect(
          service.update('product-id-1', {
            updateImages: [{ id: idA, isPrimary: false }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('allows removing the primary image when another is promoted via updateImages', async () => {
        const { images } = productWithImages([
          buildImage(idA, { isPrimary: true }),
          buildImage(idB),
        ]);

        await service.update('product-id-1', {
          removeImageIds: [idA],
          updateImages: [{ id: idB, isPrimary: true }],
        });

        expect(images[0].deletedAt).toBeInstanceOf(Date);
        expect(images[1].isPrimary).toBe(true);
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('allows removing the primary image when a new primary is added', async () => {
        const { images, add } = productWithImages([
          buildImage(idA, { isPrimary: true }),
        ]);

        await service.update('product-id-1', {
          removeImageIds: [idA],
          addImages: [{ url: 'https://example.com/new.png', isPrimary: true }],
        });

        expect(images[0].deletedAt).toBeInstanceOf(Date);
        expect(add).toHaveBeenCalledTimes(1);
        expect(add.mock.calls[0][0]).toMatchObject({ isPrimary: true });
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('does not touch the images when the request has no image changes', async () => {
        const { images, add } = productWithImages([buildImage(idA)]);

        await service.update('product-id-1', { description: 'Updated' });

        expect(add).not.toHaveBeenCalled();
        expect(images[0].deletedAt).toBeNull();
      });
    });

    describe('variants', () => {
      const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

      const buildVariant = (
        id: string,
        overrides: Partial<ProductVariant> = {},
      ): ProductVariant =>
        ({
          id,
          price: '100.00',
          discountType: DiscountType.PERCENT,
          discountValue: '10.00',
          quantity: 30,
          ...overrides,
        }) as ProductVariant;

      const productWithVariants = (variants: ProductVariant[]) => {
        const images: ProductImage[] = [];
        const product = buildProduct({
          images: { getItems: () => images, add: vi.fn() } as never,
          variants: { getItems: () => variants } as never,
        });
        productRepository.findById.mockResolvedValue(product);
        return { product, variants };
      };

      const rejection = async (
        promise: Promise<unknown>,
      ): Promise<ValidationException> => {
        const error = await promise.catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ValidationException);
        return error as ValidationException;
      };

      it('keeps price and discount on a quantity-only update', async () => {
        const { variants } = productWithVariants([buildVariant(idA)]);

        await service.update('product-id-1', {
          updateVariants: [{ id: idA, quantity: 50 }],
        });

        expect(variants[0]).toMatchObject({
          price: '100.00',
          discountType: DiscountType.PERCENT,
          discountValue: '10.00',
          quantity: 50,
        });
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });

      it('rejects a FIXED discount above the stored price without changing anything', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA, { price: '120.00' }),
        ]);

        const error = await rejection(
          service.update('product-id-1', {
            name: 'Renamed',
            updateVariants: [
              {
                id: idA,
                discountType: DiscountType.FIXED,
                discountValue: '150',
              },
            ],
          }),
        );

        expect(error.getStatus()).toBe(400);
        expect(error.getErrors()).toEqual([
          {
            errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
            field: 'updateVariants.0.discountValue',
            message: 'Fixed discount must be less than base price',
            description:
              ERROR_DESCRIPTIONS.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
          },
        ]);
        expect(productRepository.save).not.toHaveBeenCalled();
        expect(variants[0]).toMatchObject({
          price: '120.00',
          discountType: DiscountType.PERCENT,
          discountValue: '10.00',
        });
      });

      it('rejects a PERCENT discount of 100', async () => {
        productWithVariants([buildVariant(idA)]);

        const error = await rejection(
          service.update('product-id-1', {
            updateVariants: [
              {
                id: idA,
                discountType: DiscountType.PERCENT,
                discountValue: '100',
              },
            ],
          }),
        );

        expect(error.getErrors()[0]).toMatchObject({
          errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
          field: 'updateVariants.0.discountValue',
          message:
            'DiscountValue must be less than 100 when DiscountType is PERCENT',
          description:
            ERROR_DESCRIPTIONS.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
        });
      });

      it('rejects a price below the stored FIXED discount', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA, {
            price: '120.00',
            discountType: DiscountType.FIXED,
            discountValue: '50.00',
          }),
        ]);

        const error = await rejection(
          service.update('product-id-1', {
            updateVariants: [{ id: idA, price: '40' }],
          }),
        );

        expect(error.getErrors()[0]).toMatchObject({
          errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
          field: 'updateVariants.0.discountValue',
        });
        expect(variants[0].price).toBe('120.00');
      });

      it('rejects a quantity-only update while the stored FIXED discount exceeds the price', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA, {
            price: '120.00',
            discountType: DiscountType.FIXED,
            discountValue: '150.00',
          }),
        ]);

        const error = await rejection(
          service.update('product-id-1', {
            updateVariants: [{ id: idA, quantity: 50 }],
          }),
        );

        expect(error.getErrors()[0]).toMatchObject({
          errCode: ERROR_CODES.PRODUCT_VARIANT.MAX_FIXED_DISCOUNT_VALUE,
          field: 'updateVariants.0.discountValue',
        });
        expect(variants[0].quantity).toBe(30);
      });

      it('rejects a discount value of 150 on a stored PERCENT discount', async () => {
        productWithVariants([buildVariant(idA)]);

        const error = await rejection(
          service.update('product-id-1', {
            updateVariants: [{ id: idA, discountValue: '150' }],
          }),
        );

        expect(error.getErrors()[0].errCode).toBe(
          ERROR_CODES.PRODUCT_VARIANT.MAX_PERCENT_DISCOUNT_VALUE,
        );
      });

      it('stores PERCENT 0 when updating a variant stored with a null discount', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA, { discountType: null, discountValue: null }),
        ]);

        await service.update('product-id-1', {
          updateVariants: [{ id: idA, quantity: 50 }],
        });

        expect(variants[0]).toMatchObject({
          discountType: DiscountType.PERCENT,
          discountValue: '0',
          quantity: 50,
        });
      });

      it('stores FIXED 0', async () => {
        const { variants } = productWithVariants([buildVariant(idA)]);

        await service.update('product-id-1', {
          updateVariants: [
            { id: idA, discountType: DiscountType.FIXED, discountValue: '0' },
          ],
        });

        expect(variants[0]).toMatchObject({
          discountType: DiscountType.FIXED,
          discountValue: '0',
        });
      });

      it('updates a variant that is not first and leaves the others', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA),
          buildVariant(idB),
        ]);

        await service.update('product-id-1', {
          updateVariants: [{ id: idB, price: '90' }],
        });

        expect(variants[1].price).toBe('90');
        expect(variants[0].price).toBe('100.00');
      });

      it('throws productVariantNotFound for a variant of another product', async () => {
        productWithVariants([buildVariant(idA)]);

        const error = await service
          .update('product-id-1', {
            updateVariants: [{ id: otherId, price: '90' }],
          })
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ItemNotFoundException);
        expect((error as ItemNotFoundException).getErrors()[0]).toMatchObject({
          errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
          field: 'updateVariants.0.id',
          message: ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
        });
        expect(productRepository.save).not.toHaveBeenCalled();
      });

      it('accepts price and FIXED discount changed together', async () => {
        const { variants } = productWithVariants([
          buildVariant(idA, { price: '120.00' }),
        ]);

        await service.update('product-id-1', {
          updateVariants: [
            {
              id: idA,
              price: '200',
              discountType: DiscountType.FIXED,
              discountValue: '150',
            },
          ],
        });

        expect(variants[0]).toMatchObject({
          price: '200',
          discountType: DiscountType.FIXED,
          discountValue: '150',
        });
      });

      it('ignores an empty updateVariants', async () => {
        const { product, variants } = productWithVariants([buildVariant(idA)]);

        await service.update('product-id-1', {
          name: 'Renamed',
          updateVariants: [],
        });

        expect(product.name).toBe('Renamed');
        expect(variants[0]).toMatchObject({ price: '100.00', quantity: 30 });
        expect(productRepository.save).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('remove', () => {
    it('archives the status and soft-deletes the product, without calling image/variant services', async () => {
      const product = buildProduct();
      productRepository.findById.mockResolvedValue(product);

      await service.remove('product-id-1');

      expect(product.status).toBe(ProductStatus.ARCHIVED);
      expect(productRepository.softDelete).toHaveBeenCalledWith(product);
      expect(productImageService.create).not.toHaveBeenCalled();
      expect(productVariantService.create).not.toHaveBeenCalled();
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(productRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
