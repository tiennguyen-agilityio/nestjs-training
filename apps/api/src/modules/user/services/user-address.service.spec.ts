import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { UserAddressService } from './user-address.service.js';
import { UserAddressRepository } from '../repositories/user-address.repository.js';
import type { UserAddress } from '../entities/user-address.entity.js';
import type { User } from '../entities/user.entity.js';

const ADDRESS = {
  addressLine: '12 Roast Street',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh',
  postalCode: '700000',
};

const buildAddress = (overrides: Partial<UserAddress> = {}): UserAddress => ({
  id: 'address-1',
  user: { id: 'user-1' } as User,
  ...ADDRESS,
  isDefault: true,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

describe('UserAddressService', () => {
  let service: UserAddressService;
  let repository: { findByUser: Mock; create: Mock; softDelete: Mock };

  beforeEach(async () => {
    repository = {
      findByUser: vi.fn(),
      create: vi.fn(),
      softDelete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAddressService,
        { provide: UserAddressRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(UserAddressService);
  });

  describe('saveFirstAsDefault', () => {
    it('saveFirstAsDefault creates the address as default when the user has none', async () => {
      repository.findByUser.mockResolvedValue([]);

      await service.saveFirstAsDefault('user-1', ADDRESS);

      expect(repository.findByUser).toHaveBeenCalledWith('user-1');
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        addressLine: '12 Roast Street',
        ward: 'Ben Nghe',
        district: 'District 1',
        city: 'Ho Chi Minh',
        postalCode: '700000',
        isDefault: true,
      });
    });

    it('saveFirstAsDefault leaves an existing address unchanged', async () => {
      const existing = buildAddress();
      repository.findByUser.mockResolvedValue([existing]);

      await service.saveFirstAsDefault('user-1', {
        ...ADDRESS,
        addressLine: '99 Other Road',
      });

      expect(repository.create).not.toHaveBeenCalled();
      expect(existing.addressLine).toBe('12 Roast Street');
      expect(existing.isDefault).toBe(true);
    });
  });

  describe('findMine', () => {
    it('findMine maps the repository rows in order', async () => {
      repository.findByUser.mockResolvedValue([
        buildAddress({ id: 'address-default', isDefault: true }),
        buildAddress({
          id: 'address-other',
          isDefault: false,
          addressLine: '5 Side Lane',
        }),
      ]);

      const result = await service.findMine('user-1');

      expect(repository.findByUser).toHaveBeenCalledWith('user-1');
      expect(result.map((address) => address.id)).toEqual([
        'address-default',
        'address-other',
      ]);
      expect(result.map((address) => address.isDefault)).toEqual([true, false]);
      expect(result[1].addressLine).toBe('5 Side Lane');
    });
  });

  describe('softDeleteAllOf', () => {
    it('softDeleteAllOf soft-deletes every address of the user', async () => {
      const first = buildAddress({ id: 'address-1' });
      const second = buildAddress({ id: 'address-2', isDefault: false });
      repository.findByUser.mockResolvedValue([first, second]);

      await service.softDeleteAllOf('user-1', 'admin-1');

      expect(repository.findByUser).toHaveBeenCalledWith('user-1');
      expect(repository.softDelete).toHaveBeenCalledTimes(2);
      expect(repository.softDelete).toHaveBeenCalledWith(first, 'admin-1');
      expect(repository.softDelete).toHaveBeenCalledWith(second, 'admin-1');
    });
  });
});
