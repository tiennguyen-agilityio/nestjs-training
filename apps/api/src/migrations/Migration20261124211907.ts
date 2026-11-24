import { Migration } from '@mikro-orm/migrations';

export class Migration20261124211907 extends Migration {
  override name = 'Migration20261124211907';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "user_addresses" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "user_id" uuid not null, "address_line" varchar(255) not null, "ward" varchar(255) not null, "district" varchar(255) not null, "city" varchar(255) not null, "postal_code" varchar(20) not null, "is_default" boolean not null default false, primary key ("id"));`,
    );
    this.addSql(
      `create index "user_addresses_user_id_index" on "user_addresses" ("user_id");`,
    );

    this.addSql(
      `alter table "user_addresses" add constraint "user_addresses_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`,
    );
    this.addSql(
      `create unique index "user_addresses_user_id_default_unique" on "user_addresses" ("user_id") where "is_default" and "deleted_at" is null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "user_addresses" cascade;`);
  }
}
