import { Migration } from '@mikro-orm/migrations';

export class Migration20261124103259 extends Migration {
  override name = 'Migration20261124103259';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "orders" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "created_by" uuid null, "updated_by" uuid null, "deleted_by" uuid null, "user_id" uuid not null, "shipping_method_id" uuid not null, "order_number" varchar(20) not null, "status" text not null default 'PENDING', "shipping_status" text not null default 'PENDING', "recipient_name" varchar(120) not null, "recipient_phone" varchar(10) not null, "address_line" varchar(255) not null, "ward" varchar(255) not null, "district" varchar(255) not null, "city" varchar(255) not null, "postal_code" varchar(20) not null, "shipping_method_name" varchar(120) not null, "shipping_fee" numeric(10,2) not null, "tax" numeric(10,2) not null, "total_amount" numeric(10,2) not null, "note" text null, "expires_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_order_number_unique" unique ("order_number");`,
    );

    this.addSql(
      `create table "payments" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "created_by" uuid null, "updated_by" uuid null, "deleted_by" uuid null, "order_id" uuid not null, "type" text not null default 'CHARGE', "method" text not null, "status" text not null default 'PENDING', "amount" numeric(10,2) not null, "currency" char(3) not null default 'USD', "transaction_id" varchar(255) null, "completed_at" timestamptz null, "failure_reason" text null, primary key ("id"));`,
    );
    this.addSql(
      `create index "payments_order_id_created_at_index" on "payments" ("order_id", "created_at");`,
    );

    this.addSql(
      `create table "order_items" ("id" uuid not null, "order_id" uuid not null, "product_variant_id" uuid not null, "product_name" varchar(120) not null, "product_image" text not null, "variant_name" varchar(50) not null, "unit_price" numeric(10,2) not null, "discount_amount" numeric(10,2) not null default '0', "quantity" int not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "order_items" add constraint "order_items_order_id_product_variant_id_unique" unique ("order_id", "product_variant_id");`,
    );

    this.addSql(
      `create table "inventory_movements" ("id" uuid not null, "product_variant_id" uuid not null, "order_id" uuid null, "type" text not null, "quantity" int not null, "reason" varchar(255) null, "created_by" uuid null, "created_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(
      `alter table "product_variants" add "reserved_quantity" int not null default 0;`,
    );
    this.addSql(
      `alter table "product_variants" add constraint "product_variants_reserved_quantity_check" check (reserved_quantity >= 0 and reserved_quantity <= stock_quantity);`,
    );
    this.addSql(
      `alter table "product_variants" add constraint "product_variants_stock_quantity_check" check (stock_quantity >= 0);`,
    );

    this.addSql(
      `alter table "orders" add constraint "orders_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_shipping_method_id_foreign" foreign key ("shipping_method_id") references "shipping_methods" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_status_check" check ("status" in ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'));`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_shipping_status_check" check ("shipping_status" in ('PENDING', 'SHIPPING', 'DELIVERED', 'RETURNED'));`,
    );

    this.addSql(
      `alter table "payments" add constraint "payments_order_id_foreign" foreign key ("order_id") references "orders" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_amount_check" check (amount > 0);`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_type_check" check ("type" in ('CHARGE', 'REFUND'));`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_method_check" check ("method" in ('COD', 'CARD', 'PAYPAL'));`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_status_check" check ("status" in ('PENDING', 'PAID', 'FAILED'));`,
    );

    this.addSql(
      `alter table "order_items" add constraint "order_items_order_id_foreign" foreign key ("order_id") references "orders" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "order_items" add constraint "order_items_product_variant_id_foreign" foreign key ("product_variant_id") references "product_variants" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "order_items" add constraint "order_items_quantity_check" check (quantity >= 1);`,
    );

    this.addSql(
      `alter table "inventory_movements" add constraint "inventory_movements_product_variant_id_foreign" foreign key ("product_variant_id") references "product_variants" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "inventory_movements" add constraint "inventory_movements_order_id_foreign" foreign key ("order_id") references "orders" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "inventory_movements" add constraint "inventory_movements_type_check" check ("type" in ('RESERVE', 'RELEASE', 'SALE', 'RESTOCK', 'ADJUSTMENT'));`,
    );

    this.addSql(
      `alter table "orders" add constraint "orders_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "orders" add constraint "orders_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "payments" add constraint "payments_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "inventory_movements" add constraint "inventory_movements_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `create unique index "payments_order_id_pending_charge_unique" on "payments" ("order_id") where "type" = 'CHARGE' and "status" = 'PENDING';`,
    );
    this.addSql(
      `create unique index "payments_order_id_paid_charge_unique" on "payments" ("order_id") where "type" = 'CHARGE' and "status" = 'PAID';`,
    );
    this.addSql(
      `create unique index "payments_transaction_id_unique" on "payments" ("transaction_id") where "transaction_id" is not null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "payments" drop constraint "payments_order_id_foreign";`,
    );
    this.addSql(
      `alter table "order_items" drop constraint "order_items_order_id_foreign";`,
    );
    this.addSql(
      `alter table "inventory_movements" drop constraint "inventory_movements_order_id_foreign";`,
    );

    this.addSql(`drop table if exists "orders" cascade;`);
    this.addSql(`drop table if exists "payments" cascade;`);
    this.addSql(`drop table if exists "order_items" cascade;`);
    this.addSql(`drop table if exists "inventory_movements" cascade;`);

    this.addSql(
      `alter table "product_variants" drop constraint "product_variants_reserved_quantity_check";`,
    );
    this.addSql(
      `alter table "product_variants" drop constraint "product_variants_stock_quantity_check";`,
    );
    this.addSql(
      `alter table "product_variants" drop column "reserved_quantity";`,
    );
  }
}
