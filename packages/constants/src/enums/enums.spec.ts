import { ProductSortBy, ProductStatus, RoastLevel } from './product.enum.js';
import { DiscountType, ProductUnit } from './product-variant.enum.js';
import { UserRole, UserStatus } from './user.enum.js';
import { ShippingMethodStatus } from './shipping-method.enum.js';
import {
  InventoryMovementType,
  StockLevel,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from './order.enum.js';

describe('shared enums', () => {
  it('DiscountType has the API values', () => {
    expect(Object.values(DiscountType)).toEqual(['PERCENT', 'FIXED']);
  });

  it('ProductUnit has the API values in the API order', () => {
    expect(Object.values(ProductUnit)).toEqual(['KG', 'G', 'ML', 'L']);
  });

  it('RoastLevel has the API values', () => {
    expect(Object.values(RoastLevel)).toEqual(['LIGHT', 'MEDIUM', 'DARK']);
  });

  it('ProductStatus has the API values', () => {
    expect(Object.values(ProductStatus)).toEqual([
      'DRAFT',
      'ACTIVE',
      'INACTIVE',
      'ARCHIVED',
    ]);
  });

  it('ProductSortBy has the API values', () => {
    expect(Object.values(ProductSortBy)).toEqual([
      'NAME_ASC',
      'NAME_DESC',
      'PRICE_ASC',
      'PRICE_DESC',
    ]);
  });

  it('UserRole has the API values', () => {
    expect(Object.values(UserRole)).toEqual(['ADMIN', 'USER']);
  });

  it('UserStatus has the API values', () => {
    expect(Object.values(UserStatus)).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('ShippingMethodStatus has the API values', () => {
    expect(Object.values(ShippingMethodStatus)).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('ShippingMethodStatus is the only shipping-method enum', async () => {
    const enums: object = await import('./shipping-method.enum.js');

    expect(Object.keys(enums)).toEqual(['ShippingMethodStatus']);
  });

  it('order enums hold the ERD values', () => {
    expect(Object.values(OrderStatus)).toEqual([
      'PENDING',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(Object.values(ShippingStatus)).toEqual([
      'PENDING',
      'SHIPPING',
      'DELIVERED',
      'RETURNED',
    ]);
    expect(Object.values(PaymentMethod)).toEqual(['COD', 'CARD', 'PAYPAL']);
    expect(Object.values(PaymentType)).toEqual(['CHARGE', 'REFUND']);
    expect(Object.values(PaymentStatus)).toEqual(['PENDING', 'PAID', 'FAILED']);
    expect(Object.values(OrderPaymentStatus)).toEqual([
      'UNPAID',
      'PENDING',
      'PAID',
      'FAILED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]);
    expect(Object.values(InventoryMovementType)).toEqual([
      'RESERVE',
      'RELEASE',
      'SALE',
      'RESTOCK',
      'ADJUSTMENT',
    ]);
  });

  it('StockLevel has OUT, LOW, OK', () => {
    expect(Object.values(StockLevel)).toEqual(['OUT', 'LOW', 'OK']);
  });
});
