import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

/**
 * One `@nestjs/idempotency` record (the docs' PostgreSQL layout). It defines
 * the table and its migration only: `PostgresIdempotencyStore` reads and
 * writes it with SQL, never through this entity.
 */
@Entity({ tableName: 'idempotency_keys' })
export class IdempotencyKey {
  /** SHA-256 hex of the record key: the unique constraint `acquire` relies on. */
  @PrimaryKey({ type: 'text' })
  keyHash!: string;

  @Property({ type: 'text' })
  key!: string;

  @Property({ type: 'text' })
  fingerprint!: string;

  /** Fencing token of the attempt holding the lock; null once completed. */
  @Property({ type: 'text', nullable: true })
  owner?: string | null;

  /** Null while in flight. */
  @Property({ type: 'json', columnType: 'json', nullable: true })
  response?: unknown;

  /** Epoch milliseconds. */
  @Index()
  @Property({ type: 'bigint' })
  expiresAt!: number;
}
