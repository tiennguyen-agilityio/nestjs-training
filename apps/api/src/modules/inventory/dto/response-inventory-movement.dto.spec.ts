import { InventoryMovementType } from '@repo/constants';
import { ResponseInventoryMovementDto } from './response-inventory-movement.dto.js';
import { InventoryMovement } from '../../order/entities/inventory-movement.entity.js';
import { Order } from '../../order/entities/order.entity.js';
import { User } from '../../user/entities/user.entity.js';

const createdAt = new Date('2026-11-25T08:00:00.000Z');

describe('ResponseInventoryMovementDto', () => {
  it('maps an admin movement with its author and no order', () => {
    const movement = Object.assign(new InventoryMovement(), {
      id: 'movement-1',
      type: InventoryMovementType.ADJUSTMENT,
      quantity: -2,
      reason: 'Damaged bags',
      order: null,
      createdBy: Object.assign(new User(), {
        id: 'admin-1',
        firstName: 'Lan',
        lastName: 'Nguyen',
      }),
      createdAt,
    });

    expect(ResponseInventoryMovementDto.fromEntity(movement)).toEqual({
      id: 'movement-1',
      type: InventoryMovementType.ADJUSTMENT,
      quantity: -2,
      reason: 'Damaged bags',
      orderNumber: null,
      createdBy: { id: 'admin-1', firstName: 'Lan', lastName: 'Nguyen' },
      createdAt,
    });
  });

  it('maps a system movement with its order number and no author', () => {
    const movement = Object.assign(new InventoryMovement(), {
      id: 'movement-2',
      type: InventoryMovementType.RESERVE,
      quantity: 2,
      reason: null,
      order: Object.assign(new Order(), { orderNumber: 'ORD-1-ABCD' }),
      createdBy: null,
      createdAt,
    });

    expect(ResponseInventoryMovementDto.fromEntity(movement)).toMatchObject({
      orderNumber: 'ORD-1-ABCD',
      createdBy: null,
    });
  });
});
