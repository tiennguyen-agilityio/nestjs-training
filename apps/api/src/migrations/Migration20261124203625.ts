import { Migration } from '@mikro-orm/migrations';

export class Migration20261124203625 extends Migration {
  override name = 'Migration20261124203625';

  override up(): void | Promise<void> {
    this.addSql(
      `create index "inventory_movements_product_variant_id_created_at_index" on "inventory_movements" ("product_variant_id", "created_at");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `drop index "inventory_movements_product_variant_id_created_at_index";`,
    );
  }
}
