import { ResponseUserAddressDto } from './response-user-address.dto.js';
import type { UserAddress } from '../entities/user-address.entity.js';
import type { User } from '../entities/user.entity.js';

describe('ResponseUserAddressDto', () => {
  const createdAt = new Date('2026-11-01T00:00:00.000Z');
  const updatedAt = new Date('2026-11-02T00:00:00.000Z');
  const address = {
    id: 'address-1',
    user: { id: 'user-1' } as User,
    addressLine: '12 Roast Street',
    ward: 'Ben Nghe',
    district: 'District 1',
    city: 'Ho Chi Minh',
    postalCode: '700000',
    isDefault: true,
    createdAt,
    updatedAt,
    deletedAt: null,
  } as UserAddress;

  it('fromEntity maps the ADDR shape', () => {
    const json = JSON.parse(
      JSON.stringify(ResponseUserAddressDto.fromEntity(address)),
    ) as Record<string, unknown>;

    expect(json).toEqual({
      id: 'address-1',
      userId: 'user-1',
      addressLine: '12 Roast Street',
      ward: 'Ben Nghe',
      district: 'District 1',
      city: 'Ho Chi Minh',
      postalCode: '700000',
      isDefault: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(json).not.toHaveProperty('deletedAt');
  });
});
