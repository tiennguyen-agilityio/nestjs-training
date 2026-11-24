import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';

const PREVIOUS = 'Migration20261124011511';
const AUDITABLE_TABLES = [
  'categories',
  'products',
  'product_variants',
  'product_images',
  'users',
];
const AUDIT_COLUMNS = ['created_by', 'updated_by', 'deleted_by'];

describe('audit columns migration (e2e)', () => {
  let orm: MikroORM;
  const categoryId = randomUUID();

  const execute = <T>(sql: string, params: unknown[] = []): Promise<T> =>
    orm.em.getConnection().execute(sql, params) as Promise<T>;

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
    await orm.migrator.up();
    await execute('delete from categories where id = ?', [categoryId]);
    await orm.close();
  });

  it('adds nullable audit columns with restrict foreign keys and keeps existing rows null', async () => {
    await orm.migrator.down({ to: PREVIOUS });

    await execute(
      `insert into categories (id, name, slug, created_at, updated_at)
       values (?, 'Audit migration category', ?, now(), now())`,
      [categoryId, `audit-migration-category-${categoryId}`],
    );

    await orm.migrator.up();

    const columns = await execute<
      {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }[]
    >(
      `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = current_schema()
         and column_name in ('created_by', 'updated_by', 'deleted_by')`,
    );
    const foreignKeys = await execute<
      {
        table_name: string;
        column_name: string;
        foreign_table: string;
        foreign_column: string;
        delete_rule: string;
      }[]
    >(
      `select kcu.table_name, kcu.column_name,
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
         and kcu.column_name in ('created_by', 'updated_by', 'deleted_by')`,
    );

    for (const table of AUDITABLE_TABLES) {
      for (const column of AUDIT_COLUMNS) {
        expect(
          columns.find(
            (c) => c.table_name === table && c.column_name === column,
          ),
        ).toEqual({
          table_name: table,
          column_name: column,
          data_type: 'uuid',
          is_nullable: 'YES',
        });
        expect(
          foreignKeys.find(
            (fk) => fk.table_name === table && fk.column_name === column,
          ),
        ).toEqual({
          table_name: table,
          column_name: column,
          foreign_table: 'users',
          foreign_column: 'id',
          delete_rule: 'RESTRICT',
        });
      }
    }

    const [row] = await execute<
      {
        created_by: string | null;
        updated_by: string | null;
        deleted_by: string | null;
      }[]
    >(
      'select created_by, updated_by, deleted_by from categories where id = ?',
      [categoryId],
    );
    expect(row).toEqual({
      created_by: null,
      updated_by: null,
      deleted_by: null,
    });
  });
});
