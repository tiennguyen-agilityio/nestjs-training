---
paths:
  - "src/**/*.ts"
---

# Coding rules

The layering and conventions the code actually follows. Plans, code reviews and the `verify` skill check changes against this file.

## Layering

**`src/common/repositories/base.repository.ts` is the only MikroORM-aware layer.**

- Module repositories declare `protected readonly entity = X`.
- They compose the ORM-agnostic protected helpers: `findOneBy`, `findMany`, `paginate`, `countOf`, `createAndSave`, plus `inTransaction` (hands the open transaction to a store such as `Outbox.add()`) and `inOwnContext` (a persistence context for code outside an HTTP request, such as an outbox handler).
- Services **never** touch `EntityManager`.
- Exception: `src/modules/idempotency/stores/postgres-idempotency.store.ts` runs its own SQL through MikroORM's connection, outside `BaseRepository`: the `@nestjs/idempotency` store contract needs single-statement conditional writes the helpers cannot express.
- Exception: `src/modules/health/indicators/database-health.indicator.ts` runs `select 1` through MikroORM's connection: Terminus's `MikroOrmHealthIndicator` reports down until the lazy MikroORM 7 connection is opened by another query.
- Exception: `src/modules/outbox/outbox.module.ts` builds the `@nestjs/outbox` PostgreSQL store's executor from MikroORM's Kysely (`fromKysely(em.getKysely())`); it runs no queries of its own, and the open transaction reaches `Outbox.add()` only through `BaseRepository`.

**Soft delete is a MikroORM filter.**

- Declared on `BaseEntity`: `@Filter({ name: 'softDelete', cond: { deletedAt: null }, default: true })`.
- Toggled per query through `options.includeDeleted` in `buildFindOptions`.
- Controllers decide visibility with `isActiveAdmin(user)` and pass `includeDeleted` down.
- Uniqueness checks pass `includeDeleted: true` explicitly, so deleted rows still conflict.

**Validation is Zod via Standard Schema**, not class-validator.

- class-validator is used **only** for env validation in `src/configs/env.validation.ts`.
- Request shapes live in `dto/*.schema.ts` and are attached per-parameter:
  - `@Body({ schema: createCategorySchema })`
  - `@Query({ schema: paginationQuerySchema })`
  - `@Param({ schema: idParamSchema })`
- Types come from `z.infer`.
- Request body schemas come from `@repo/schemas` (shared with web for its payload types), never rewritten here. A module's `dto/*.schema.ts` imports them, adds only server-only refines (ones that need `ERROR_CODES`, `ERROR_MESSAGES`, the database or other server logic) and exports the `z.infer` types. Query and param schemas stay in the API. Schemas set no custom message on a built-in check: `description` is the raw Zod message.

**Errors are `DomainException` subclasses** from `src/common/exceptions/base.exception.ts`.

- Subclasses: `ValidationException`, `InvalidRequestException`, `ItemNotFoundException`, `DuplicateResourceException`, `ResourceInUseException`.
- Each carries `ErrorDetailDto[]` (`errCode`, `field`, `message`, `description`).
- `GlobalExceptionFilter` renders them as `{ statusCode, message, errors[] }`.
- Throw these from services, **not raw `HttpException`**.

**Message and code strings are centralized.**

| File                                          | Contents                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/common/constants/message.constant.ts`    | `ERROR_MESSAGES`, `ERROR_DESCRIPTIONS`                                       |
| `src/common/constants/error-code.constant.ts` | `ERROR_CODES`                                                                |
| `@repo/constants` (`packages/constants`)      | `VALIDATION_RULES` (bounds), `VALIDATION_MESSAGES`, shared enums             |
| `@repo/schemas` (`packages/schemas`)          | Request body schemas, field rules, `DISCOUNT_PERCENT_MESSAGE`, payload types |

Controllers reuse the same constants in their `@ApiErrorResponse` docs — so **a new error needs an entry in all three places** (`ERROR_MESSAGES`, `ERROR_DESCRIPTIONS`, `ERROR_CODES`).

`@repo/constants` is shared with web, and the API is its source of truth: `DiscountType`, `ProductUnit`, `RoastLevel`, `ProductStatus`, `ProductSortBy`, `UserRole` and `UserStatus` are imported from it, never redeclared. An enum web does not use may stay in the API; move it to the package as soon as web needs it.

**Responses** are shaped by `Response*Dto` classes with a static `fromEntity`; entities are never returned directly.

- `TransformResponseInterceptor` wraps a plain result in `{ data }`.
- It leaves an already-paginated `{ data, meta }` (built by `BaseRepository.paginate` / `mapPaginatedResult`) untouched.

**Admin routes use `@AdminOnly()`**, which bundles:

- `AuthGuard` + `RolesGuard` + `@Roles([ADMIN])` + `@ApiBearerAuth()` + the 401/403 Swagger docs.
- Route-specific error docs stay on the route.

**Clerk is the identity source of truth.**

- Admin `role`/`status` changes are pushed to Clerk first, then written back to Postgres by the `user.updated` webhook.
- Clerk access goes through the abstract `AuthProvider` (`ClerkAuthProvider` implementation) — **swap/mock there**.

## Module shape

`src/modules/<feature>/` contains:

- `controllers/`
- `services/`
- `repositories/`
- `entities/`
- `dto/`
- `enums/` _(optional)_
- `handlers/` _(optional)_ — `@OnOutboxMessage` handlers (`user/handlers/user-role-sync.handler.ts`)
- `jobs/` _(optional)_ — `@nestjs/schedule` jobs (`idempotency/jobs/`, `outbox/jobs/`)
- `<feature>.module.ts` — wires `MikroOrmModule.forFeature([Entity])` + repository + service + controller

Notes:

- `product-image` and `product-variant` have **no controllers** — they are managed through the product endpoints.
- Entity discovery is **glob-based** in `src/configs/mikro-orm.config.ts`; no manual registration.
- **ESM is real here: relative imports must carry the `.js` extension** (`./category.service.js`), even for `.ts` sources.
- An entity change needs a migration: `pnpm run migration:create`.
