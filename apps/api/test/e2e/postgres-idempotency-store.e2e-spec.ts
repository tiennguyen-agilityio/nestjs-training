import { Test, TestingModule } from '@nestjs/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/core';
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';
import { IdempotencyStoreModule } from './../../src/modules/idempotency/idempotency.module.js';
import { IdempotencyKey } from './../../src/modules/idempotency/entities/idempotency-key.entity.js';
import { PostgresIdempotencyStore } from './../../src/modules/idempotency/stores/postgres-idempotency.store.js';

describe('PostgresIdempotencyStore (e2e)', () => {
  let moduleRef: TestingModule;
  let store: PostgresIdempotencyStore;
  let orm: MikroORM;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [MikroOrmModule.forRoot(mikroOrmConfig), IdempotencyStoreModule],
    }).compile();
    await moduleRef.init();
    store = moduleRef.get(PostgresIdempotencyStore);
    orm = moduleRef.get(MikroORM);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await orm.em.getConnection().execute('delete from idempotency_keys');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('registers itself as the idempotency store', () => {
    expect(moduleRef.get(IdempotencyStorage).source).toBe(store);
  });

  describe('IdempotencyStore contract', () => {
    for (const c of idempotencyStoreContract(() => store, {
      advanceTime: (ms) => vi.setSystemTime(Date.now() + ms),
      concurrent: true,
    })) {
      it(c.name, c.run);
    }
  });

  it('prune deletes expired records and keeps live ones', async () => {
    await store.acquire('expired', 'o1', 'f', 10);
    await store.acquire('live', 'o2', 'f', 60_000);
    vi.setSystemTime(Date.now() + 11);

    expect(await store.prune()).toBe(1);
    await expect(store.acquire('live', 'o3', 'f', 10)).resolves.toEqual({
      state: 'in-flight',
      fingerprint: 'f',
    });
  });

  it('maps expires_at to a number when read through the entity', async () => {
    await store.acquire('typed', 'o1', 'f', 60_000);

    const [row] = await orm.em.fork().find(IdempotencyKey, {});

    expect(typeof row.expiresAt).toBe('number');
  });
});
