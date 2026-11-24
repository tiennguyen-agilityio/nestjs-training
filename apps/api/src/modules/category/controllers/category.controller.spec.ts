import { Test, TestingModule } from '@nestjs/testing';
import { CategoryController } from './category.controller.js';
import { CategoryService } from '../services/category.service.js';
import { Category } from '../entities/category.entity.js';
import { ResponseCategoryDto } from '../dto/response-category.dto.js';
import { User } from '../../user/entities/user.entity.js';
import { UserRole, UserStatus } from '@repo/constants';
import {
  DuplicateResourceException,
  InvalidStateException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

import type { Mock } from 'vitest';
describe('CategoryController', () => {
  let controller: CategoryController;
  let categoryService: {
    create: Mock;
    findAll: Mock;
    findOne: Mock;
    update: Mock;
    restore: Mock;
    remove: Mock;
  };

  const category = {
    id: 'category-id-1',
    name: 'Espresso',
    slug: 'espresso',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: 'admin-id-1',
    updatedBy: 'admin-id-2',
    deletedBy: null,
  } as Category;

  const adminUser = {
    id: 'admin-id-1',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as User;

  const notFound = new ItemNotFoundException({
    errCode: ERROR_CODES.CATEGORY.NOT_FOUND,
    field: 'id',
    message: ERROR_MESSAGES.CATEGORY.NOT_FOUND,
    description: ERROR_DESCRIPTIONS.CATEGORY.NOT_FOUND,
  });

  const nameExists = new DuplicateResourceException({
    errCode: ERROR_CODES.CATEGORY.NAME_EXISTS,
    field: 'name',
    message: ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
    description: ERROR_DESCRIPTIONS.CATEGORY.NAME_EXISTS,
  });

  const notDeleted = new InvalidStateException({
    errCode: ERROR_CODES.CATEGORY.NOT_DELETED,
    field: 'id',
    message: ERROR_MESSAGES.CATEGORY.NOT_DELETED,
    description: ERROR_DESCRIPTIONS.CATEGORY.NOT_DELETED,
  });

  beforeEach(async () => {
    categoryService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      restore: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: CategoryService, useValue: categoryService }],
    }).compile();

    controller = module.get(CategoryController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('delegates to CategoryService.findAll and maps data to ResponseCategoryDto', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      categoryService.findAll.mockResolvedValue({ data: [category], meta });

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(categoryService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        { includeDeleted: false },
      );
      expect(result).toEqual({
        data: [ResponseCategoryDto.fromEntity(category)],
        meta,
      });
    });

    it('includes soft-deleted categories for an active admin', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      categoryService.findAll.mockResolvedValue({ data: [category], meta });

      await controller.findAll({ page: 1, limit: 10 }, adminUser);

      expect(categoryService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        { includeDeleted: true },
      );
    });

    it('lists audit ids for an active admin only', async () => {
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      categoryService.findAll.mockResolvedValue({ data: [category], meta });

      const asAdmin = await controller.findAll(
        { page: 1, limit: 10 },
        adminUser,
      );
      const asVisitor = await controller.findAll({ page: 1, limit: 10 });

      expect(asAdmin.data[0]).toMatchObject({
        createdBy: 'admin-id-1',
        updatedBy: 'admin-id-2',
        deletedBy: null,
      });
      expect(JSON.parse(JSON.stringify(asVisitor.data[0]))).not.toHaveProperty(
        'createdBy',
      );
    });
  });

  describe('findOne', () => {
    it('delegates to CategoryService.findOne', async () => {
      categoryService.findOne.mockResolvedValue(category);

      const result = await controller.findOne({ id: 'category-id-1' });

      expect(categoryService.findOne).toHaveBeenCalledWith('category-id-1', {
        includeDeleted: false,
      });
      expect(result).toEqual(ResponseCategoryDto.fromEntity(category));
    });

    it('reads audit ids for an active admin only', async () => {
      categoryService.findOne.mockResolvedValue(category);

      expect(
        await controller.findOne({ id: 'category-id-1' }, adminUser),
      ).toEqual(ResponseCategoryDto.fromEntity(category, { withAudit: true }));
      expect(
        JSON.parse(
          JSON.stringify(await controller.findOne({ id: 'category-id-1' })),
        ),
      ).not.toHaveProperty('createdBy');
    });

    it('propagates ItemNotFoundException', async () => {
      categoryService.findOne.mockRejectedValue(notFound);

      await expect(
        controller.findOne({ id: 'missing-id' }),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });

  describe('create', () => {
    it('delegates to CategoryService.create and returns its result', async () => {
      const dto = { name: 'Espresso' };
      categoryService.create.mockResolvedValue(category);

      const result = await controller.create(dto, adminUser);

      expect(categoryService.create).toHaveBeenCalledWith(dto, 'admin-id-1');
      expect(result).toEqual(
        ResponseCategoryDto.fromEntity(category, { withAudit: true }),
      );
    });

    it('propagates DuplicateResourceException', async () => {
      categoryService.create.mockRejectedValue(nameExists);

      await expect(
        controller.create({ name: 'Espresso' }, adminUser),
      ).rejects.toBeInstanceOf(DuplicateResourceException);
    });
  });

  describe('update', () => {
    it('delegates to CategoryService.update', async () => {
      const dto = { name: 'Latte' };
      const updated = { ...category, name: 'Latte' };
      categoryService.update.mockResolvedValue(updated);

      const result = await controller.update(
        { id: 'category-id-1' },
        dto,
        adminUser,
      );

      expect(categoryService.update).toHaveBeenCalledWith(
        'category-id-1',
        dto,
        'admin-id-1',
      );
      expect(result).toEqual(
        ResponseCategoryDto.fromEntity(updated, { withAudit: true }),
      );
    });

    it('propagates ItemNotFoundException', async () => {
      categoryService.update.mockRejectedValue(notFound);

      await expect(
        controller.update({ id: 'missing-id' }, { name: 'Latte' }, adminUser),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });

  describe('restore', () => {
    it('delegates to CategoryService.restore and maps to ResponseCategoryDto', async () => {
      const restored = { ...category, deletedAt: null } as Category;
      categoryService.restore.mockResolvedValue(restored);

      const result = await controller.restore(
        { id: 'category-id-1' },
        adminUser,
      );

      expect(categoryService.restore).toHaveBeenCalledWith(
        'category-id-1',
        'admin-id-1',
      );
      expect(result).toEqual(
        ResponseCategoryDto.fromEntity(restored, { withAudit: true }),
      );
    });

    it('propagates InvalidStateException', async () => {
      categoryService.restore.mockRejectedValue(notDeleted);

      await expect(
        controller.restore({ id: 'category-id-1' }, adminUser),
      ).rejects.toBeInstanceOf(InvalidStateException);
    });
  });

  describe('remove', () => {
    it('delegates to CategoryService.remove', async () => {
      categoryService.remove.mockResolvedValue(undefined);

      await controller.remove({ id: 'category-id-1' }, adminUser);

      expect(categoryService.remove).toHaveBeenCalledWith(
        'category-id-1',
        'admin-id-1',
      );
    });

    it('propagates ItemNotFoundException', async () => {
      categoryService.remove.mockRejectedValue(notFound);

      await expect(
        controller.remove({ id: 'missing-id' }, adminUser),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
    });
  });
});
