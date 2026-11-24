import { Test, TestingModule } from '@nestjs/testing';
import { ProductVariantService } from './product-variant.service.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { ProductVariantRepository } from '../repositories/product-variant.repository.js';
import { DiscountType, ProductStatus, ProductUnit } from '@repo/constants';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

import type { Mock } from 'vitest';
const ACTOR = 'admin-1';

describe('ProductVariantService', () => {
  let service: ProductVariantService;
  let productVariantRepository: {
    findById: Mock;
    findWithProduct: Mock;
    findManyWithProduct: Mock;
    reserve: Mock;
    reload: Mock;
    lockByIds: Mock;
    findBySku: Mock;
    findAllByProduct: Mock;
    create: Mock;
    save: Mock;
    softDelete: Mock;
  };

  const buildVariant = (
    overrides: Partial<ProductVariant> = {},
  ): ProductVariant =>
    ({
      id: 'variant-id-1',
      sku: 'SKU-1',
      size: '250.000',
      unit: ProductUnit.G,
      price: '10.00',
      discountType: null,
      discountValue: null,
      stockQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as ProductVariant;

  beforeEach(async () => {
    productVariantRepository = {
      findById: vi.fn(),
      findWithProduct: vi.fn(),
      findManyWithProduct: vi.fn(),
      reserve: vi.fn(),
      reload: vi.fn(),
      lockByIds: vi.fn(),
      findBySku: vi.fn(),
      findAllByProduct: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductVariantService,
        {
          provide: ProductVariantRepository,
          useValue: productVariantRepository,
        },
      ],
    }).compile();

    service = module.get(ProductVariantService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createData = {
    productId: 'product-id-1',
    sku: 'SKU-1',
    size: '250.000',
    unit: ProductUnit.G,
    price: '10.00',
    stockQuantity: 12,
  };

  describe('create', () => {
    it('creates and returns a variant on a unique SKU, passing size and stockQuantity and no name', async () => {
      productVariantRepository.findBySku.mockResolvedValue(null);
      const created = buildVariant();
      productVariantRepository.create.mockResolvedValue(created);

      const result = await service.create(createData, ACTOR);

      expect(productVariantRepository.findBySku).toHaveBeenCalledWith('SKU-1');
      expect(productVariantRepository.create).toHaveBeenCalledWith(
        {
          ...createData,
          discountType: DiscountType.PERCENT,
          discountValue: '0',
        },
        ACTOR,
      );
      expect(productVariantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ size: '250.000', stockQuantity: 12 }),
        ACTOR,
      );
      expect(
        productVariantRepository.create.mock.calls[0]?.[0],
      ).not.toHaveProperty('name');
      expect(result).toBe(created);
    });

    it('create stores PERCENT 0 when the discount is omitted', async () => {
      productVariantRepository.findBySku.mockResolvedValue(null);
      productVariantRepository.create.mockResolvedValue(buildVariant());

      await service.create(createData, ACTOR);

      expect(productVariantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discountType: DiscountType.PERCENT,
          discountValue: '0',
        }),
        ACTOR,
      );
    });

    it('create keeps a discount that is sent', async () => {
      productVariantRepository.findBySku.mockResolvedValue(null);
      productVariantRepository.create.mockResolvedValue(buildVariant());

      await service.create(
        {
          ...createData,
          discountType: DiscountType.FIXED,
          discountValue: '2',
        },
        ACTOR,
      );

      expect(productVariantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discountType: DiscountType.FIXED,
          discountValue: '2',
        }),
        ACTOR,
      );
    });

    it('throws DuplicateResourceException on a duplicate SKU', async () => {
      productVariantRepository.findBySku.mockResolvedValue(buildVariant());
      expect.assertions(3);

      try {
        await service.create(createData, ACTOR);
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateResourceException);
        expect(
          (error as DuplicateResourceException).getErrors()[0].errCode,
        ).toBe(ERROR_CODES.PRODUCT_VARIANT.SKU_EXISTS);
      }
      expect(productVariantRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllByProduct', () => {
    it('forwards the product id and returns the repository result unmodified', async () => {
      const variants = [buildVariant()];
      productVariantRepository.findAllByProduct.mockResolvedValue(variants);

      const result = await service.findAllByProduct('product-id-1');

      expect(productVariantRepository.findAllByProduct).toHaveBeenCalledWith(
        'product-id-1',
      );
      expect(result).toBe(variants);
    });
  });

  describe('findOne', () => {
    it('returns an existing variant', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);

      const result = await service.findOne('variant-id-1');

      expect(result).toBe(variant);
    });

    it('throws ItemNotFoundException when the repository has no match', async () => {
      productVariantRepository.findById.mockResolvedValue(null);
      expect.assertions(2);

      try {
        await service.findOne('missing-id');
      } catch (error) {
        expect(error).toBeInstanceOf(ItemNotFoundException);
        expect((error as ItemNotFoundException).getErrors()[0].errCode).toBe(
          ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        );
      }
    });
  });

  describe('update', () => {
    it('re-checks SKU uniqueness only when the SKU changes', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);

      await service.update('variant-id-1', { stockQuantity: 5 }, ACTOR);

      expect(productVariantRepository.findBySku).not.toHaveBeenCalled();
      expect(productVariantRepository.save).toHaveBeenCalledWith(
        variant,
        ACTOR,
      );
    });

    it('sets size on update and writes no name', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);

      const result = await service.update(
        'variant-id-1',
        { size: '500' },
        ACTOR,
      );

      expect(result.size).toBe('500');
      expect(result).not.toHaveProperty('name');
      expect(productVariantRepository.save).toHaveBeenCalledWith(
        variant,
        ACTOR,
      );
    });

    it('throws DuplicateResourceException when the new SKU collides with another variant', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);
      productVariantRepository.findBySku.mockResolvedValue(
        buildVariant({ id: 'other-variant-id', sku: 'SKU-2' }),
      );
      expect.assertions(3);

      try {
        await service.update('variant-id-1', { sku: 'SKU-2' }, ACTOR);
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateResourceException);
        expect(
          (error as DuplicateResourceException).getErrors()[0].errCode,
        ).toBe(ERROR_CODES.PRODUCT_VARIANT.SKU_EXISTS);
      }
      expect(productVariantRepository.save).not.toHaveBeenCalled();
    });

    it('does not throw when the colliding row is the variant being updated itself', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);
      productVariantRepository.findBySku.mockResolvedValue(variant);

      const result = await service.update(
        'variant-id-1',
        { sku: 'SKU-1' },
        ACTOR,
      );

      expect(result).toBe(variant);
      expect(productVariantRepository.save).toHaveBeenCalledWith(
        variant,
        ACTOR,
      );
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      productVariantRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { stockQuantity: 5 }, ACTOR),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(productVariantRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes the loaded variant', async () => {
      const variant = buildVariant();
      productVariantRepository.findById.mockResolvedValue(variant);

      await service.remove('variant-id-1', ACTOR);

      expect(productVariantRepository.softDelete).toHaveBeenCalledWith(
        variant,
        ACTOR,
      );
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      productVariantRepository.findById.mockResolvedValue(null);

      await expect(service.remove('missing-id', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(productVariantRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('findManyWithProduct', () => {
    it('findManyWithProduct forwards the ids and returns the repository result', async () => {
      const variants = [buildVariant({ id: 'v1' }), buildVariant({ id: 'v2' })];
      productVariantRepository.findManyWithProduct.mockResolvedValue(variants);

      await expect(service.findManyWithProduct(['v1', 'v2'])).resolves.toBe(
        variants,
      );
      expect(productVariantRepository.findManyWithProduct).toHaveBeenCalledWith(
        ['v1', 'v2'],
      );
    });

    it('findManyWithProduct returns [] for no ids without a query', async () => {
      await expect(service.findManyWithProduct([])).resolves.toEqual([]);
      expect(
        productVariantRepository.findManyWithProduct,
      ).not.toHaveBeenCalled();
    });
  });

  describe('reserve', () => {
    it('reserve forwards to the repository and returns its result', async () => {
      productVariantRepository.reserve.mockResolvedValueOnce(true);
      productVariantRepository.reserve.mockResolvedValueOnce(false);

      await expect(service.reserve('v1', 2, ACTOR)).resolves.toBe(true);
      await expect(service.reserve('v1', 9, null)).resolves.toBe(false);
      expect(productVariantRepository.reserve).toHaveBeenNthCalledWith(
        1,
        'v1',
        2,
        ACTOR,
      );
      expect(productVariantRepository.reserve).toHaveBeenNthCalledWith(
        2,
        'v1',
        9,
        null,
      );
    });

    it('reload returns null when the row is gone', async () => {
      productVariantRepository.reload.mockResolvedValue(null);

      await expect(service.reload(buildVariant())).resolves.toBeNull();
    });

    it('reload returns the variant read again from the database', async () => {
      const stale = buildVariant({ reservedQuantity: 0 });
      const fresh = buildVariant({ reservedQuantity: 3 });
      productVariantRepository.reload.mockResolvedValue(fresh);

      await expect(service.reload(stale)).resolves.toBe(fresh);
      expect(productVariantRepository.reload).toHaveBeenCalledWith(stale);
    });
  });

  describe('lockByIds', () => {
    it('lockByIds forwards the ids and returns the locked variants', async () => {
      const variants = [buildVariant({ id: 'v1' })];
      productVariantRepository.lockByIds.mockResolvedValue(variants);

      await expect(service.lockByIds(['v1'])).resolves.toBe(variants);
      expect(productVariantRepository.lockByIds).toHaveBeenCalledWith(['v1']);
    });

    it('lockByIds returns [] for no ids without a query', async () => {
      await expect(service.lockByIds([])).resolves.toEqual([]);
      expect(productVariantRepository.lockByIds).not.toHaveBeenCalled();
    });
  });

  describe('findPurchasable', () => {
    const withProduct = (
      product: { status: ProductStatus; deletedAt?: Date | null },
      variant: Partial<ProductVariant> = {},
    ): ProductVariant =>
      buildVariant({
        product: { deletedAt: null, ...product } as ProductVariant['product'],
        ...variant,
      });

    const expectNotFound = async (field: string): Promise<void> => {
      const error = await service
        .findPurchasable('variant-id-1', field)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect((error as ItemNotFoundException).getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field,
      });
    };

    it("findPurchasable returns an ACTIVE product's variant", async () => {
      const variant = withProduct({ status: ProductStatus.ACTIVE });
      productVariantRepository.findWithProduct.mockResolvedValue(variant);

      await expect(
        service.findPurchasable('variant-id-1', 'productVariantId'),
      ).resolves.toBe(variant);
      expect(productVariantRepository.findWithProduct).toHaveBeenCalledWith(
        'variant-id-1',
      );
    });

    it('findPurchasable is not found for a missing or deleted variant', async () => {
      productVariantRepository.findWithProduct.mockResolvedValue(null);
      await expectNotFound('productVariantId');

      productVariantRepository.findWithProduct.mockResolvedValue(
        withProduct(
          { status: ProductStatus.ACTIVE },
          { deletedAt: new Date() },
        ),
      );
      await expectNotFound('productVariantId');
    });

    it.each([
      [{ status: ProductStatus.DRAFT }],
      [{ status: ProductStatus.INACTIVE }],
      [{ status: ProductStatus.ARCHIVED }],
      [{ status: ProductStatus.ACTIVE, deletedAt: new Date() }],
    ])(
      'findPurchasable is not found for a DRAFT, INACTIVE, ARCHIVED or deleted product (%o)',
      async (product) => {
        productVariantRepository.findWithProduct.mockResolvedValue(
          withProduct(product),
        );
        await expectNotFound('id');
      },
    );
  });
});
