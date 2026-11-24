import { Injectable } from '@nestjs/common';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import type {
  CreateShippingMethodInput,
  ShippingMethodFilters,
  UpdateShippingMethodInput,
} from '../dto/shipping-method.schema.js';
import { ShippingMethodRepository } from '../repositories/shipping-method.repository.js';
import type { FindOptions } from '../../../common/interfaces/repository-options.interface.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { QueryParams } from '../../../common/dto/query-params.dto.js';
import type { ActorId } from '../../../common/utils/audit.util.js';
import {
  DuplicateResourceException,
  ItemNotFoundException,
} from '../../../common/exceptions/base.exception.js';

@Injectable()
export class ShippingMethodService {
  constructor(private readonly repository: ShippingMethodRepository) {}

  async create(
    dto: CreateShippingMethodInput,
    actorId: ActorId,
  ): Promise<ShippingMethod> {
    await this.assertNameFree(dto.name);

    return this.repository.create(
      { ...dto, price: String(dto.price) },
      actorId,
    );
  }

  findAll(
    query: QueryParams,
    filters: ShippingMethodFilters,
    options?: FindOptions,
  ): Promise<PaginatedResult<ShippingMethod>> {
    return this.repository.findAll(query, filters, options);
  }

  async findOne(id: string, options?: FindOptions): Promise<ShippingMethod> {
    const method = await this.repository.findById(id, options);
    if (!method) {
      throw new ItemNotFoundException({
        errCode: ERROR_CODES.SHIPPING_METHOD.NOT_FOUND,
        field: 'id',
        message: ERROR_MESSAGES.SHIPPING_METHOD.NOT_FOUND,
        description: ERROR_DESCRIPTIONS.SHIPPING_METHOD.NOT_FOUND,
      });
    }

    return method;
  }

  async update(
    id: string,
    dto: UpdateShippingMethodInput,
    actorId: ActorId,
  ): Promise<ShippingMethod> {
    const method = await this.findOne(id);

    if (dto.name !== undefined && dto.name !== method.name) {
      await this.assertNameFree(dto.name, id);
    }

    const { price, ...rest } = dto;
    Object.assign(method, rest);
    if (price !== undefined) method.price = String(price);

    await this.repository.save(method, actorId);

    return method;
  }

  async remove(id: string, actorId: ActorId): Promise<void> {
    const method = await this.findOne(id);
    await this.repository.softDelete(method, actorId);
  }

  /** Any case, deleted methods included; `ownId` is the method being renamed. */
  private async assertNameFree(name: string, ownId?: string): Promise<void> {
    const existing = await this.repository.findByName(name, {
      includeDeleted: true,
    });
    if (existing && existing.id !== ownId) {
      throw new DuplicateResourceException({
        errCode: ERROR_CODES.SHIPPING_METHOD.NAME_EXISTS,
        field: 'name',
        message: ERROR_MESSAGES.SHIPPING_METHOD.NAME_EXISTS,
        description: ERROR_DESCRIPTIONS.SHIPPING_METHOD.NAME_EXISTS,
      });
    }
  }
}
