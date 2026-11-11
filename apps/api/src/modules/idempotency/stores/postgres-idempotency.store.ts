import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { QueryResult } from '@mikro-orm/postgresql';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';

const ACQUIRE_ROUNDS = 5;
const DEFAULT_PRUNE_LIMIT = 1000;

interface RecordRow {
  fingerprint: string;
  response: IdempotencyStoredPayload | null;
}

/**
 * The `@nestjs/idempotency` store on the `idempotency_keys` table, after the
 * docs' PostgreSQL store. Every write is one conditional statement, so two
 * callers racing for a key can never both acquire it. "Now" is `Date.now()`
 * in the app, never Postgres `now()`, so tests can move the clock.
 *
 * It runs its own SQL outside `BaseRepository`, a documented exception
 * (`.claude/rules/coding.md`).
 */
@Injectable()
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly em: EntityManager,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const keyHash = hashKey(key);

    for (let round = 0; round < ACQUIRE_ROUNDS; round++) {
      const now = Date.now();
      // Inserts a new record, or takes over an expired one; a live one is left alone.
      const taken = await this.execute<{ key_hash: string }[]>(
        `insert into idempotency_keys (key_hash, key, fingerprint, owner, response, expires_at)
         values (?, ?, ?, ?, null, ?)
         on conflict (key_hash) do update
           set key = excluded.key, fingerprint = excluded.fingerprint, owner = excluded.owner,
               response = null, expires_at = excluded.expires_at
           where idempotency_keys.expires_at <= ?
         returning key_hash`,
        [keyHash, key, fingerprint, owner, now + lockTtl, now],
        'all',
      );
      if (taken.length > 0) return { state: 'acquired' };

      const [row] = await this.execute<RecordRow[]>(
        `select fingerprint, response from idempotency_keys
         where key_hash = ? and expires_at > ?`,
        [keyHash, now],
        'all',
      );
      // Gone between the two statements (expired or released): try again.
      if (!row) continue;

      return row.response === null
        ? { state: 'in-flight', fingerprint: row.fingerprint }
        : {
            state: 'completed',
            fingerprint: row.fingerprint,
            response: row.response,
          };
    }

    throw new Error('idempotency acquire did not settle');
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const now = Date.now();
    return this.changedOne(
      `update idempotency_keys set response = ?, owner = null, expires_at = ?
       where key_hash = ? and owner = ? and expires_at > ?`,
      [JSON.stringify(response), now + ttl, hashKey(key), owner, now],
    );
  }

  async release(key: string, owner: string): Promise<boolean> {
    return this.changedOne(
      `delete from idempotency_keys
       where key_hash = ? and owner = ? and expires_at > ?`,
      [hashKey(key), owner, Date.now()],
    );
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const now = Date.now();
    return this.changedOne(
      `update idempotency_keys set expires_at = ?
       where key_hash = ? and owner = ? and expires_at > ?`,
      [now + lockTtl, hashKey(key), owner, now],
    );
  }

  /** Deletes up to `limit` expired records; returns how many. */
  async prune(limit = DEFAULT_PRUNE_LIMIT): Promise<number> {
    const result = await this.execute<QueryResult>(
      `delete from idempotency_keys where key_hash in (
         select key_hash from idempotency_keys where expires_at <= ? limit ?
       )`,
      [Date.now(), limit],
      'run',
    );
    return result.affectedRows;
  }

  private async changedOne(sql: string, params: unknown[]): Promise<boolean> {
    const result = await this.execute<QueryResult>(sql, params, 'run');
    return result.affectedRows === 1;
  }

  private execute<T extends QueryResult | object[]>(
    sql: string,
    params: unknown[],
    method: 'all' | 'run',
  ): Promise<T> {
    return this.em.getConnection().execute<T>(sql, params, method);
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
