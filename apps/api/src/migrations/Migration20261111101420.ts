import { Migration } from '@mikro-orm/migrations';

export class Migration20261111101420 extends Migration {
  override name = 'Migration20261111101420';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "idempotency_keys" ("key_hash" text not null, "key" text not null, "fingerprint" text not null, "owner" text null, "response" json null, "expires_at" bigint not null, primary key ("key_hash"));`,
    );
    this.addSql(
      `create index "idempotency_keys_expires_at_index" on "idempotency_keys" ("expires_at");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "idempotency_keys" cascade;`);
  }
}
