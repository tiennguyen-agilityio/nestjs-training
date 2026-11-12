import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { TerminusModule } from '@nestjs/terminus';
import type { Mock } from 'vitest';
import {
  DATABASE_DOWN_MESSAGE,
  DATABASE_PING_CACHE_MS,
  DATABASE_PING_TIMEOUT_MS,
  DatabaseHealthIndicator,
} from './database-health.indicator.js';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let connection: { execute: Mock };

  beforeEach(async () => {
    connection = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule.forRoot({ logger: false })],
      providers: [
        DatabaseHealthIndicator,
        {
          provide: MikroORM,
          useValue: { em: { getConnection: () => connection } },
        },
      ],
    }).compile();

    indicator = module.get(DatabaseHealthIndicator);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reports up after a select 1 on a fresh connection', async () => {
    connection.execute.mockResolvedValue([{ '?column?': 1 }]);

    const result = await indicator.pingCheck('database');

    expect(result.database.status).toBe('up');
    expect(connection.execute).toHaveBeenCalledWith('select 1');
  });

  it('reports down with a fixed message when the query fails', async () => {
    connection.execute.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
    );

    const result = await indicator.pingCheck('database');

    expect(result.database).toMatchObject({
      status: 'down',
      message: DATABASE_DOWN_MESSAGE,
    });
    expect(DATABASE_DOWN_MESSAGE).toBe('Database did not answer');
    expect(JSON.stringify(result)).not.toContain('10.0.0.5');
  });

  it('shares one query between probes within DATABASE_PING_CACHE_MS', async () => {
    connection.execute.mockResolvedValue([]);

    const results = await Promise.all([
      indicator.pingCheck('database'),
      indicator.pingCheck('database'),
    ]);
    results.push(await indicator.pingCheck('database'));

    expect(DATABASE_PING_CACHE_MS).toBe(2000);
    expect(results.map((r) => r.database.status)).toEqual(['up', 'up', 'up']);
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  it('starts a new query once the cache expires, even if the last one never settled', async () => {
    vi.useFakeTimers();
    connection.execute
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValue([]);

    const hungPending = indicator.pingCheck('database');
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS + 1);
    const hung = await hungPending;
    const joined = await indicator.pingCheck('database');

    expect(hung.database.status).toBe('down');
    expect(joined.database.status).toBe('down');
    expect(connection.execute).toHaveBeenCalledTimes(1);

    // Accepted risk: the hung query is not cancelled (no driver query timeout
    // in this app); readiness still recovers once the cache window passes.
    await vi.advanceTimersByTimeAsync(DATABASE_PING_CACHE_MS + 1);
    const recovered = await indicator.pingCheck('database');

    expect(recovered.database.status).toBe('up');
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });

  it('reports down with the fixed message when the query exceeds the timeout', async () => {
    vi.useFakeTimers();
    connection.execute.mockReturnValue(new Promise(() => {}));

    const pending = indicator.pingCheck('database');
    await vi.advanceTimersByTimeAsync(DATABASE_PING_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    const result = await pending;

    expect(DATABASE_PING_TIMEOUT_MS).toBe(1000);
    expect(result.database).toMatchObject({
      status: 'down',
      message: DATABASE_DOWN_MESSAGE,
    });
  });
});
