import { Migration } from '@mikro-orm/migrations';

export class Migration20261124132319 extends Migration {
  override name = 'Migration20261124132319';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "payments" add "checkout_session_id" varchar(255) null;`,
    );
    this.addSql(
      `create unique index "payments_checkout_session_id_unique" on "payments" ("checkout_session_id") where "checkout_session_id" is not null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "payments_checkout_session_id_unique";`);
    this.addSql(`alter table "payments" drop column "checkout_session_id";`);
  }
}
