import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductController } from './product.controller.js';
import { ProductService } from '../services/product.service.js';
import { Product } from '../entities/product.entity.js';
import {
  ProductStatus,
  RoastLevel,
  UserRole,
  UserStatus,
} from '@repo/constants';
import type { CreateProductInput } from '../dto/product.schema.js';
import { ResponseProductDto } from '../dto/response-product.dto.js';
import { User } from '../../user/entities/user.entity.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

import type { Mock } from 'vitest';
describe('ProductController', () => {
  let controller: ProductController;
  let productService: {
    create: Mock;
    findAll: Mock;
    findOne: Mock;
    update: Mock;
    remove: Mock;
  };

  const product = {
    id: 'product-id-1',
    category: { id: 'category-id-1' },
    name: 'Espresso Blend',
    slug: 'espresso-blend',
    description: null,
    roastLevel: null,
    isOrganic: false,
    isFairTrade: false,
    status: ProductStatus.DRAFT,
    tastingNotes: null,
    origin: null,
    processingMethod: null,
    createdAt: new Date(),
    deletedAt: null,
    createdBy: 'admin-id-1',
    updatedBy: 'admin-id-1',
    deletedBy: null,
    images: { getItems: () => [] },
    variants: { getItems: () => [] },
  } as unknown as Product;

  const adminUser = {
    id: 'admin-id-1',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as User;

  const notFound = new ItemNotFoundException({
    errCode: ERROR_CODES.PRODUCT.NOT_FOUND,
    field: 'id',
    message: ERROR_MESSAGES.PRODUCT.NOT_FOUND,
    description: ERROR_DESCRIPTIONS.PRODUCT.NOT_FOUND,
  });

  const nameExists = new DuplicateResourceException({
    errCode: ERROR_CODES.PRODUCT.NAME_EXISTS,
    field: 'name',
    message: ERROR_MESSAGES.PRODUCT.NAME_EXISTS,
    description: ERROR_DESCRIPTIONS.PRODUCT.NAME_EXISTS,
  });

  beforeEach(async () => {
    productService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [{ provide: ProductService, useValue: productService }],
    }).compile();

    controller = module.get(ProductController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('splits query into pagination/search and filters, then maps data to ResponseProductDto', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      productService.findAll.mockResolvedValue({ data: [product], meta });

      const result = await controller.findAll({
        page: 1,
        limit: 10,
        categoryId: 'category-id-1',
        status: ProductStatus.ACTIVE,
      });

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { categoryId: 'category-id-1', status: ProductStatus.ACTIVE },
        { includeDeleted: false },
      );
      expect(result).toEqual({
        data: [ResponseProductDto.fromEntity(product)],
        meta,
      });
    });

    it('lists audit ids for an active admin only', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      productService.findAll.mockResolvedValue({ data: [product], meta });

      const asAdmin = await controller.findAll(
        { page: 1, limit: 10 },
        adminUser,
      );
      const asVisitor = await controller.findAll({ page: 1, limit: 10 });

      expect(asAdmin.data[0]).toMatchObject({ createdBy: 'admin-id-1' });
      expect(JSON.parse(JSON.stringify(asVisitor.data[0]))).not.toHaveProperty(
        'createdBy',
      );
    });

    it('includes soft-deleted products for an active admin', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      productService.findAll.mockResolvedValue({ data: [product], meta });

      await controller.findAll({ page: 1, limit: 10 }, adminUser);

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        {},
        { includeDeleted: true },
      );
    });

    it('forces ACTIVE for a visitor with no session', async () => {
      productService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll({ page: 1, limit: 10 }, undefined);

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { status: ProductStatus.ACTIVE },
        { includeDeleted: false },
      );
    });

    it('ignores a requested DRAFT status for a shopper', async () => {
      productService.findAll.mockResolvedValue({ data: [], meta: {} });
      const customer = {
        id: 'user-id-1',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      } as User;

      await controller.findAll(
        { page: 1, limit: 10, status: ProductStatus.DRAFT },
        customer,
      );

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { status: ProductStatus.ACTIVE },
        { includeDeleted: false },
      );
    });

    it('treats an inactive admin as a shopper', async () => {
      productService.findAll.mockResolvedValue({ data: [], meta: {} });
      const inactiveAdmin = {
        ...adminUser,
        status: UserStatus.INACTIVE,
      } as User;

      await controller.findAll(
        { page: 1, limit: 10, status: ProductStatus.ARCHIVED },
        inactiveAdmin,
      );

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { status: ProductStatus.ACTIVE },
        { includeDeleted: false },
      );
    });

    it('keeps the requested status for an active admin', async () => {
      productService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(
        { page: 1, limit: 10, status: ProductStatus.DRAFT },
        adminUser,
      );

      expect(productService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { status: ProductStatus.DRAFT },
        { includeDeleted: true },
      );
    });
  });

  describe('findOne', () => {
    it('delegates to ProductService.findOne', async () => {
      productService.findOne.mockResolvedValue(product);

      const result = await controller.findOne({ id: 'product-id-1' });

      expect(productService.findOne).toHaveBeenCalledWith('product-id-1', {
        includeDeleted: false,
        activeOnly: true,
      });
      expect(result).toEqual(ResponseProductDto.fromEntity(product));
    });

    it('reads any status for an active admin', async () => {
      productService.findOne.mockResolvedValue(product);

      await controller.findOne({ id: 'product-id-1' }, adminUser);

      expect(productService.findOne).toHaveBeenCalledWith('product-id-1', {
        includeDeleted: true,
        activeOnly: false,
      });
    });

    it('reads audit ids for an active admin only', async () => {
      productService.findOne.mockResolvedValue(product);

      expect(
        await controller.findOne({ id: 'product-id-1' }, adminUser),
      ).toEqual(ResponseProductDto.fromEntity(product, { withAudit: true }));
      expect(
        JSON.parse(
          JSON.stringify(await controller.findOne({ id: 'product-id-1' })),
        ),
      ).not.toHaveProperty('createdBy');
    });

    it('propagates ItemNotFoundException', async () => {
      productService.findOne.mockRejectedValue(notFound);

      await expect(
        controller.findOne({ id: 'missing-id' }),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });

  const createDto: CreateProductInput = {
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
    it('delegates to ProductService.create and returns its result', async () => {
      productService.create.mockResolvedValue(product);

      const result = await controller.create(createDto, adminUser);

      expect(productService.create).toHaveBeenCalledWith(
        createDto,
        'admin-id-1',
      );
      expect(result).toEqual(
        ResponseProductDto.fromEntity(product, { withAudit: true }),
      );
    });

    it('propagates DuplicateResourceException', async () => {
      productService.create.mockRejectedValue(nameExists);

      await expect(
        controller.create(createDto, adminUser),
      ).rejects.toBeInstanceOf(DuplicateResourceException);
    });
  });

  describe('update', () => {
    it('delegates to ProductService.update', async () => {
      const dto = { name: 'Latte Blend' };
      const updated = { ...product, name: 'Latte Blend' };
      productService.update.mockResolvedValue(updated);

      const result = await controller.update(
        { id: 'product-id-1' },
        dto,
        adminUser,
      );

      expect(productService.update).toHaveBeenCalledWith(
        'product-id-1',
        dto,
        'admin-id-1',
      );
      expect(result).toEqual(
        ResponseProductDto.fromEntity(updated, { withAudit: true }),
      );
    });

    it('propagates BadRequestException', async () => {
      productService.update.mockRejectedValue(new BadRequestException());

      await expect(
        controller.update(
          { id: 'product-id-1' },
          { name: 'Latte Blend' },
          adminUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('delegates to ProductService.remove', async () => {
      productService.remove.mockResolvedValue(undefined);

      await controller.remove({ id: 'product-id-1' }, adminUser);

      expect(productService.remove).toHaveBeenCalledWith(
        'product-id-1',
        'admin-id-1',
      );
    });

    it('propagates ItemNotFoundException', async () => {
      productService.remove.mockRejectedValue(notFound);

      await expect(
        controller.remove({ id: 'missing-id' }, adminUser),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });
});
