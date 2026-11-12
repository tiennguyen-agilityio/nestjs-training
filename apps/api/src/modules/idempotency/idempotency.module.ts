import { Module } from '@nestjs/common';
import type { Request } from 'express';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { IdempotencyModule } from '@nestjs/idempotency';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { PostgresIdempotencyStore } from './stores/postgres-idempotency.store.js';
import { IdempotencyPruneJob } from './jobs/idempotency-prune.job.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([IdempotencyKey]),
    IdempotencyModule.forRoot({
      // Keys are per user: two admins sending the same key never collide.
      scope: { http: (req: Request) => req.user?.id },
      required: true,
      // Only a success is replayed: a 4xx or 5xx releases the key, so a resend
      // runs the handler again and answers its real error code.
      storeIf: (status) => status >= 200 && status < 300,
    }),
  ],
  providers: [PostgresIdempotencyStore, IdempotencyPruneJob],
})
export class IdempotencyStoreModule {}
