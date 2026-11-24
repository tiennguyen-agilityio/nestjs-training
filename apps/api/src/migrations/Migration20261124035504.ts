import { Migration } from '@mikro-orm/migrations';

export class Migration20261124035504 extends Migration {
  override name = 'Migration20261124035504';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "users" add "created_by" uuid null, add "updated_by" uuid null, add "deleted_by" uuid null;`,
    );
    this.addSql(
      `alter table "users" add constraint "users_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "users" add constraint "users_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "users" add constraint "users_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );

    this.addSql(
      `alter table "categories" add "created_by" uuid null, add "updated_by" uuid null, add "deleted_by" uuid null;`,
    );
    this.addSql(
      `alter table "categories" add constraint "categories_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "categories" add constraint "categories_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "categories" add constraint "categories_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );

    this.addSql(
      `alter table "products" add "created_by" uuid null, add "updated_by" uuid null, add "deleted_by" uuid null;`,
    );
    this.addSql(
      `alter table "products" add constraint "products_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "products" add constraint "products_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "products" add constraint "products_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );

    this.addSql(
      `alter table "product_variants" add "created_by" uuid null, add "updated_by" uuid null, add "deleted_by" uuid null;`,
    );
    this.addSql(
      `alter table "product_variants" add constraint "product_variants_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "product_variants" add constraint "product_variants_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "product_variants" add constraint "product_variants_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );

    this.addSql(
      `alter table "product_images" add "created_by" uuid null, add "updated_by" uuid null, add "deleted_by" uuid null;`,
    );
    this.addSql(
      `alter table "product_images" add constraint "product_images_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "product_images" add constraint "product_images_updated_by_foreign" foreign key ("updated_by") references "users" ("id") on delete restrict;`,
    );
    this.addSql(
      `alter table "product_images" add constraint "product_images_deleted_by_foreign" foreign key ("deleted_by") references "users" ("id") on delete restrict;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "categories" drop constraint "categories_created_by_foreign";`,
    );
    this.addSql(
      `alter table "categories" drop constraint "categories_updated_by_foreign";`,
    );
    this.addSql(
      `alter table "categories" drop constraint "categories_deleted_by_foreign";`,
    );

    this.addSql(
      `alter table "product_images" drop constraint "product_images_created_by_foreign";`,
    );
    this.addSql(
      `alter table "product_images" drop constraint "product_images_updated_by_foreign";`,
    );
    this.addSql(
      `alter table "product_images" drop constraint "product_images_deleted_by_foreign";`,
    );

    this.addSql(
      `alter table "product_variants" drop constraint "product_variants_created_by_foreign";`,
    );
    this.addSql(
      `alter table "product_variants" drop constraint "product_variants_updated_by_foreign";`,
    );
    this.addSql(
      `alter table "product_variants" drop constraint "product_variants_deleted_by_foreign";`,
    );

    this.addSql(
      `alter table "products" drop constraint "products_created_by_foreign";`,
    );
    this.addSql(
      `alter table "products" drop constraint "products_updated_by_foreign";`,
    );
    this.addSql(
      `alter table "products" drop constraint "products_deleted_by_foreign";`,
    );

    this.addSql(
      `alter table "users" drop constraint "users_created_by_foreign";`,
    );
    this.addSql(
      `alter table "users" drop constraint "users_updated_by_foreign";`,
    );
    this.addSql(
      `alter table "users" drop constraint "users_deleted_by_foreign";`,
    );

    this.addSql(
      `alter table "categories" drop column "created_by", drop column "updated_by", drop column "deleted_by";`,
    );

    this.addSql(
      `alter table "product_images" drop column "created_by", drop column "updated_by", drop column "deleted_by";`,
    );

    this.addSql(
      `alter table "product_variants" drop column "created_by", drop column "updated_by", drop column "deleted_by";`,
    );

    this.addSql(
      `alter table "products" drop column "created_by", drop column "updated_by", drop column "deleted_by";`,
    );

    this.addSql(
      `alter table "users" drop column "created_by", drop column "updated_by", drop column "deleted_by";`,
    );
  }
}
