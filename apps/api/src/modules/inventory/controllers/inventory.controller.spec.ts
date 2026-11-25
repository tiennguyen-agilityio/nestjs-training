import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from '../services/inventory.service.js';
import type { User } from '../../user/entities/user.entity.js';

describe('InventoryController', () => {
  let controller: InventoryController;
  let inventoryService: Record<
    'findAll' | 'findOne' | 'restock' | 'adjust' | 'findMovements',
    Mock
  >;

  beforeEach(async () => {
    inventoryService = {
      findAll: vi.fn().mockResolvedValue({ data: [], meta: {} }),
      findOne: vi.fn().mockResolvedValue({ id: 'variant-1' }),
      restock: vi.fn().mockResolvedValue({}),
      adjust: vi.fn().mockResolvedValue({}),
      findMovements: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: inventoryService }],
    }).compile();
    controller = module.get(InventoryController);
  });

  it('list passes the query to InventoryService.findAll', async () => {
    const query = {
      page: 1,
      limit: 10,
      lowStock: false,
      activeOnly: false,
      sort: 'availableQuantity' as const,
      order: 'ASC' as const,
    };

    await controller.list(query);

    expect(inventoryService.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne passes the id to InventoryService.findOne', async () => {
    await expect(controller.findOne({ id: 'variant-1' })).resolves.toEqual({
      id: 'variant-1',
    });
    expect(inventoryService.findOne).toHaveBeenCalledWith('variant-1');
  });

  it('restock and adjust pass the id, body and the admin id', async () => {
    const admin = { id: 'admin-1' } as User;

    await controller.restock(admin, { id: 'variant-1' }, { quantity: 3 });
    await controller.adjust(
      admin,
      { id: 'variant-1' },
      { quantity: -1, reason: 'Lost' },
    );

    expect(inventoryService.restock).toHaveBeenCalledWith(
      'variant-1',
      { quantity: 3 },
      'admin-1',
    );
    expect(inventoryService.adjust).toHaveBeenCalledWith(
      'variant-1',
      { quantity: -1, reason: 'Lost' },
      'admin-1',
    );
  });

  it('movements passes the id and the query', async () => {
    const query = { page: 2, limit: 10 };

    await controller.movements({ id: 'variant-1' }, query);

    expect(inventoryService.findMovements).toHaveBeenCalledWith(
      'variant-1',
      query,
    );
  });
});
