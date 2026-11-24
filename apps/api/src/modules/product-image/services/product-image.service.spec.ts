import { Test, TestingModule } from '@nestjs/testing';
import { ItemNotFoundException } from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { ProductImageService } from './product-image.service.js';
import { ProductImage } from '../entities/product-image.entity.js';
import { ProductImageRepository } from '../repositories/product-image.repository.js';

import type { Mock } from 'vitest';
const ACTOR = 'admin-1';

describe('ProductImageService', () => {
  let service: ProductImageService;
  let productImageRepository: {
    findById: Mock;
    findAllByProduct: Mock;
    create: Mock;
    save: Mock;
    softDelete: Mock;
  };

  const buildImage = (overrides: Partial<ProductImage> = {}): ProductImage =>
    ({
      id: 'image-id-1',
      url: 'https://example.com/image.jpg',
      isPrimary: false,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as ProductImage;

  beforeEach(async () => {
    productImageRepository = {
      findById: vi.fn(),
      findAllByProduct: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductImageService,
        { provide: ProductImageRepository, useValue: productImageRepository },
      ],
    }).compile();

    service = module.get(ProductImageService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns an image', async () => {
      const created = buildImage();
      productImageRepository.create.mockResolvedValue(created);

      const data = {
        productId: 'product-id-1',
        url: 'https://example.com/image.jpg',
      };
      const result = await service.create(data, ACTOR);

      expect(productImageRepository.create).toHaveBeenCalledWith(data, ACTOR);
      expect(result).toBe(created);
    });
  });

  describe('findAllByProduct', () => {
    it('forwards the product id to the repository and returns its result, unmodified', async () => {
      const images = [buildImage()];
      productImageRepository.findAllByProduct.mockResolvedValue(images);

      const result = await service.findAllByProduct('product-id-1');

      expect(productImageRepository.findAllByProduct).toHaveBeenCalledWith(
        'product-id-1',
      );
      expect(result).toBe(images);
    });
  });

  describe('findOne', () => {
    it('returns an existing image', async () => {
      const image = buildImage();
      productImageRepository.findById.mockResolvedValue(image);

      const result = await service.findOne('image-id-1');

      expect(productImageRepository.findById).toHaveBeenCalledWith(
        'image-id-1',
      );
      expect(result).toBe(image);
    });

    it('throws ItemNotFoundException when the repository has no match', async () => {
      productImageRepository.findById.mockResolvedValue(null);
      expect.assertions(2);

      try {
        await service.findOne('missing-id');
      } catch (error) {
        expect(error).toBeInstanceOf(ItemNotFoundException);
        expect((error as ItemNotFoundException).getErrors()[0].errCode).toBe(
          ERROR_CODES.PRODUCT_IMAGE.NOT_FOUND,
        );
      }
    });
  });

  describe('remove', () => {
    it('soft-deletes the loaded image', async () => {
      const image = buildImage();
      productImageRepository.findById.mockResolvedValue(image);

      await service.remove('image-id-1', ACTOR);

      expect(productImageRepository.softDelete).toHaveBeenCalledWith(
        image,
        ACTOR,
      );
    });

    it('soft-deletes the image and clears its sortOrder', async () => {
      const image = buildImage();
      image.sortOrder = 2;
      productImageRepository.findById.mockResolvedValue(image);

      await service.remove('image-id-1', ACTOR);

      expect(productImageRepository.softDelete).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: null }),
        ACTOR,
      );
    });

    it('throws ItemNotFoundException for a missing id, without calling softDelete', async () => {
      productImageRepository.findById.mockResolvedValue(null);

      await expect(service.remove('missing-id', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(productImageRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
