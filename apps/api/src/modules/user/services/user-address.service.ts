import { Injectable } from '@nestjs/common';
import { UserAddressRepository } from '../repositories/user-address.repository.js';
import { ResponseUserAddressDto } from '../dto/response-user-address.dto.js';
import type { ActorId } from '../../../common/utils/audit.util.js';

export type AddressFields = {
  addressLine: string;
  ward: string;
  district: string;
  city: string;
  postalCode: string;
};

@Injectable()
export class UserAddressService {
  constructor(private readonly userAddressRepository: UserAddressRepository) {}

  async findMine(userId: string): Promise<ResponseUserAddressDto[]> {
    const addresses = await this.userAddressRepository.findByUser(userId);
    return addresses.map((address) =>
      ResponseUserAddressDto.fromEntity(address),
    );
  }

  async saveFirstAsDefault(
    userId: string,
    address: AddressFields,
  ): Promise<void> {
    const existing = await this.userAddressRepository.findByUser(userId);
    if (existing.length > 0) return;

    await this.userAddressRepository.create({
      userId,
      ...address,
      isDefault: true,
    });
  }

  async softDeleteAllOf(userId: string, actorId: ActorId): Promise<void> {
    const addresses = await this.userAddressRepository.findByUser(userId);
    for (const address of addresses) {
      await this.userAddressRepository.softDelete(address, actorId);
    }
  }
}
