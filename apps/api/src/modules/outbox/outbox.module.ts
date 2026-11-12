import { DynamicModule, Module } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  OutboxModule,
  OutboxStorage,
  type OutboxModuleOptions,
} from '@nestjs/outbox';
import { fromKysely, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { OUTBOX_RETRY } from '../../configs/outbox.config.js';
import { OutboxRetentionJob } from './jobs/outbox-retention.job.js';

export type OutboxStoreModuleOptions = Pick<
  OutboxModuleOptions,
  'relay' | 'retry'
>;

/**
 * The transactional outbox on PostgreSQL. Its tables live in the `nest_outbox`
 * schema, created by a MikroORM migration: the store runs with
 * `migrate: false`, so startup fails while that migration has not run.
 *
 * The store's executor is built from MikroORM's Kysely, a documented
 * exception to the repository-only rule (`.claude/rules/coding.md`): this
 * module runs no queries of its own, and the open transaction reaches
 * `Outbox.add()` only through `BaseRepository`.
 */
@Module({})
export class OutboxStoreModule {
  static forRoot(options: OutboxStoreModuleOptions = {}): DynamicModule {
    return {
      module: OutboxStoreModule,
      imports: [OutboxModule.forRoot({ retry: OUTBOX_RETRY, ...options })],
      providers: [
        OutboxRetentionJob,
        {
          provide: PostgresOutboxStore,
          inject: [EntityManager, OutboxStorage],
          // Outside a transaction `getKysely()` is the pool's Kysely, which
          // `fromKysely` requires (it refuses a transaction).
          useFactory: (em: EntityManager, storage: OutboxStorage) =>
            new PostgresOutboxStore(
              { executor: fromKysely(em.getKysely()), migrate: false },
              storage,
            ),
        },
      ],
    };
  }
}
