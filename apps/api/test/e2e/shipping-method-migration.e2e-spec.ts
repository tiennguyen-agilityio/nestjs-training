import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';

const PREVIOUS = 'Migration20261124035504';

// The two methods the website used before this migration (DELIVERY_SPEED in
// apps/web/src/constants/order.ts).
const SEEDED = [
  {
    id: '9a227cdd-9e98-4c3d-99e4-ff74a2c5ffa6',
    name: 'Artisanal Standard',
    description: '3-5 business days',
    price: '0.00',
    status: 'ACTIVE',
    deleted_at: null,
  },
  {
    id: '7f7ebc14-0a2a-4b47-9423-7b107a00f35d',
    name: 'Roast Express',
    description: '1-2 business days',
    price: '12.00',
    status: 'ACTIVE',
    deleted_at: null,
  },
];
const AUDIT_COLUMNS = ['created_by', 'updated_by', 'deleted_by'];

describe('shipping methods migration (e2e)', () => {
  let orm: MikroORM;

  const execute = <T = unknown>(sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute<T>(sql, params);

  const insertMethod = (name: string, deleted: boolean) =>
    execute(
      `insert into shipping_methods (id, name, description, price, status,
         created_at, updated_at, deleted_at)
       values (?, ?, 'A method', 5, 'ACTIVE', now(), now(), ${deleted ? 'now()' : 'null'})`,
      [randomUUID(), name],
    );

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
    await orm.close();
  });

  it('the migration seeds Artisanal Standard and Roast Express with the DELIVERY_SPEED ids', async () => {
    await orm.migrator.down({ to: PREVIOUS });
    await orm.migrator.up();

    const rows = await execute(
      'select id, name, description, price, status, deleted_at from shipping_methods order by name',
    );
    expect(rows).toEqual(SEEDED);
  });

  it('the unique index rejects a name that differs only in case', async () => {
    await orm.migrator.down({ to: PREVIOUS });
    await orm.migrator.up();

    await expect(insertMethod('roast express', false)).rejects.toMatchObject({
      code: '23505',
    });
    await expect(insertMethod('ROAST EXPRESS', true)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('the migration adds created_by, updated_by, deleted_by', async () => {
    await orm.migrator.down({ to: PREVIOUS });
    await orm.migrator.up();

    const columns = await execute<
      { column_name: string; data_type: string; is_nullable: string }[]
    >(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = current_schema()
         and table_name = 'shipping_methods'
         and column_name in ('created_by', 'updated_by', 'deleted_by')
       order by column_name`,
    );
    const foreignKeys = await execute<
      {
        column_name: string;
        foreign_table: string;
        foreign_column: string;
        delete_rule: string;
      }[]
    >(
      `select kcu.column_name,
              ccu.table_name as foreign_table, ccu.column_name as foreign_column,
              rc.delete_rule
       from information_schema.referential_constraints rc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = rc.constraint_name
        and kcu.constraint_schema = rc.constraint_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = rc.unique_constraint_name
        and ccu.constraint_schema = rc.unique_constraint_schema
       where kcu.table_schema = current_schema()
         and kcu.table_name = 'shipping_methods'
         and kcu.column_name in ('created_by', 'updated_by', 'deleted_by')`,
    );

    for (const column of AUDIT_COLUMNS) {
      expect(columns.find((c) => c.column_name === column)).toEqual({
        column_name: column,
        data_type: 'uuid',
        is_nullable: 'YES',
      });
      expect(foreignKeys.find((fk) => fk.column_name === column)).toEqual({
        column_name: column,
        foreign_table: 'users',
        foreign_column: 'id',
        delete_rule: 'RESTRICT',
      });
    }

    const rows = await execute<
      {
        created_by: string | null;
        updated_by: string | null;
        deleted_by: string | null;
      }[]
    >(
      'select created_by, updated_by, deleted_by from shipping_methods where id in (?, ?)',
      SEEDED.map((method) => method.id),
    );
    expect(rows).toEqual([
      { created_by: null, updated_by: null, deleted_by: null },
      { created_by: null, updated_by: null, deleted_by: null },
    ]);
  });

  it('down() drops the table', async () => {
    await orm.migrator.down({ to: PREVIOUS });

    const tables = await execute<unknown[]>(
      `select table_name from information_schema.tables
       where table_schema = current_schema() and table_name = 'shipping_methods'`,
    );
    expect(tables).toHaveLength(0);
  });
});
