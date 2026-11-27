import { Migration } from '@mikro-orm/migrations';

/**
 * Adds `payments.refund_reason` and brings legacy orders in line with the
 * separate cancel and refund steps: an admin cancel or return no longer
 * refunds, an order that has a refund never ships again, and an admin refunds
 * only a cancelled order.
 *
 * - C1: an unshipped order that is not cancelled but has a refund line (any
 *   status) is cancelled as a cancel does: its reservation is released (one
 *   RELEASE per item) and its PENDING charges fail with "Cancelled".
 * - C1b: a CONFIRMED order that is SHIPPING with a refund line is RETURNED and
 *   cancelled, as a RETURNED move does.
 * - C4: a COMPLETED order that is not DELIVERED, has no refund line and is
 *   paid (COD pending or paid, or a card or PayPal charge PAID) is delivered:
 *   its stock is sold (one SALE per item) and a PENDING COD charge is PAID.
 * - A CANCELLED order with a paid online charge and no refund is left for the
 *   admin's refund.
 *
 * C1 and C1b skip an order whose PENDING charge has a checkout session or a
 * transaction id: this migration has no outbox to expire the session, and a
 * charge the provider later pays would get no refund. Those orders, and the
 * COMPLETED orders C4 does not deliver, are logged for the admin.
 *
 * Before any change, `up()` stops, listing the orders and variants whose
 * stock or reservation is too short, so no check constraint fails half-way.
 *
 * `down()` drops the column only: the data fixes are not reversed.
 */

const HAS_REFUND = `exists (select 1 from payments p where p.order_id = o.id and p.deleted_at is null and p.type = 'REFUND')`;

const HAS_OPEN_CHARGE = `exists (select 1 from payments p where p.order_id = o.id and p.deleted_at is null and p.type = 'CHARGE' and p.status = 'PENDING' and (p.checkout_session_id is not null or p.transaction_id is not null))`;

const IS_PAID = `(exists (select 1 from payments p where p.order_id = o.id and p.deleted_at is null and p.type = 'CHARGE' and p.method = 'COD' and p.status in ('PENDING', 'PAID'))
  or exists (select 1 from payments p where p.order_id = o.id and p.deleted_at is null and p.type = 'CHARGE' and p.method in ('CARD', 'PAYPAL') and p.status = 'PAID'))`;

const C1_IDS = `select o.id from orders o where o.deleted_at is null and o.status in ('PENDING', 'CONFIRMED') and o.shipping_status = 'PENDING' and ${HAS_REFUND} and not ${HAS_OPEN_CHARGE}`;

const C1B_IDS = `select o.id from orders o where o.deleted_at is null and o.status = 'CONFIRMED' and o.shipping_status = 'SHIPPING' and ${HAS_REFUND} and not ${HAS_OPEN_CHARGE}`;

const C4_IDS = `select o.id from orders o where o.deleted_at is null and o.status = 'COMPLETED' and o.shipping_status in ('PENDING', 'SHIPPING') and not ${HAS_REFUND} and ${IS_PAID}`;

const SKIPPED_SQL = `select o.order_number from orders o where o.deleted_at is null and (
  (o.status in ('PENDING', 'CONFIRMED') and o.shipping_status in ('PENDING', 'SHIPPING') and ${HAS_REFUND} and ${HAS_OPEN_CHARGE})
  or (o.status = 'COMPLETED' and o.shipping_status <> 'DELIVERED' and o.id not in (${C4_IDS}))
) order by o.order_number`;

/** Each touched variant's need: reserved units released or sold, stock units sold. */
const SHORT_STOCK_SQL = `with touched as (
  select id, false as sells from (${C1_IDS}) c1
  union all select id, false from (${C1B_IDS}) c1b
  union all select id, true from (${C4_IDS}) c4
), need as (
  select i.product_variant_id,
    sum(i.quantity) as reserved_need,
    sum(case when t.sells then i.quantity else 0 end) as stock_need,
    string_agg(distinct o.order_number, ', ') as order_numbers
  from touched t
  join order_items i on i.order_id = t.id
  join orders o on o.id = t.id
  group by i.product_variant_id
)
select n.product_variant_id, n.order_numbers, n.reserved_need, n.stock_need,
  v.reserved_quantity, v.stock_quantity
from need n join product_variants v on v.id = n.product_variant_id
where v.reserved_quantity < n.reserved_need
  or v.stock_quantity < n.stock_need
  or v.stock_quantity - n.stock_need < v.reserved_quantity - n.reserved_need
order by n.product_variant_id`;

/** Cancels the target orders (and returns them when `returned`), releasing each item's reservation. */
const cancelSql = (
  ids: string,
  returned: boolean,
): string => `with target as (${ids}),
cancelled as (
  update orders set status = 'CANCELLED',${returned ? ` shipping_status = 'RETURNED',` : ''} expires_at = null, updated_at = now()
  where id in (select id from target) returning id
),
released as (
  update product_variants v set reserved_quantity = v.reserved_quantity - x.quantity, updated_at = now()
  from (select i.product_variant_id, sum(i.quantity) as quantity from order_items i
        where i.order_id in (select id from target) group by i.product_variant_id) x
  where v.id = x.product_variant_id returning v.id
),
movements as (
  insert into inventory_movements (id, product_variant_id, order_id, type, quantity, created_at)
  select gen_random_uuid(), i.product_variant_id, i.order_id, 'RELEASE', i.quantity, now()
  from order_items i where i.order_id in (select id from target) returning id
)
update payments set status = 'FAILED', failure_reason = 'Cancelled', updated_at = now()
where order_id in (select id from target) and deleted_at is null and type = 'CHARGE' and status = 'PENDING';`;

const DELIVER_SQL = `with target as (${C4_IDS}),
delivered as (
  update orders set shipping_status = 'DELIVERED', updated_at = now()
  where id in (select id from target) returning id
),
sold as (
  update product_variants v set reserved_quantity = v.reserved_quantity - x.quantity,
    stock_quantity = v.stock_quantity - x.quantity, updated_at = now()
  from (select i.product_variant_id, sum(i.quantity) as quantity from order_items i
        where i.order_id in (select id from target) group by i.product_variant_id) x
  where v.id = x.product_variant_id returning v.id
),
movements as (
  insert into inventory_movements (id, product_variant_id, order_id, type, quantity, created_at)
  select gen_random_uuid(), i.product_variant_id, i.order_id, 'SALE', i.quantity, now()
  from order_items i where i.order_id in (select id from target) returning id
)
update payments set status = 'PAID', completed_at = now(), updated_at = now()
where order_id in (select id from target) and deleted_at is null and type = 'CHARGE' and method = 'COD' and status = 'PENDING';`;

export class Migration20261127072411 extends Migration {
  override name = 'Migration20261127072411';

  override async up(): Promise<void> {
    await this.assertStockFits();
    await this.logSkipped();

    this.addSql(`alter table "payments" add "refund_reason" text null;`);
    this.addSql(cancelSql(C1_IDS, false));
    this.addSql(cancelSql(C1B_IDS, true));
    this.addSql(DELIVER_SQL);
  }

  override down(): void | Promise<void> {
    // The data fixes of up() are not reversed.
    this.addSql(`alter table "payments" drop column "refund_reason";`);
  }

  private async assertStockFits(): Promise<void> {
    const rows = await this.execute(SHORT_STOCK_SQL);
    if (rows.length === 0) return;

    const problems = rows.map(
      (row) =>
        `- variant ${String(row.product_variant_id)} (orders ${String(row.order_numbers)}): needs ${String(row.reserved_need)} reserved and ${String(row.stock_need)} in stock, has ${String(row.reserved_quantity)} reserved and ${String(row.stock_quantity)} in stock`,
    );
    throw new Error(
      `Migration20261127072411 stopped: stock does not cover the orders it would correct. Fix these rows, then run it again:\n${problems.join('\n')}`,
    );
  }

  private async logSkipped(): Promise<void> {
    const rows = await this.execute(SKIPPED_SQL);
    if (rows.length === 0) return;
    console.warn(
      `Migration20261127072411 left these orders for an admin to check: ${rows.map((row) => String(row.order_number)).join(', ')}`,
    );
  }
}
