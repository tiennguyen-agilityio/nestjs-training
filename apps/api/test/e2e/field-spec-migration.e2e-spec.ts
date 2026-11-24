import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/sql';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';
import { Migration20261124011511 } from './../../src/migrations/Migration20261124011511.js';

type Row = Record<string, unknown>;
type Exec = (sql: string, params?: unknown[]) => Promise<Row[]>;

class Rollback extends Error {}

// Runs the real migration on a scratch schema holding the pre-migration
// columns it reads or alters, in one transaction that is always rolled back.
describe('Migration20261124011511 data check (e2e)', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
    }).compile();
    await moduleRef.init();
    orm = moduleRef.get(MikroORM);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const runOnScratchSchema = async (
    seed: (exec: Exec) => Promise<void>,
    check: (exec: Exec, schema: string, error: unknown) => Promise<void>,
  ): Promise<void> => {
    const connection = orm.em.getConnection();
    const schema = `field_spec_${randomUUID().replaceAll('-', '')}`;

    await connection
      .transactional(async (trx) => {
        const exec: Exec = (sql, params = []) =>
          connection.execute<Row[]>(sql, params, 'all', trx);

        await exec(`create schema "${schema}"`);
        await exec(`set local search_path to "${schema}"`);
        await exec(
          `create table users (id uuid primary key, first_name varchar(255) not null, last_name varchar(255) not null, phone_number varchar(255) null)`,
        );
        await exec(
          `create table categories (id uuid primary key, name varchar(255) not null)`,
        );
        await exec(
          `create table products (id uuid primary key, name varchar(255) not null)`,
        );
        await exec(
          `create table product_images (id uuid primary key, product_id uuid not null, deleted_at timestamptz null, sort_order int not null default 0)`,
        );
        await seed(exec);

        let error: unknown;
        try {
          const migration = new Migration20261124011511(
            orm.em.getDriver() as AbstractSqlDriver,
            orm.config,
          );
          migration.setTransactionContext(trx);
          await migration.up();
          for (const query of migration.getQueries()) {
            await connection.execute(query, [], 'run', trx);
          }
        } catch (caught) {
          error = caught;
        }

        await check(exec, schema, error);
        throw new Rollback();
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof Rollback)) throw caught;
      });
  };

  const columnOf = async (
    exec: Exec,
    schema: string,
    table: string,
    column: string,
  ): Promise<Row> => {
    const [row] = await exec(
      `select character_maximum_length, is_nullable from information_schema.columns
       where table_schema = ? and table_name = ? and column_name = ?`,
      [schema, table, column],
    );
    return row;
  };

  const constraintCount = async (exec: Exec, schema: string) => {
    const [row] = await exec(
      `select count(*)::int as count from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where n.nspname = ? and c.conname = 'product_images_product_id_sort_order_unique'`,
      [schema],
    );
    return row.count;
  };

  it('stops on a 130-character category name, naming the row, changing nothing', async () => {
    const id = randomUUID();
    const name = 'c'.repeat(130);

    await runOnScratchSchema(
      (exec) => exec(`insert into categories values (?, ?)`, [id, name]).then(),
      async (exec, schema, error) => {
        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toContain(
          'Migration20261124011511 stopped: rows do not fit the field specifications',
        );
        expect(message).toContain('categories');
        expect(message).toContain(id);
        expect(message).toContain('130');

        expect(await columnOf(exec, schema, 'categories', 'name')).toEqual({
          character_maximum_length: 255,
          is_nullable: 'NO',
        });
        expect(await exec(`select name from categories`)).toEqual([{ name }]);
      },
    );
  });

  it('stops on two live images of one product at sort order 2, naming both, changing nothing', async () => {
    const productId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();

    await runOnScratchSchema(
      async (exec) => {
        await exec(`insert into product_images values (?, ?, null, 2)`, [
          first,
          productId,
        ]);
        await exec(`insert into product_images values (?, ?, null, 2)`, [
          second,
          productId,
        ]);
      },
      async (exec, schema, error) => {
        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toContain(productId);
        expect(message).toContain('sort_order 2');
        expect(message).toContain(first);
        expect(message).toContain(second);

        expect(
          await columnOf(exec, schema, 'product_images', 'sort_order'),
        ).toMatchObject({ is_nullable: 'NO' });
        expect(await constraintCount(exec, schema)).toBe(0);
      },
    );
  });

  it('stops and lists every row that does not fit, changing nothing', async () => {
    const longLastName = randomUUID();
    const longPhone = randomUUID();
    const productId = randomUUID();

    await runOnScratchSchema(
      async (exec) => {
        await exec(`insert into users values (?, 'Jane', ?, null)`, [
          longLastName,
          'l'.repeat(121),
        ]);
        await exec(`insert into users values (?, 'Jane', 'Doe', ?)`, [
          longPhone,
          '01234567890',
        ]);
        await exec(`insert into products values (?, ?)`, [
          productId,
          'p'.repeat(125),
        ]);
      },
      async (exec, schema, error) => {
        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toContain(longLastName);
        expect(message).toContain('last_name');
        expect(message).toContain(longPhone);
        expect(message).toContain('phone_number');
        expect(message).toContain(productId);
        expect(message).toContain('125');

        expect(await columnOf(exec, schema, 'users', 'phone_number')).toEqual({
          character_maximum_length: 255,
          is_nullable: 'YES',
        });
      },
    );
  });

  it('ignores duplicate positions of soft-deleted images', async () => {
    const productId = randomUUID();

    await runOnScratchSchema(
      async (exec) => {
        await exec(`insert into product_images values (?, ?, now(), 2)`, [
          randomUUID(),
          productId,
        ]);
        await exec(`insert into product_images values (?, ?, null, 2)`, [
          randomUUID(),
          productId,
        ]);
      },
      (_exec, _schema, error) => {
        expect(error).toBeUndefined();
        return Promise.resolve();
      },
    );
  });

  it('keeps every value of data that fits', async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    const live = randomUUID();
    const deleted = randomUUID();
    const firstName = 'f'.repeat(120);

    await runOnScratchSchema(
      async (exec) => {
        await exec(`insert into users values (?, ?, 'Doe', '0987654321')`, [
          userId,
          firstName,
        ]);
        await exec(`insert into categories values (?, 'Single Origin')`, [
          categoryId,
        ]);
        await exec(`insert into products values (?, 'Ethiopia Guji')`, [
          productId,
        ]);
        await exec(`insert into product_images values (?, ?, null, 3)`, [
          live,
          productId,
        ]);
        await exec(`insert into product_images values (?, ?, now(), 3)`, [
          deleted,
          productId,
        ]);
      },
      async (exec, schema, error) => {
        expect(error).toBeUndefined();

        expect(
          await exec(`select first_name, last_name, phone_number from users`),
        ).toEqual([
          {
            first_name: firstName,
            last_name: 'Doe',
            phone_number: '0987654321',
          },
        ]);
        expect(await exec(`select name from categories`)).toEqual([
          { name: 'Single Origin' },
        ]);
        expect(await exec(`select name from products`)).toEqual([
          { name: 'Ethiopia Guji' },
        ]);
        expect(
          await exec(
            `select id, sort_order from product_images order by sort_order nulls last`,
          ),
        ).toEqual([
          { id: live, sort_order: 3 },
          { id: deleted, sort_order: null },
        ]);

        expect(await columnOf(exec, schema, 'users', 'first_name')).toEqual({
          character_maximum_length: 120,
          is_nullable: 'NO',
        });
        expect(await columnOf(exec, schema, 'users', 'phone_number')).toEqual({
          character_maximum_length: 10,
          is_nullable: 'YES',
        });
        expect(
          await columnOf(exec, schema, 'categories', 'name'),
        ).toMatchObject({ character_maximum_length: 120 });
        expect(await columnOf(exec, schema, 'products', 'name')).toMatchObject({
          character_maximum_length: 120,
        });
        expect(await constraintCount(exec, schema)).toBe(1);
      },
    );
  });
});
