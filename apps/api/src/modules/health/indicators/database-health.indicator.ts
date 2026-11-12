import { Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';

export const DATABASE_PING_TIMEOUT_MS = 1000;
export const DATABASE_PING_CACHE_MS = 2000;
export const DATABASE_DOWN_MESSAGE = 'Database did not answer';

/**
 * Pings the database with `select 1`. Terminus's MikroOrmHealthIndicator is not
 * used: it checks `isConnected()`, which stays false on MikroORM 7 until another
 * query opens the lazy connection, so a fresh instance would never turn ready.
 * `execute()` opens the connection itself.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly orm: MikroORM,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  // cacheFor shares one result between probes for DATABASE_PING_CACHE_MS, so a
  // probe flood starts at most one query per window, and the cached run always
  // settles (the timeout below), so readiness recovers with the database.
  // Accepted risk: a timed-out query is not cancelled and keeps its pool
  // connection; against a database that hangs, one more piles up per window
  // (timeout + cache). This app sets no driver query timeout, so its own
  // queries pile up the same way.
  async pingCheck<const Key extends string>(
    key: Key,
  ): Promise<HealthIndicatorResult<Key>> {
    return await this.healthIndicatorService
      .check(key)
      .attempt(() => this.selectOne())
      .cacheFor(DATABASE_PING_CACHE_MS);
  }

  // Own timeout instead of withTimeout: the down message stays the fixed one
  // for a timeout too (the driver's message can name the host).
  private async selectOne(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(DATABASE_DOWN_MESSAGE)),
        DATABASE_PING_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([
        this.orm.em.getConnection().execute('select 1'),
        timeout,
      ]);
    } catch {
      throw new Error(DATABASE_DOWN_MESSAGE);
    } finally {
      clearTimeout(timer);
    }
  }
}
