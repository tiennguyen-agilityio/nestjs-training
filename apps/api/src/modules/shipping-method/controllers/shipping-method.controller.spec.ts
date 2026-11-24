import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import {
  ProductSortBy,
  ShippingMethodStatus,
  UserRole,
  UserStatus,
} from '@repo/constants';
import { ShippingMethodController } from './shipping-method.controller.js';
import { ShippingMethodService } from '../services/shipping-method.service.js';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import { ResponseShippingMethodDto } from '../dto/response-shipping-method.dto.js';
import { User } from '../../user/entities/user.entity.js';

describe('ShippingMethodController', () => {
  let controller: ShippingMethodController;
  let service: {
    create: Mock;
    findAll: Mock;
    findOne: Mock;
    update: Mock;
    remove: Mock;
  };

  const method = {
    id: 'method-1',
    name: 'Roast Express',
    description: '1-2 business days',
    price: '12.00',
    status: ShippingMethodStatus.ACTIVE,
    createdAt: new Date('2026-11-24T00:00:00Z'),
    updatedAt: new Date('2026-11-24T00:00:00Z'),
    deletedAt: null,
    createdBy: 'admin-0',
    updatedBy: 'admin-1',
    deletedBy: null,
  } as ShippingMethod;

  const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };

  const activeAdmin = {
    id: 'admin-1',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as User;
  const inactiveAdmin = { ...activeAdmin, status: UserStatus.INACTIVE } as User;
  const customer = {
    id: 'user-1',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
  } as User;

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      findAll: vi.fn().mockResolvedValue({ data: [method], meta }),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShippingMethodController],
      providers: [{ provide: ShippingMethodService, useValue: service }],
    }).compile();

    controller = module.get(ShippingMethodController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it.each([
      ['no user', undefined],
      ['a USER', customer],
    ])(
      'findAll passes status ACTIVE and no deleted rows for a non-admin (%s)',
      async (_label, user) => {
        await controller.findAll(
          {
            page: 1,
            limit: 10,
            status: ShippingMethodStatus.INACTIVE,
          },
          user,
        );

        expect(service.findAll).toHaveBeenCalledWith(
          { page: 1, limit: 10, search: undefined },
          { status: ShippingMethodStatus.ACTIVE },
          { includeDeleted: false },
        );
      },
    );

    it("findAll keeps a shopper's sortBy", async () => {
      await controller.findAll({
        page: 1,
        limit: 10,
        sortBy: ProductSortBy.PRICE_ASC,
      });

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        {
          sortBy: ProductSortBy.PRICE_ASC,
          status: ShippingMethodStatus.ACTIVE,
        },
        { includeDeleted: false },
      );
    });

    it("findAll passes the admin's filters and deleted rows", async () => {
      const result = await controller.findAll(
        {
          page: 2,
          limit: 5,
          search: 'express',
          status: ShippingMethodStatus.INACTIVE,
          sortBy: ProductSortBy.PRICE_ASC,
        },
        activeAdmin,
      );

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 2, limit: 5, search: 'express' },
        {
          status: ShippingMethodStatus.INACTIVE,
          sortBy: ProductSortBy.PRICE_ASC,
        },
        { includeDeleted: true },
      );
      expect(result).toEqual({
        data: [
          ResponseShippingMethodDto.fromEntity(method, { withAudit: true }),
        ],
        meta,
      });
    });

    it('findAll lists the audit ids for an active admin only', async () => {
      const asAdmin = await controller.findAll(
        { page: 1, limit: 10 },
        activeAdmin,
      );
      const asUser = await controller.findAll({ page: 1, limit: 10 }, customer);
      const asInactiveAdmin = await controller.findAll(
        { page: 1, limit: 10 },
        inactiveAdmin,
      );

      expect(asAdmin.data[0]).toMatchObject({
        createdBy: 'admin-0',
        updatedBy: 'admin-1',
        deletedBy: null,
      });
      for (const page of [asUser, asInactiveAdmin]) {
        const json = JSON.parse(JSON.stringify(page.data[0])) as object;
        expect(json).not.toHaveProperty('createdBy');
        expect(json).not.toHaveProperty('updatedBy');
        expect(json).not.toHaveProperty('deletedBy');
      }
    });

    it('findAll treats an inactive admin as a shopper', async () => {
      await controller.findAll(
        { page: 1, limit: 10, status: ShippingMethodStatus.INACTIVE },
        inactiveAdmin,
      );

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 10, search: undefined },
        { status: ShippingMethodStatus.ACTIVE },
        { includeDeleted: false },
      );
    });
  });

  describe('findOne', () => {
    it('findOne reads deleted methods', async () => {
      service.findOne.mockResolvedValue(method);

      const result = await controller.findOne({ id: 'method-1' });

      expect(service.findOne).toHaveBeenCalledWith('method-1', {
        includeDeleted: true,
      });
      expect(result).toEqual(
        ResponseShippingMethodDto.fromEntity(method, { withAudit: true }),
      );
    });
  });

  describe('create, update and remove', () => {
    it('create returns ResponseShippingMethodDto with price as a number', async () => {
      service.create.mockResolvedValue(method);
      const dto = { name: 'Roast Express', description: 'Fast', price: 12 };

      const result = await controller.create(dto, activeAdmin);

      expect(service.create).toHaveBeenCalledWith(dto, 'admin-1');
      expect(result).toBeInstanceOf(ResponseShippingMethodDto);
      expect(result).toEqual({
        id: 'method-1',
        name: 'Roast Express',
        description: '1-2 business days',
        price: 12,
        status: ShippingMethodStatus.ACTIVE,
        createdAt: method.createdAt,
        updatedAt: method.updatedAt,
        deletedAt: null,
        createdBy: 'admin-0',
        updatedBy: 'admin-1',
        deletedBy: null,
      });
    });

    it('update returns ResponseShippingMethodDto with price as a number', async () => {
      service.update.mockResolvedValue({ ...method, price: '30.00' });

      const result = await controller.update(
        { id: 'method-1' },
        { price: 30 },
        activeAdmin,
      );

      expect(service.update).toHaveBeenCalledWith(
        'method-1',
        { price: 30 },
        'admin-1',
      );
      expect(result.price).toBe(30);
    });

    it('remove delegates to the service and returns nothing', async () => {
      service.remove.mockResolvedValue(undefined);

      await expect(
        controller.remove({ id: 'method-1' }, activeAdmin),
      ).resolves.toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith('method-1', 'admin-1');
    });

    it('create, update and remove pass the signed-in admin to the service', async () => {
      const otherAdmin = { ...activeAdmin, id: 'admin-2' };
      service.create.mockResolvedValue(method);
      service.update.mockResolvedValue(method);
      service.remove.mockResolvedValue(undefined);
      const dto = { name: 'Roast Express', description: 'Fast', price: 12 };

      await controller.create(dto, otherAdmin);
      await controller.update({ id: 'method-1' }, { price: 30 }, otherAdmin);
      await controller.remove({ id: 'method-1' }, otherAdmin);

      expect(service.create).toHaveBeenCalledWith(dto, 'admin-2');
      expect(service.update).toHaveBeenCalledWith(
        'method-1',
        { price: 30 },
        'admin-2',
      );
      expect(service.remove).toHaveBeenCalledWith('method-1', 'admin-2');
    });
  });
});
