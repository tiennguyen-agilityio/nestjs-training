import { Migration } from '@mikro-orm/migrations';

/**
 * The cart a signed-in shopper keeps on the server (ERD R4, R5, R6): one
 * `carts` row per user, one `cart_items` line per variant per cart, and a
 * quantity of at least 1. The "≤ stock" rule spans tables, so the service
 * checks it. The FKs cascade, although rows are only soft-deleted today.
 */
export class Migration20261124033943 extends Migration {
  override name = 'Migration20261124033943';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "carts" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "user_id" uuid not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "carts" add constraint "carts_user_id_unique" unique ("user_id");`,
    );

    this.addSql(
      `create table "cart_items" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "cart_id" uuid not null, "product_variant_id" uuid not null, "quantity" int not null default 1, primary key ("id"));`,
    );
    this.addSql(
      `alter table "cart_items" add constraint "cart_items_cart_id_product_variant_id_unique" unique ("cart_id", "product_variant_id");`,
    );

    this.addSql(
      `alter table "carts" add constraint "carts_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`,
    );

    this.addSql(
      `alter table "cart_items" add constraint "cart_items_cart_id_foreign" foreign key ("cart_id") references "carts" ("id") on update cascade on delete cascade;`,
    );
    this.addSql(
      `alter table "cart_items" add constraint "cart_items_product_variant_id_foreign" foreign key ("product_variant_id") references "product_variants" ("id") on update cascade on delete cascade;`,
    );
    this.addSql(
      `alter table "cart_items" add constraint "cart_items_quantity_check" check (quantity >= 1);`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "cart_items" drop constraint "cart_items_cart_id_foreign";`,
    );

    this.addSql(`drop table if exists "carts" cascade;`);
    this.addSql(`drop table if exists "cart_items" cascade;`);
  }
}
