import { Injectable } from '@nestjs/common';
import { UserAddress } from '../entities/user-address.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';

export type CreateUserAddressData = {
  userId: string;
  addressLine: string;
  ward: string;
  district: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
};

@Injectable()
export class UserAddressRepository extends BaseRepository<UserAddress> {
  protected readonly entity = UserAddress;

  async findByUser(userId: string): Promise<UserAddress[]> {
    const addresses = await this.findMany({
      where: { user: userId },
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });
    return addresses.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  create({ userId, ...data }: CreateUserAddressData): Promise<UserAddress> {
    return this.createAndSave({ ...data, user: userId }, null);
  }
}
