import { Migration } from '@mikro-orm/migrations';

/**
 * Creates `shipping_methods`, with the name unique whatever its case (deleted
 * methods included) and the audit columns of `AuditableEntity`, and seeds the
 * two methods the website offered before: the ids, names, descriptions and
 * fees mirror `DELIVERY_SPEED` in `apps/web/src/constants/order.ts`.
 *
 * The audit foreign keys to `users(id)` are written by hand, as in
 * `Migration20261124035504`: the entity declares the columns as plain uuids.
 */

export class Migration20261124051827 extends Migration {
  override name = 'Migration20261124051827';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "shipping_methods" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "created_by" uuid null, "updated_by" uuid null, "deleted_by" uuid null, "name" varchar(120) not null, "description" text not null, "price" numeric(10,2) not null, "status" text not null default 'ACTIVE', primary key ("id"));`,
    );
    this.addSql(
      `create unique index "shipping_methods_name_lower_unique" on "shipping_methods" (lower("name"));`,
    );

    this.addSql(
      `alter table "shipping_methods" add constraint "shipping_methods_status_check" check ("status" in ('ACTIVE', 'INACTIVE'));`,
    );

    this.addSql(
      `alter table "shipping_methods" add constraint "shipping_methods_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "shipping_methods" add constraint "shipping_methods_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "shipping_methods" add constraint "shipping_methods_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );

    this.addSql(
      `insert into "shipping_methods" ("id", "name", "description", "price", "status", "created_at", "updated_at") values ('9a227cdd-9e98-4c3d-99e4-ff74a2c5ffa6', 'Artisanal Standard', '3-5 business days', 0, 'ACTIVE', now(), now()), ('7f7ebc14-0a2a-4b47-9423-7b107a00f35d', 'Roast Express', '1-2 business days', 12, 'ACTIVE', now(), now());`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "shipping_methods" cascade;`);
  }
}
