import { Test, TestingModule } from '@nestjs/testing';
import { ProductVariantService } from './product-variant.service.js';
import { ProductVariant } from '../entities/product-variant.entity.js';
import { ProductVariantRepository } from '../repositories/product-variant.repository.js';
import { DiscountType, ProductUnit } from '@repo/constants';
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
});
