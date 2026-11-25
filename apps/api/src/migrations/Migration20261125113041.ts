import { Migration } from '@mikro-orm/migrations';

export class Migration20261125113041 extends Migration {
  override name = 'Migration20261125113041';

  override up(): void | Promise<void> {
    this.addSql(`alter table "payments" add "retried_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "payments" drop column "retried_at";`);
  }
}
