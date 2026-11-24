import { Migration } from '@mikro-orm/migrations';

export class Migration20261124160031 extends Migration {
  override name = 'Migration20261124160031';

  // Accent-insensitive order search (`unaccent(column) ilike unaccent(word)`).
  override up(): void | Promise<void> {
    this.addSql(`create extension if not exists unaccent;`);
  }

  override down(): void | Promise<void> {
    // No-op: other objects may use the extension, and it may predate this migration.
    // To remove it by hand: drop extension if exists unaccent;
  }
}
