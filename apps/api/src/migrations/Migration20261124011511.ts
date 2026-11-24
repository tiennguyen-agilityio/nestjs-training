import { Migration } from '@mikro-orm/migrations';

/**
 * Makes the database enforce the field specifications: names up to 120
 * characters, a phone number up to 10, and one live image per product
 * position. The position key is deferred to commit so a swap saves in one
 * flush; a soft-deleted image gives up its position (`sort_order` null).
 *
 * Before any change, `up()` checks the data and stops, listing every row that
 * does not fit, so nothing is cut: the `::varchar(n)` casts below would
 * silently truncate a longer value.
 *
 * `down()` cannot restore the old positions of soft-deleted images: it sets
 * them to 0, and the API never reads them.
 */

// The limits as they are when this migration is written, kept as literals so
// the migration does not change if a constant does later:
// VALIDATION_RULES.NAME.MAX_LENGTH and VALIDATION_RULES.PHONE.REGEX (^\d{10}$).
const NAME_MAX_LENGTH = 120;
const PHONE_NUMBER_MAX_LENGTH = 10;

const TOO_LONG_CHECKS = [
  { table: 'users', column: 'first_name', max: NAME_MAX_LENGTH },
  { table: 'users', column: 'last_name', max: NAME_MAX_LENGTH },
  { table: 'users', column: 'phone_number', max: PHONE_NUMBER_MAX_LENGTH },
  { table: 'categories', column: 'name', max: NAME_MAX_LENGTH },
  { table: 'products', column: 'name', max: NAME_MAX_LENGTH },
] as const;

export class Migration20261124011511 extends Migration {
  override name = 'Migration20261124011511';

  override async up(): Promise<void> {
    await this.assertDataFits();

    this.addSql(
      `alter table "product_images" alter column "sort_order" drop not null;`,
    );
    this.addSql(
      `update "product_images" set "sort_order" = null where "deleted_at" is not null;`,
    );

    this.addSql(
      `alter table "categories" alter column "name" type varchar(120) using ("name"::varchar(120));`,
    );
    this.addSql(
      `alter table "products" alter column "name" type varchar(120) using ("name"::varchar(120));`,
    );
    this.addSql(
      `alter table "users" alter column "first_name" type varchar(120) using ("first_name"::varchar(120));`,
    );
    this.addSql(
      `alter table "users" alter column "last_name" type varchar(120) using ("last_name"::varchar(120));`,
    );
    this.addSql(
      `alter table "users" alter column "phone_number" type varchar(10) using ("phone_number"::varchar(10));`,
    );

    this.addSql(
      `alter table "product_images" add constraint "product_images_product_id_sort_order_unique" unique ("product_id", "sort_order") deferrable initially deferred;`,
    );
  }

  private async assertDataFits(): Promise<void> {
    const problems: string[] = [];

    for (const { table, column, max } of TOO_LONG_CHECKS) {
      const rows = await this.execute(
        `select "id", length("${column}") as "length" from "${table}" where length("${column}") > ${max} order by "id";`,
      );
      for (const row of rows) {
        problems.push(
          `- ${table} ${String(row.id)}: ${column} has ${String(row.length)} characters (max ${max})`,
        );
      }
    }

    const duplicates = await this.execute(
      `select "product_id", "sort_order", array_agg("id" order by "id") as "ids" from "product_images" where "deleted_at" is null group by "product_id", "sort_order" having count(*) > 1 order by "product_id", "sort_order";`,
    );
    for (const row of duplicates) {
      problems.push(
        `- product_images of product ${String(row.product_id)} at sort_order ${String(row.sort_order)}: ${(row.ids as string[]).join(', ')}`,
      );
    }

    if (problems.length > 0) {
      throw new Error(
        [
          `${this.name} stopped: rows do not fit the field specifications. Nothing was changed; fix these rows and run it again.`,
          ...problems,
        ].join('\n'),
      );
    }
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "product_images" drop constraint "product_images_product_id_sort_order_unique";`,
    );
    this.addSql(
      `update "product_images" set "sort_order" = 0 where "sort_order" is null;`,
    );
    this.addSql(
      `alter table "product_images" alter column "sort_order" set not null;`,
    );

    this.addSql(
      `alter table "categories" alter column "name" type varchar(255) using ("name"::varchar(255));`,
    );
    this.addSql(
      `alter table "products" alter column "name" type varchar(255) using ("name"::varchar(255));`,
    );
    this.addSql(
      `alter table "users" alter column "first_name" type varchar(255) using ("first_name"::varchar(255));`,
    );
    this.addSql(
      `alter table "users" alter column "last_name" type varchar(255) using ("last_name"::varchar(255));`,
    );
    this.addSql(
      `alter table "users" alter column "phone_number" type varchar(255) using ("phone_number"::varchar(255));`,
    );
  }
}
