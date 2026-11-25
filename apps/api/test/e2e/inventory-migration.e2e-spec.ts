import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';

describe('inventory migration (e2e)', () => {
  let orm: MikroORM;

  const execute = <T = unknown>(sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute<T>(sql, params);

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...mikroOrmConfig,
      preferTs: true,
      entities: [],
      entitiesTs: [],
      extensions: [Migrator],
      debug: false,
    });
  });

  afterAll(async () => {
    await orm.close();
  });

  it('adds the (product_variant_id, created_at) index on inventory_movements', async () => {
    const rows = await execute<{ indexdef: string }[]>(
      "select indexdef from pg_indexes where tablename = 'inventory_movements' and indexname = 'inventory_movements_product_variant_id_created_at_index'",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('(product_variant_id, created_at)');
  });

  it('keeps the restrict foreign key from inventory_movements.created_by to users', async () => {
    const rows = await execute<{ confdeltype: string; target: string }[]>(
      "select c.confdeltype, c.confrelid::regclass::text as target from pg_constraint c where c.conname = 'inventory_movements_created_by_foreign'",
    );

    expect(rows).toEqual([{ confdeltype: 'r', target: 'users' }]);
  });
});
