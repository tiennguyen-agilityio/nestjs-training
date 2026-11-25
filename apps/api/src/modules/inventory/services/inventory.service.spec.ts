import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementType } from '@repo/constants';
import type { Mock } from 'vitest';
import { InventoryService } from './inventory.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ResponseInventoryItemDto } from '../dto/response-inventory-item.dto.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import type { InventoryMovement } from '../../order/entities/inventory-movement.entity.js';
import { ResponseInventoryMovementDto } from '../dto/response-inventory-movement.dto.js';
import {
  InvalidStateException,
  ItemNotFoundException,
  type DomainException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

describe('InventoryService', () => {
  let service: InventoryService;
  let productVariantService: Record<
    | 'findInventoryPage'
    | 'findActive'
    | 'changeStock'
    | 'reload'
    | 'findMovements',
    Mock
  >;
  const variant = {
    id: 'variant-1',
    stockQuantity: 10,
    reservedQuantity: 4,
  } as ProductVariant;
  const movement = { id: 'movement-1' } as InventoryMovement;
  const movementRow = { id: 'movement-1' } as ResponseInventoryMovementDto;
  const row = { id: 'variant-1' } as ResponseInventoryItemDto;

  beforeEach(async () => {
    productVariantService = {
      findInventoryPage: vi.fn(),
      findActive: vi.fn().mockResolvedValue(variant),
      changeStock: vi.fn().mockResolvedValue(movement),
      reload: vi.fn().mockResolvedValue(variant),
      findMovements: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: ProductVariantService, useValue: productVariantService },
      ],
    }).compile();
    service = module.get(InventoryService);
    vi.spyOn(ResponseInventoryItemDto, 'fromEntity').mockReturnValue(row);
    vi.spyOn(ResponseInventoryMovementDto, 'fromEntity').mockReturnValue(
      movementRow,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('findAll passes the page and filters and maps each variant', async () => {
    const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
    productVariantService.findInventoryPage.mockResolvedValue({
      data: [variant],
      meta,
    });

    const result = await service.findAll({
      page: 1,
      limit: 10,
      search: 'ken',
      lowStock: true,
      activeOnly: false,
      sort: 'availableQuantity',
      order: 'ASC',
    });

    expect(result).toEqual({ data: [row], meta });
    expect(productVariantService.findInventoryPage).toHaveBeenCalledWith(
      { page: 1, limit: 10 },
      {
        search: 'ken',
        lowStock: true,
        activeOnly: false,
        sort: 'availableQuantity',
        order: 'ASC',
      },
    );
  });

  it('findOne maps the active variant', async () => {
    await expect(service.findOne('variant-1')).resolves.toBe(row);
    expect(productVariantService.findActive).toHaveBeenCalledWith('variant-1');
  });

  const errorOf = async (promise: Promise<unknown>): Promise<DomainException> =>
    (await promise.catch((caught: unknown) => caught)) as DomainException;

  it('restock adds the quantity as a RESTOCK by the admin and maps both', async () => {
    await expect(
      service.restock('variant-1', { quantity: 10 }, 'admin-1'),
    ).resolves.toEqual({ variant: row, movement: movementRow });
    expect(productVariantService.changeStock).toHaveBeenCalledWith(
      variant,
      10,
      { type: InventoryMovementType.RESTOCK, reason: null },
      'admin-1',
    );
  });

  it('adjust writes a signed ADJUSTMENT with its reason', async () => {
    await service.adjust(
      'variant-1',
      { quantity: -2, reason: 'Damaged bags' },
      'admin-1',
    );
    expect(productVariantService.changeStock).toHaveBeenCalledWith(
      variant,
      -2,
      { type: InventoryMovementType.ADJUSTMENT, reason: 'Damaged bags' },
      'admin-1',
    );
  });

  it('adjust below reserved throws stockBelowReserved naming the reserved count', async () => {
    productVariantService.changeStock.mockResolvedValue('belowReserved');

    const error = await errorOf(
      service.adjust('variant-1', { quantity: -9, reason: 'Count' }, 'admin-1'),
    );

    expect(error).toBeInstanceOf(InvalidStateException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_BELOW_RESERVED,
      field: 'quantity',
      message: 'Stock cannot be below the 4 units held for orders',
    });
  });

  it('restock above the max throws stockAboveMax without changing stock', async () => {
    const error = await errorOf(
      service.restock('variant-1', { quantity: 999_991 }, 'admin-1'),
    );

    expect(error).toBeInstanceOf(InvalidStateException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.PRODUCT_VARIANT.STOCK_ABOVE_MAX,
      field: 'quantity',
    });
    expect(productVariantService.changeStock).not.toHaveBeenCalled();
  });

  it('restock of a variant deleted after the check throws 404', async () => {
    productVariantService.changeStock.mockResolvedValue('notFound');

    const error = await errorOf(
      service.restock('variant-1', { quantity: 3 }, 'admin-1'),
    );

    expect(error).toBeInstanceOf(ItemNotFoundException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'id',
    });
  });

  it('findMovements checks the variant, then maps its movements page', async () => {
    const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
    productVariantService.findMovements.mockResolvedValue({
      data: [movement],
      meta,
    });

    await expect(
      service.findMovements('variant-1', {
        page: 1,
        limit: 10,
        type: InventoryMovementType.ADJUSTMENT,
      }),
    ).resolves.toEqual({ data: [movementRow], meta });
    expect(productVariantService.findActive).toHaveBeenCalledWith('variant-1');
    expect(productVariantService.findMovements).toHaveBeenCalledWith(
      'variant-1',
      { page: 1, limit: 10 },
      InventoryMovementType.ADJUSTMENT,
    );
  });
});
