import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';

const PREVIOUS = 'Migration20261112095501';

describe('variant columns migration (e2e)', () => {
  let orm: MikroORM;
  const categoryId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();

  const execute = <T = unknown>(sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute<T>(sql, params);

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...mikroOrmConfig,
      // Read the migrations from src (`pathTs`), so a stale build is never tested.
      preferTs: true,
      entities: [],
      entitiesTs: [],
      extensions: [Migrator],
      debug: false,
    });
  });

  afterAll(async () => {
    // Leave the test database migrated even when a step failed midway.
    await orm.migrator.up();
    await execute('delete from product_variants where id = ?', [variantId]);
    await execute('delete from products where id = ?', [productId]);
    await execute('delete from categories where id = ?', [categoryId]);
    await orm.close();
  });

  it('keeps size and stock and drops name', async () => {
    await orm.migrator.down({ to: PREVIOUS });

    await execute(
      `insert into categories (id, name, slug, created_at, updated_at)
       values (?, 'Migration category', ?, now(), now())`,
      [categoryId, `migration-category-${categoryId}`],
    );
    await execute(
      `insert into products (id, category_id, name, slug, description, roast_level,
         origin, processing_method, created_at, updated_at)
       values (?, ?, 'Migration product', ?, 'A product', 'MEDIUM', 'Brazil',
         'Washed', now(), now())`,
      [productId, categoryId, `migration-product-${productId}`],
    );
    await execute(
      `insert into product_variants (id, product_id, sku, weight, unit, name, price,
         quantity, created_at, updated_at)
       values (?, ?, ?, 250, 'G', '250G', 12, 37, now(), now())`,
      [variantId, productId, `MIG-${variantId}`],
    );

    await orm.migrator.up();

    const [row] = await execute<{ size: string; stock_quantity: number }[]>(
      'select size, stock_quantity from product_variants where id = ?',
      [variantId],
    );
    expect(row).toEqual({ size: '250.00', stock_quantity: 37 });

    const nameColumns = await execute<unknown[]>(
      `select column_name from information_schema.columns
       where table_schema = current_schema() and table_name = 'product_variants'
         and column_name = 'name'`,
    );
    expect(nameColumns).toHaveLength(0);
  });

  it('rebuilds the name as the previous code stored it on rollback', async () => {
    await orm.migrator.down({ to: PREVIOUS });

    const [row] = await execute<
      { weight: string; quantity: number; name: string }[]
    >('select weight, quantity, name from product_variants where id = ?', [
      variantId,
    ]);
    expect(row).toEqual({ weight: '250.00', quantity: 37, name: '250G' });
  });
});
