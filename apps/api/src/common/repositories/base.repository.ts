import { Injectable } from '@nestjs/common';
import type {
  EntityName,
  EntityRepository,
  FilterQuery,
} from '@mikro-orm/core';
import { ChangeSetType, LockMode, RequestContext } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BaseEntity } from '../entities/base.entity.js';
import type { AuditableEntity } from '../entities/auditable.entity.js';
import { type ActorId, stampAudit } from '../utils/audit.util.js';
import {
  FindOptions,
  Criteria,
  ListOptions,
} from '../interfaces/repository-options.interface.js';
import { PaginatedResult } from '../dto/pagination.dto.js';
import { QueryParams } from '../dto/query-params.dto.js';
import { escapeLikePattern } from '../utils/like-pattern.util.js';

/**
 * The open transaction, as the persistence library's own handle (Kysely's
 * `Transaction` under MikroORM). Opaque to everyone but the code that hands it
 * to a store written for that library, such as `Outbox.add()`.
 */
export type TransactionHandle = unknown;

function isAuditable(entity: object): entity is AuditableEntity {
  return 'updatedBy' in entity;
}

/**
 * The only place that knows the persistence library. Module repositories
 * declare their `entity` and build on the ORM-agnostic operations below.
 */
@Injectable()
export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract readonly entity: EntityName<T>;

  constructor(private readonly em: EntityManager) {}

  private get repository(): EntityRepository<T> {
    return this.em.getRepository(this.entity) as EntityRepository<T>;
  }

  findById(id: string, options?: FindOptions): Promise<T | null> {
    return this.findOneBy({ id } as Criteria<T>, options);
  }

  async save(entity: T, actorId: ActorId): Promise<void> {
    this.em.persist(entity);
    this.stampAudit(entity, actorId);
    await this.em.flush();
  }

  private stampAudit(saved: T, actorId: ActorId): void {
    if (!actorId) return;

    const unitOfWork = this.em.getUnitOfWork();
    unitOfWork.computeChangeSets();

    const stamped = new Set<object>();
    for (const changeSet of unitOfWork.getChangeSets()) {
      const { entity, type } = changeSet;
      if (!isAuditable(entity)) continue;
      if (type !== ChangeSetType.CREATE && type !== ChangeSetType.UPDATE) {
        continue;
      }

      const previousDeletedAt =
        (changeSet.originalEntity as { deletedAt?: Date | null } | undefined)
          ?.deletedAt ?? null;
      stampAudit(
        entity,
        type === ChangeSetType.CREATE ? 'create' : 'update',
        actorId,
        previousDeletedAt,
      );
      stamped.add(entity);
    }

    if (isAuditable(saved) && !stamped.has(saved)) {
      stampAudit(saved, 'update', actorId, saved.deletedAt);
    }
  }

  transactional<R>(callback: () => Promise<R>): Promise<R> {
    return this.em.transactional(() => callback());
  }

  /**
   * Runs `work` in one transaction and hands it the transaction's handle, for
   * writes that must commit or roll back with this repository's (an outbox
   * message). Entity writes inside `work` join the same transaction.
   */
  protected inTransaction<R>(
    work: (tx: TransactionHandle) => Promise<R>,
  ): Promise<R> {
    return this.em.transactional((em) => work(em.getKysely()));
  }

  /**
   * Runs `work` in a persistence context of its own, for code that runs
   * outside an HTTP request (an outbox handler), where none exists.
   */
  protected inOwnContext<R>(work: () => Promise<R>): Promise<R> {
    return RequestContext.create(this.em, work);
  }

  async softDelete(entity: T, actorId: ActorId): Promise<void> {
    entity.deletedAt = new Date();
    await this.save(entity, actorId);
  }

  async restore(entity: T, actorId: ActorId): Promise<void> {
    entity.deletedAt = null;
    await this.save(entity, actorId);
  }

  protected findOneBy(
    where: Criteria<T>,
    options?: FindOptions & Pick<ListOptions<T>, 'relations'>,
  ): Promise<T | null> {
    return this.repository.findOne(
      where as FilterQuery<T>,
      this.buildFindOptions(options),
    );
  }

  protected findOneForUpdate(
    where: Criteria<T>,
    options?: Pick<ListOptions<T>, 'relations'>,
  ): Promise<T | null> {
    return this.repository.findOne(where as FilterQuery<T>, {
      ...this.buildFindOptions(options),
      lockMode: LockMode.PESSIMISTIC_WRITE,
    });
  }

  protected async insertIgnoringConflict(
    data: Record<string, unknown>,
    conflictFields: (keyof T & string)[],
  ): Promise<void> {
    await this.em.upsert(this.entity, data as never, {
      onConflictFields: conflictFields as never,
      onConflictAction: 'ignore',
      disableIdentityMap: true,
    });
  }

  protected deleteWhere(where: Criteria<T>): Promise<number> {
    return this.em.nativeDelete(this.entity, where as FilterQuery<T>);
  }

  protected countOf<R extends BaseEntity>(
    entity: EntityName<R>,
    where: Criteria<R>,
  ): Promise<number> {
    return this.em.count(entity, where as FilterQuery<R>);
  }

  protected findMany(options: ListOptions<T> = {}): Promise<T[]> {
    return this.repository.find(this.buildWhere(options), {
      ...this.buildFindOptions(options),
      ...this.buildOrderBy(options),
    });
  }

  protected async paginate(
    query: QueryParams,
    options: ListOptions<T> = {},
  ): Promise<PaginatedResult<T>> {
    const { page, limit } = query;
    const [data, totalCount] = await this.repository.findAndCount(
      this.buildWhere(options),
      {
        limit,
        offset: (page - 1) * limit,
        ...this.buildFindOptions(options),
        orderBy: [
          this.buildOrderBy(options).orderBy ?? { createdAt: 'DESC' },
          { id: 'ASC' },
        ] as never,
      },
    );

    return this.toPaginatedResult(data, totalCount, query);
  }

  protected toPaginatedResult(
    data: T[],
    totalCount: number,
    { page, limit }: QueryParams,
  ): PaginatedResult<T> {
    return {
      data,
      meta: {
        limit,
        currentPage: page,
        pageCount: Math.ceil(totalCount / limit),
        totalCount,
      },
    };
  }

  protected async createAndSave(
    data: Record<string, unknown>,
    actorId: ActorId,
  ): Promise<T> {
    const entity = this.repository.create(data as never);
    await this.save(entity, actorId);

    return entity;
  }

  private buildWhere({
    where,
    search,
    excludeId,
  }: ListOptions<T>): FilterQuery<T> {
    const conditions: Record<string, unknown> = { ...where };
    if (search?.term) {
      const pattern = `%${escapeLikePattern(search.term)}%`;
      conditions.$or = search.fields.map((field) => ({
        [field]: { $ilike: pattern },
      }));
    }
    if (excludeId) conditions.id = { $ne: excludeId };

    return conditions as FilterQuery<T>;
  }

  private buildFindOptions(
    options?: FindOptions & Pick<ListOptions<T>, 'relations'>,
  ) {
    return {
      filters: { softDelete: !options?.includeDeleted },
      ...(options?.relations && { populate: options.relations as never }),
    };
  }

  private buildOrderBy({ orderBy }: ListOptions<T>) {
    return orderBy
      ? { orderBy: { [orderBy.field]: orderBy.direction } as never }
      : {};
  }
}
