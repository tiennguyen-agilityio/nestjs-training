import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service.js';
import { Category } from '../entities/category.entity.js';
import { CategoryRepository } from '../repositories/category.repository.js';
import type { Mock } from 'vitest';
import {
  DuplicateResourceException,
  InvalidStateException,
  ItemNotFoundException,
  ResourceInUseException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const ACTOR = 'admin-1';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: {
    findById: Mock;
    findByName: Mock;
    findAll: Mock;
    create: Mock;
    save: Mock;
    softDelete: Mock;
    restore: Mock;
    countProducts: Mock;
  };

  const buildCategory = (overrides: Partial<Category> = {}): Category => ({
    id: 'category-id-1',
    name: 'Espresso',
    slug: 'espresso',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    ...overrides,
  });

  beforeEach(async () => {
    categoryRepository = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      countProducts: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: CategoryRepository, useValue: categoryRepository },
      ],
    }).compile();

    service = module.get(CategoryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates and returns a category with a slug derived from the name', async () => {
      categoryRepository.findByName.mockResolvedValue(null);
      const created = buildCategory();
      categoryRepository.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Espresso' }, ACTOR);

      expect(categoryRepository.findByName).toHaveBeenCalledWith('Espresso', {
        includeDeleted: true,
      });
      expect(categoryRepository.create).toHaveBeenCalledWith(
        { name: 'Espresso', slug: 'espresso' },
        ACTOR,
      );
      expect(result).toBe(created);
    });

    it('throws DuplicateResourceException when the name already exists, including soft-deleted rows', async () => {
      categoryRepository.findByName.mockResolvedValue(buildCategory());

      await expect(
        service.create({ name: 'Espresso' }, ACTOR),
      ).rejects.toBeInstanceOf(DuplicateResourceException);
      expect(categoryRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('forwards the query and options to the repository and returns its result, unmodified', async () => {
      const paginated = {
        data: [buildCategory()],
        meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 },
      };
      categoryRepository.findAll.mockResolvedValue(paginated);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { includeDeleted: true },
      );

      expect(categoryRepository.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10 },
        { includeDeleted: true },
      );
      expect(result).toBe(paginated);
    });
  });

  describe('findOne', () => {
    it('returns an existing category', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);

      const result = await service.findOne('category-id-1');

      expect(categoryRepository.findById).toHaveBeenCalledWith(
        'category-id-1',
        undefined,
      );
      expect(result).toBe(category);
    });

    it('throws ItemNotFoundException when the repository has no match', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('regenerates the slug and re-checks uniqueness when the name changes', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);
      categoryRepository.findByName.mockResolvedValue(null);

      const result = await service.update(
        'category-id-1',
        { name: 'Cold Brew' },
        ACTOR,
      );

      expect(categoryRepository.findByName).toHaveBeenCalledWith('Cold Brew', {
        includeDeleted: true,
      });
      expect(category.name).toBe('Cold Brew');
      expect(category.slug).toBe('cold-brew');
      expect(categoryRepository.save).toHaveBeenCalledWith(category, ACTOR);
      expect(result).toBe(category);
    });

    it('does not touch the slug or re-check uniqueness when the name is unchanged', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);

      await service.update('category-id-1', { name: 'Espresso' }, ACTOR);

      expect(categoryRepository.findByName).not.toHaveBeenCalled();
      expect(category.slug).toBe('espresso');
    });

    it('throws DuplicateResourceException when the new name collides with another category', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);
      categoryRepository.findByName.mockResolvedValue(
        buildCategory({ id: 'other-category-id', name: 'Cold Brew' }),
      );

      await expect(
        service.update('category-id-1', { name: 'Cold Brew' }, ACTOR),
      ).rejects.toBeInstanceOf(DuplicateResourceException);
      expect(categoryRepository.save).not.toHaveBeenCalled();
    });

    it('does not throw when the colliding row is the category being updated itself', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);
      categoryRepository.findByName.mockResolvedValue(category);

      const result = await service.update(
        'category-id-1',
        { name: 'Espresso Doppio' },
        ACTOR,
      );

      expect(result).toBe(category);
      expect(categoryRepository.save).toHaveBeenCalledWith(category, ACTOR);
    });

    it('update stamps updatedBy even when nothing changed', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);

      await service.update('category-id-1', {}, ACTOR);

      expect(categoryRepository.save).toHaveBeenCalledWith(category, ACTOR);
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { name: 'Cold Brew' }, ACTOR),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(categoryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes the loaded category when it has no products', async () => {
      const category = buildCategory();
      categoryRepository.findById.mockResolvedValue(category);
      categoryRepository.countProducts.mockResolvedValue(0);

      await service.remove('category-id-1', ACTOR);

      expect(categoryRepository.countProducts).toHaveBeenCalledWith(
        'category-id-1',
      );
      expect(categoryRepository.softDelete).toHaveBeenCalledWith(
        category,
        ACTOR,
      );
    });

    it('throws ResourceInUseException when the category still has products', async () => {
      categoryRepository.findById.mockResolvedValue(buildCategory());
      categoryRepository.countProducts.mockResolvedValue(2);

      await expect(
        service.remove('category-id-1', ACTOR),
      ).rejects.toBeInstanceOf(ResourceInUseException);
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.remove('missing-id', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(categoryRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted category and returns it', async () => {
      const category = buildCategory({ deletedAt: new Date() });
      categoryRepository.findById.mockResolvedValue(category);
      categoryRepository.restore.mockImplementation((entity: Category) => {
        entity.deletedAt = null;
        return Promise.resolve();
      });

      const result = await service.restore('category-id-1', ACTOR);

      expect(categoryRepository.findById).toHaveBeenCalledWith(
        'category-id-1',
        { includeDeleted: true },
      );
      expect(categoryRepository.restore).toHaveBeenCalledWith(category, ACTOR);
      expect(result.deletedAt).toBeNull();
    });

    it('throws InvalidStateException when the category is not deleted', async () => {
      categoryRepository.findById.mockResolvedValue(buildCategory());

      const error = await service
        .restore('category-id-1', ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidStateException);
      expect((error as InvalidStateException).getErrors()[0].errCode).toBe(
        ERROR_CODES.CATEGORY.NOT_DELETED,
      );
      expect(categoryRepository.restore).not.toHaveBeenCalled();
    });

    it('throws ItemNotFoundException for a missing id', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.restore('missing-id', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(categoryRepository.restore).not.toHaveBeenCalled();
    });
  });
});
