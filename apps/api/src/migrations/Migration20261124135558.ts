import { Migration } from '@mikro-orm/migrations';

export class Migration20261124135558 extends Migration {
  override name = 'Migration20261124135558';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "webhook_events" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "provider" text not null, "event_id" varchar(255) not null, "type" varchar(100) not null, "status" text not null default 'PROCESSED', primary key ("id"));`,
    );
    this.addSql(
      `alter table "webhook_events" add constraint "webhook_events_provider_event_id_unique" unique ("provider", "event_id");`,
    );

    this.addSql(
      `alter table "webhook_events" add constraint "webhook_events_provider_check" check ("provider" in ('CLERK', 'STRIPE', 'PAYPAL'));`,
    );
    this.addSql(
      `alter table "webhook_events" add constraint "webhook_events_status_check" check ("status" in ('PROCESSED', 'IGNORED'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "webhook_events" cascade;`);
  }
}
