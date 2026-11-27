import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/sql';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';
import { Migration20261127072411 } from './../../src/migrations/Migration20261127072411.js';

type Row = Record<string, unknown>;
type Exec = (sql: string, params?: unknown[]) => Promise<Row[]>;

class Rollback extends Error {}

interface SeedOrder {
  status: string;
  shipping: string;
  payments: {
    type: 'CHARGE' | 'REFUND';
    method: 'CARD' | 'PAYPAL' | 'COD';
    status: 'PENDING' | 'PAID' | 'FAILED';
    checkoutSessionId?: string;
    transactionId?: string;
  }[];
  quantity?: number;
  reserved?: number;
  stock?: number;
}

// Runs the real migration on a scratch schema holding the columns it reads or
// writes, in one transaction that is always rolled back.
describe('Migration20261127072411 legacy refund data (e2e)', () => {
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

  /** Seeds one order with one item of its own variant; returns their ids. */
  const seedOrder = async (
    exec: Exec,
    order: SeedOrder,
  ): Promise<{ orderId: string; orderNumber: string; variantId: string }> => {
    const orderId = randomUUID();
    const variantId = randomUUID();
    const orderNumber = `ORD-${orderId.slice(0, 8)}`;
    const quantity = order.quantity ?? 2;
    await exec(
      `insert into product_variants (id, stock_quantity, reserved_quantity) values (?, ?, ?)`,
      [variantId, order.stock ?? 10, order.reserved ?? quantity],
    );
    await exec(
      `insert into orders (id, order_number, status, shipping_status, expires_at) values (?, ?, ?, ?, now())`,
      [orderId, orderNumber, order.status, order.shipping],
    );
    await exec(
      `insert into order_items (id, order_id, product_variant_id, quantity) values (?, ?, ?, ?)`,
      [randomUUID(), orderId, variantId, quantity],
    );
    for (const payment of order.payments) {
      await exec(
        `insert into payments (id, order_id, type, method, status, amount, checkout_session_id, transaction_id) values (?, ?, ?, ?, ?, 50, ?, ?)`,
        [
          randomUUID(),
          orderId,
          payment.type,
          payment.method,
          payment.status,
          payment.checkoutSessionId ?? null,
          payment.transactionId ?? null,
        ],
      );
    }
    return { orderId, orderNumber, variantId };
  };

  const runOnScratchSchema = async (
    seed: (exec: Exec) => Promise<void>,
    check: (exec: Exec, schema: string, error: unknown) => Promise<void>,
  ): Promise<void> => {
    const connection = orm.em.getConnection();
    const schema = `separate_refund_${randomUUID().replaceAll('-', '')}`;

    await connection
      .transactional(async (trx) => {
        const exec: Exec = (sql, params = []) =>
          connection.execute<Row[]>(sql, params, 'all', trx);

        await exec(`create schema "${schema}"`);
        await exec(`set local search_path to "${schema}"`);
        await exec(
          `create table orders (id uuid primary key, order_number varchar(20) not null, status text not null, shipping_status text not null, expires_at timestamptz null, updated_at timestamptz not null default now(), deleted_at timestamptz null)`,
        );
        await exec(
          `create table product_variants (id uuid primary key, stock_quantity int not null, reserved_quantity int not null, updated_at timestamptz not null default now(), deleted_at timestamptz null,
           constraint product_variants_stock_quantity_check check (stock_quantity >= 0),
           constraint product_variants_reserved_quantity_check check (reserved_quantity >= 0 and reserved_quantity <= stock_quantity))`,
        );
        await exec(
          `create table order_items (id uuid primary key, order_id uuid not null, product_variant_id uuid not null, quantity int not null)`,
        );
        await exec(
          `create table payments (id uuid primary key, order_id uuid not null, type text not null, method text not null, status text not null, amount numeric(10,2) not null, checkout_session_id varchar(255) null, transaction_id varchar(255) null, completed_at timestamptz null, failure_reason text null, updated_at timestamptz not null default now(), deleted_at timestamptz null)`,
        );
        await exec(
          `create table inventory_movements (id uuid primary key, product_variant_id uuid not null, order_id uuid null, type text not null, quantity int not null, reason varchar(255) null, created_by uuid null, created_at timestamptz not null)`,
        );
        await seed(exec);

        let error: unknown;
        try {
          const migration = new Migration20261127072411(
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

  const orderOf = async (exec: Exec, id: string): Promise<Row> =>
    (
      await exec(
        `select status, shipping_status, expires_at from orders where id = ?`,
        [id],
      )
    )[0];

  const variantOf = async (exec: Exec, id: string): Promise<Row> =>
    (
      await exec(
        `select stock_quantity, reserved_quantity from product_variants where id = ?`,
        [id],
      )
    )[0];

  const movementsOf = (exec: Exec, orderId: string): Promise<Row[]> =>
    exec(
      `select type, quantity from inventory_movements where order_id = ? order by type`,
      [orderId],
    );

  const paymentsOf = (exec: Exec, orderId: string): Promise<Row[]> =>
    exec(
      `select type, method, status, failure_reason, completed_at from payments where order_id = ? order by type`,
      [orderId],
    );

  it('cancels an unshipped order with a done refund and delivers a COMPLETED pending order (AC11)', async () => {
    let refunded!: Awaited<ReturnType<typeof seedOrder>>;
    let completed!: Awaited<ReturnType<typeof seedOrder>>;

    await runOnScratchSchema(
      async (exec) => {
        refunded = await seedOrder(exec, {
          status: 'CONFIRMED',
          shipping: 'PENDING',
          payments: [
            { type: 'CHARGE', method: 'CARD', status: 'PAID' },
            { type: 'REFUND', method: 'CARD', status: 'PAID' },
          ],
          quantity: 2,
          reserved: 2,
          stock: 10,
        });
        completed = await seedOrder(exec, {
          status: 'COMPLETED',
          shipping: 'PENDING',
          payments: [{ type: 'CHARGE', method: 'COD', status: 'PENDING' }],
          quantity: 1,
          reserved: 1,
          stock: 5,
        });
      },
      async (exec, schema, error) => {
        expect(error).toBeUndefined();

        expect(await orderOf(exec, refunded.orderId)).toEqual({
          status: 'CANCELLED',
          shipping_status: 'PENDING',
          expires_at: null,
        });
        expect(await variantOf(exec, refunded.variantId)).toEqual({
          stock_quantity: 10,
          reserved_quantity: 0,
        });
        expect(await movementsOf(exec, refunded.orderId)).toEqual([
          { type: 'RELEASE', quantity: 2 },
        ]);
        expect(
          (await paymentsOf(exec, refunded.orderId)).map((p) => p.status),
        ).toEqual(['PAID', 'PAID']);

        expect((await orderOf(exec, completed.orderId)).shipping_status).toBe(
          'DELIVERED',
        );
        expect(await variantOf(exec, completed.variantId)).toEqual({
          stock_quantity: 4,
          reserved_quantity: 0,
        });
        expect(await movementsOf(exec, completed.orderId)).toEqual([
          { type: 'SALE', quantity: 1 },
        ]);
        const [cod] = await paymentsOf(exec, completed.orderId);
        expect(cod.status).toBe('PAID');
        expect(cod.completed_at).not.toBeNull();

        const [column] = await exec(
          `select is_nullable, data_type from information_schema.columns where table_schema = ? and table_name = 'payments' and column_name = 'refund_reason'`,
          [schema],
        );
        expect(column).toEqual({ is_nullable: 'YES', data_type: 'text' });
      },
    );
  });

  it('fails the pending charges of an unshipped order it cancels', async () => {
    let order!: Awaited<ReturnType<typeof seedOrder>>;

    await runOnScratchSchema(
      async (exec) => {
        order = await seedOrder(exec, {
          status: 'PENDING',
          shipping: 'PENDING',
          payments: [
            { type: 'CHARGE', method: 'COD', status: 'PENDING' },
            { type: 'REFUND', method: 'CARD', status: 'FAILED' },
          ],
        });
      },
      async (exec, _schema, error) => {
        expect(error).toBeUndefined();
        expect((await orderOf(exec, order.orderId)).status).toBe('CANCELLED');
        const [charge, refund] = await paymentsOf(exec, order.orderId);
        expect(charge).toMatchObject({
          status: 'FAILED',
          failure_reason: 'Cancelled',
        });
        expect(refund.status).toBe('FAILED');
      },
    );
  });

  it('returns a shipping order that already has a refund', async () => {
    let order!: Awaited<ReturnType<typeof seedOrder>>;

    await runOnScratchSchema(
      async (exec) => {
        order = await seedOrder(exec, {
          status: 'CONFIRMED',
          shipping: 'SHIPPING',
          payments: [
            { type: 'CHARGE', method: 'PAYPAL', status: 'PAID' },
            { type: 'REFUND', method: 'PAYPAL', status: 'FAILED' },
          ],
          quantity: 3,
          reserved: 3,
        });
      },
      async (exec, _schema, error) => {
        expect(error).toBeUndefined();
        expect(await orderOf(exec, order.orderId)).toEqual({
          status: 'CANCELLED',
          shipping_status: 'RETURNED',
          expires_at: null,
        });
        expect((await variantOf(exec, order.variantId)).reserved_quantity).toBe(
          0,
        );
        expect(await movementsOf(exec, order.orderId)).toEqual([
          { type: 'RELEASE', quantity: 3 },
        ]);
      },
    );
  });

  it('skips orders with an open checkout session, a refund on a COMPLETED order, or a RETURNED COMPLETED order', async () => {
    const seeded: Awaited<ReturnType<typeof seedOrder>>[] = [];
    const before: SeedOrder[] = [
      {
        status: 'CONFIRMED',
        shipping: 'PENDING',
        payments: [
          { type: 'CHARGE', method: 'CARD', status: 'PAID' },
          {
            type: 'CHARGE',
            method: 'CARD',
            status: 'PENDING',
            checkoutSessionId: 'cs_open',
          },
          { type: 'REFUND', method: 'CARD', status: 'PAID' },
        ],
      },
      {
        status: 'PENDING',
        shipping: 'PENDING',
        payments: [
          {
            type: 'CHARGE',
            method: 'PAYPAL',
            status: 'PENDING',
            transactionId: 'pp_review',
          },
          { type: 'REFUND', method: 'PAYPAL', status: 'FAILED' },
        ],
      },
      {
        status: 'COMPLETED',
        shipping: 'SHIPPING',
        payments: [
          { type: 'CHARGE', method: 'CARD', status: 'PAID' },
          { type: 'REFUND', method: 'CARD', status: 'PAID' },
        ],
      },
      {
        status: 'COMPLETED',
        shipping: 'RETURNED',
        payments: [{ type: 'CHARGE', method: 'COD', status: 'PENDING' }],
        reserved: 0,
      },
      {
        status: 'COMPLETED',
        shipping: 'PENDING',
        payments: [{ type: 'CHARGE', method: 'COD', status: 'FAILED' }],
      },
      {
        status: 'COMPLETED',
        shipping: 'PENDING',
        payments: [{ type: 'CHARGE', method: 'CARD', status: 'PENDING' }],
      },
    ];

    await runOnScratchSchema(
      async (exec) => {
        for (const order of before) seeded.push(await seedOrder(exec, order));
      },
      async (exec, _schema, error) => {
        expect(error).toBeUndefined();
        for (const [index, { orderId, variantId }] of seeded.entries()) {
          const order = await orderOf(exec, orderId);
          expect(order).toMatchObject({
            status: before[index].status,
            shipping_status: before[index].shipping,
          });
          expect(order.expires_at).not.toBeNull();
          expect(await movementsOf(exec, orderId)).toEqual([]);
          expect(await variantOf(exec, variantId)).toEqual({
            stock_quantity: 10,
            reserved_quantity: before[index].reserved ?? 2,
          });
        }
      },
    );
  });

  it('leaves a cancelled paid order without a refund as it is', async () => {
    let order!: Awaited<ReturnType<typeof seedOrder>>;

    await runOnScratchSchema(
      async (exec) => {
        order = await seedOrder(exec, {
          status: 'CANCELLED',
          shipping: 'PENDING',
          payments: [{ type: 'CHARGE', method: 'CARD', status: 'PAID' }],
          reserved: 0,
        });
      },
      async (exec, _schema, error) => {
        expect(error).toBeUndefined();
        expect(await orderOf(exec, order.orderId)).toMatchObject({
          status: 'CANCELLED',
          shipping_status: 'PENDING',
        });
        expect(await movementsOf(exec, order.orderId)).toEqual([]);
        expect(await paymentsOf(exec, order.orderId)).toEqual([
          expect.objectContaining({ type: 'CHARGE', status: 'PAID' }),
        ]);
      },
    );
  });

  it('stops and lists the orders whose reservation is short', async () => {
    let order!: Awaited<ReturnType<typeof seedOrder>>;

    await runOnScratchSchema(
      async (exec) => {
        order = await seedOrder(exec, {
          status: 'CONFIRMED',
          shipping: 'PENDING',
          payments: [
            { type: 'CHARGE', method: 'CARD', status: 'PAID' },
            { type: 'REFUND', method: 'CARD', status: 'PAID' },
          ],
          quantity: 3,
          reserved: 1,
        });
      },
      async (exec, schema, error) => {
        expect(error).toBeInstanceOf(Error);
        const { message } = error as Error;
        expect(message).toContain(
          'Migration20261127072411 stopped: stock does not cover',
        );
        expect(message).toContain(order.orderNumber);
        expect(message).toContain(order.variantId);

        expect((await orderOf(exec, order.orderId)).status).toBe('CONFIRMED');
        expect(await movementsOf(exec, order.orderId)).toEqual([]);
        const columns = await exec(
          `select 1 from information_schema.columns where table_schema = ? and table_name = 'payments' and column_name = 'refund_reason'`,
          [schema],
        );
        expect(columns).toEqual([]);
      },
    );
  });
});
