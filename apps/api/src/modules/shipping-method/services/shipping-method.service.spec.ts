import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { ShippingMethodStatus } from '@repo/constants';
import { ShippingMethodService } from './shipping-method.service.js';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import { ShippingMethodRepository } from '../repositories/shipping-method.repository.js';
import {
  DomainException,
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';

const errorsOf = (promise: Promise<unknown>) =>
  promise.then(
    () => [],
    (error: DomainException) => error.getErrors(),
  );

const ACTOR = 'admin-1';

describe('ShippingMethodService', () => {
  let service: ShippingMethodService;
  let repository: {
    findById: Mock;
    findByName: Mock;
    findAll: Mock;
    create: Mock;
    save: Mock;
    softDelete: Mock;
  };

  const buildMethod = (overrides: Partial<ShippingMethod> = {}) => ({
    id: 'method-1',
    name: 'Roast Express',
    description: '1-2 business days',
    price: '12.00',
    status: ShippingMethodStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    deletedBy: null,
    ...overrides,
  });

  beforeEach(async () => {
    repository = {
      findById: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      softDelete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingMethodService,
        { provide: ShippingMethodRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(ShippingMethodService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('create saves the method with the price as a string', async () => {
      repository.findByName.mockResolvedValue(null);
      const created = buildMethod({ name: 'Same day', price: '25' });
      repository.create.mockResolvedValue(created);

      const result = await service.create(
        { name: 'Same day', description: 'Today', price: 25 },
        ACTOR,
      );

      expect(repository.create).toHaveBeenCalledWith(
        { name: 'Same day', description: 'Today', price: '25' },
        ACTOR,
      );
      expect(result).toBe(created);
    });

    it('create stamps createdBy and updatedBy with the admin', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.create.mockResolvedValue(buildMethod());

      await service.create(
        { name: 'Same day', description: 'Today', price: 25 },
        ACTOR,
      );

      // BaseRepository stamps createdBy and updatedBy from the actor it is given.
      expect(repository.create).toHaveBeenCalledWith(expect.any(Object), ACTOR);
    });

    it('create throws DuplicateResourceException when the name exists in another case', async () => {
      repository.findByName.mockResolvedValue(buildMethod());

      const promise = service.create(
        { name: 'roast express', description: 'Fast', price: 12 },
        ACTOR,
      );

      await expect(promise).rejects.toBeInstanceOf(DuplicateResourceException);
      await expect(errorsOf(promise)).resolves.toMatchObject([
        {
          errCode: 'shippingMethodNameExists',
          field: 'name',
          message: 'Shipping method name already exists',
        },
      ]);
      expect(repository.findByName).toHaveBeenCalledWith('roast express', {
        includeDeleted: true,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('findOne throws ItemNotFoundException when the method is missing', async () => {
      repository.findById.mockResolvedValue(null);

      const promise = service.findOne('missing');

      await expect(promise).rejects.toBeInstanceOf(ItemNotFoundException);
      await expect(errorsOf(promise)).resolves.toMatchObject([
        {
          errCode: 'shippingMethodNotFound',
          field: 'id',
          message: 'Shipping method not found',
        },
      ]);
    });

    it('passes includeDeleted down', async () => {
      const method = buildMethod();
      repository.findById.mockResolvedValue(method);

      await expect(
        service.findOne('method-1', { includeDeleted: true }),
      ).resolves.toBe(method);
      expect(repository.findById).toHaveBeenCalledWith('method-1', {
        includeDeleted: true,
      });
    });
  });

  describe('update', () => {
    it('update allows a case-only rename of the same method', async () => {
      const method = buildMethod();
      repository.findById.mockResolvedValue(method);
      repository.findByName.mockResolvedValue(method);

      const result = await service.update(
        'method-1',
        { name: 'roast express' },
        ACTOR,
      );

      expect(result.name).toBe('roast express');
      expect(repository.save).toHaveBeenCalledWith(method, ACTOR);
    });

    it('update throws DuplicateResourceException when another method has the name', async () => {
      repository.findById.mockResolvedValue(buildMethod());
      repository.findByName.mockResolvedValue(
        buildMethod({ id: 'method-2', name: 'Same day' }),
      );

      await expect(
        service.update('method-1', { name: 'same day' }, ACTOR),
      ).rejects.toBeInstanceOf(DuplicateResourceException);
      expect(repository.findByName).toHaveBeenCalledWith('same day', {
        includeDeleted: true,
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('update sets the sent fields, with the price as a string', async () => {
      const method = buildMethod();
      repository.findById.mockResolvedValue(method);

      const result = await service.update(
        'method-1',
        {
          description: 'Next day',
          price: 30,
          status: ShippingMethodStatus.INACTIVE,
        },
        ACTOR,
      );

      expect(result).toMatchObject({
        name: 'Roast Express',
        description: 'Next day',
        price: '30',
        status: ShippingMethodStatus.INACTIVE,
      });
      expect(repository.findByName).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(method, ACTOR);
    });

    it('update stamps updatedBy only', async () => {
      const method = buildMethod({ createdBy: 'admin-0' });
      repository.findById.mockResolvedValue(method);

      await service.update('method-1', { price: 30 }, ACTOR);

      // save() (not create) stamps updatedBy only; createdBy stays as it was.
      expect(repository.save).toHaveBeenCalledWith(method, ACTOR);
      expect(repository.create).not.toHaveBeenCalled();
      expect(method.createdBy).toBe('admin-0');
    });

    it('update with {} saves nothing new and returns the method unchanged', async () => {
      const method = buildMethod();
      const before = { ...method };
      repository.findById.mockResolvedValue(method);

      const result = await service.update('method-1', {}, ACTOR);

      expect(result).toEqual(before);
      expect(repository.findByName).not.toHaveBeenCalled();
    });

    it('update throws ItemNotFoundException for a deleted method', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('method-1', { price: 5 }, ACTOR),
      ).rejects.toBeInstanceOf(ItemNotFoundException);
      expect(repository.findById).toHaveBeenCalledWith('method-1', undefined);
    });
  });

  describe('remove', () => {
    it('remove soft-deletes the method', async () => {
      const method = buildMethod();
      repository.findById.mockResolvedValue(method);

      await service.remove('method-1', ACTOR);

      expect(repository.softDelete).toHaveBeenCalledWith(method, ACTOR);
    });

    it('remove stamps deletedBy and updatedBy', async () => {
      const method = buildMethod();
      repository.findById.mockResolvedValue(method);

      await service.remove('method-1', ACTOR);

      // softDelete() stamps deletedBy and updatedBy from the actor.
      expect(repository.softDelete).toHaveBeenCalledWith(method, ACTOR);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('remove throws ItemNotFoundException when it is missing', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('missing', ACTOR)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('passes the query, filters and options to the repository', async () => {
      const page = { data: [], meta: {} };
      repository.findAll.mockResolvedValue(page);
      const query = { page: 1, limit: 10 };

      await expect(
        service.findAll(query, { status: undefined }, { includeDeleted: true }),
      ).resolves.toBe(page);
      expect(repository.findAll).toHaveBeenCalledWith(
        query,
        { status: undefined },
        { includeDeleted: true },
      );
    });
  });
});
