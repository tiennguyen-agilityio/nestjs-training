import { Migration } from '@mikro-orm/migrations';

/**
 * Variant columns named for what they hold (ERD issues 4 and 5) and the
 * variant name worked out on read instead of stored (ERD issue 2): `weight`
 * becomes `size`, `quantity` becomes `stock_quantity`, `name` is dropped.
 * Columns are renamed, never dropped and re-added, so every value is kept.
 */
export class Migration20261124005105 extends Migration {
  override name = 'Migration20261124005105';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "product_variants" rename column "weight" to "size";`,
    );
    this.addSql(
      `alter table "product_variants" rename column "quantity" to "stock_quantity";`,
    );
    this.addSql(`alter table "product_variants" drop column "name";`);
  }

  override down(): void | Promise<void> {
    // The name rebuilt in the previous code's `${weight}${unit}` shape, with the
    // size normalized ("250G"): a name stored from an unnormalized weight
    // ("250.000G") is not restored character for character.
    this.addSql(`alter table "product_variants" add "name" varchar(255) null;`);
    this.addSql(
      `update "product_variants" set "name" = trim_scale("size")::text || "unit";`,
    );
    this.addSql(
      `alter table "product_variants" alter column "name" set not null;`,
    );
    this.addSql(
      `alter table "product_variants" rename column "stock_quantity" to "quantity";`,
    );
    this.addSql(
      `alter table "product_variants" rename column "size" to "weight";`,
    );
  }
}
