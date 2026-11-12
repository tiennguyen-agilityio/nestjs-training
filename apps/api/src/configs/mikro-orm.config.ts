import 'dotenv/config';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { defineConfig } from '@mikro-orm/postgresql';

export default defineConfig({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  dbName: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  metadataProvider: ReflectMetadataProvider,

  // Vitest sets process.env.VITEST, which MikroORM's TS auto-detection reads as a
  // signal to import entitiesTs (raw .ts) directly. That import bypasses Vitest's
  // transform pipeline and hits Node's native ESM loader, which cannot parse
  // TypeScript. Force the compiled dist entities under Vitest; tsx (migrations,
  // seeders) keeps using entitiesTs via the default auto-detection.
  preferTs: process.env.VITEST ? false : undefined,

  entities: ['dist/**/*.entity.js'],
  entitiesTs: ['src/**/*.entity.ts'],

  discovery: {
    warnWhenNoEntities: false,
  },

  migrations: {
    path: 'dist/migrations',
    pathTs: 'src/migrations',
    // Default name is `.snapshot-${dbName}`, which gives every database its own
    // snapshot and makes `migration:create` diff against a different baseline
    // depending on which .env is loaded. Keep one snapshot for all databases.
    snapshotName: '.snapshot-coffee_shop',
    // `migration:up` would otherwise rewrite the snapshot from the live database, pulling in
    // tables no entity maps (the outbox store's `nest_outbox` schema), which the next
    // `migration:create` would then drop. Only `migration:create` writes it, from the entities.
    snapshotOnMigrate: false,
  },

  seeder: {
    path: 'dist/seeders',
    pathTs: 'src/seeders',
  },

  debug: process.env.NODE_ENV !== 'production',
});
