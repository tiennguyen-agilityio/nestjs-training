import {
  inventoryQuerySchema,
  movementQuerySchema,
} from './inventory.schema.js';

describe('inventoryQuerySchema', () => {
  it('inventoryQuerySchema defaults to availableQuantity ASC with both flags false', () => {
    expect(inventoryQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      lowStock: false,
      activeOnly: false,
      sort: 'availableQuantity',
      order: 'ASC',
    });
    expect(
      inventoryQuerySchema.parse({ lowStock: 'true', activeOnly: 'true' }),
    ).toMatchObject({ lowStock: true, activeOnly: true });
  });

  it('inventoryQuerySchema rejects an unknown sort and a non-boolean lowStock', () => {
    expect(
      inventoryQuerySchema.safeParse({ sort: 'price' }).error?.issues[0].path,
    ).toEqual(['sort']);
    expect(
      inventoryQuerySchema.safeParse({ lowStock: 'yes' }).error?.issues[0].path,
    ).toEqual(['lowStock']);
  });
});

describe('movementQuerySchema', () => {
  it('movementQuerySchema takes a movement type and drops search', () => {
    expect(
      movementQuerySchema.parse({ type: 'ADJUSTMENT', search: 'x' }),
    ).toEqual({ page: 1, limit: 10, type: 'ADJUSTMENT' });
    expect(
      movementQuerySchema.safeParse({ type: 'SOLD' }).error?.issues[0].path,
    ).toEqual(['type']);
  });
});
