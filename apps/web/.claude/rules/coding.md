---
paths:
  - 'src/**/*.{ts,tsx}'
---

# Coding rules

The layering and conventions the code actually follows. Plans, code reviews and the `verify` skill check changes against this file.

## Layers

| Folder               | Role                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`           | Routes. `page.tsx` stays a thin server file that renders a co-located client view (`PageContent.tsx`, or `src/app/(shop)/profile/ProfilePageView.tsx`) or a section, often inside `<Suspense>` (`src/app/dashboard/users/page.tsx`); static pages and `src/app/(shop)/page.tsx` render on the server. |
| `src/sections/`      | Page blocks; may use hooks, the store and services.                                                                                                                                                                                                                                                   |
| `src/components/`    | Reusable UI.                                                                                                                                                                                                                                                                                          |
| `src/components/ui/` | shadcn primitives (`components.json`), kebab-case file names.                                                                                                                                                                                                                                         |
| `src/layouts/`       | Page shells.                                                                                                                                                                                                                                                                                          |
| `src/services/`      | API calls.                                                                                                                                                                                                                                                                                            |
| `src/hooks/`         | TanStack Query hooks and other React hooks.                                                                                                                                                                                                                                                           |
| `src/store/`         | zustand stores.                                                                                                                                                                                                                                                                                       |
| `src/providers/`     | React context providers and `AuthTokenBridge`.                                                                                                                                                                                                                                                        |
| `src/theme/`         | `ThemeProvider` (`next-themes`).                                                                                                                                                                                                                                                                      |
| `src/schemas/`       | Form schemas.                                                                                                                                                                                                                                                                                         |
| `src/constants/`     | Routes, messages and other constants.                                                                                                                                                                                                                                                                 |
| `src/types/`         | Shared types.                                                                                                                                                                                                                                                                                         |
| `src/utils/`         | Helpers with no hooks, state or I/O (`src/utils/order.ts` maps statuses to `lucide-react` icons and `StatsCards` items).                                                                                                                                                                              |

## Naming and exports

- Components and sections are a PascalCase folder with an `index.tsx`; `src/components/icon/` holds flat `<Name>Icon.tsx` files.
- Hooks are `use<Name>.ts`; shadcn primitives in `src/components/ui/` keep theirs inside the component file (`useSidebar`, `useCarousel`).
- No aggregate barrels: import each module by its own path.
- Imports across top-level `src/` folders use the `@/` alias (`tsconfig.json`).
- **New** components and sections use `export default` from `index.tsx`, with `<Name>Props` as a named export. Do not convert existing files.

## Server and client

- New `'use client'` only where state, effects or browser APIs are needed (a few files, e.g. `src/components/Loading/index.tsx`, carry it without need); `page.tsx` and `layout.tsx` stay server components (`src/app/(shop)/page.tsx` fetches on the server).
- No server actions or route handlers exist; adding one is a plan decision.

## Data

**Services return a result union and never throw** (`src/services/api.ts`, `src/services/category.ts`).

- Calls to the API go through `apiClient`. Each call passes an `API_FALLBACK_ERRORS` value as `fallbackError`.
- Public reads pass `skipAuth: true` (`src/services/__tests__/public-reads.test.ts`).
- Third-party calls (`src/services/image.ts`, `src/services/mapboxGeocode.ts`) use `fetch` directly.

**Data hooks wrap TanStack Query** (`src/hooks/useCategory.ts`); `useAuth` keeps the current user in the zustand `useUserStore`.

- Query keys come from exported key factories under one root key per resource (`['categories']`); `setQueriesData` filters may use a literal prefix (`['products', 'list']`). Mutations invalidate that root key.

## Shared packages

- Enums, `VALIDATION_RULES` and `VALIDATION_MESSAGES` come from `@repo/constants`; request body types from `@repo/schemas`. Never redeclare a shared enum or payload type.
- Form schemas stay in `src/schemas/` and build on those values (`src/schemas/product.ts`).

## Forms

- react-hook-form with `zodResolver` (`src/sections/EditCategory/index.tsx`); the Clerk sign-in/sign-up forms and checkout validate with `parse<Name>` helpers in `src/schemas/` instead (`parseCheckoutValues` in `src/schemas/checkout.ts`).
- Validation messages come from `ERROR_MESSAGES` or `VALIDATION_MESSAGES`, never string literals.

## Constants

- API URLs come from `API_ROUTES` or `API_BASE_URL` (`src/constants/routes.ts`), never a literal `/api/v1` or API host outside those definitions; new links use `ROUTES` (some shop pages still hard-code `/roasts`, `/brew-guides` and `/contact`; the `middleware.ts` matcher stays literal).
- New error, success and dialog text comes from `src/constants/messages.ts`; headings and labels stay inline.

## Auth

- Route protection lives in `src/middleware.ts`, whose admin check uses `getSessionPublicRole` (`src/utils/session.ts`); the shop header's admin menu (`src/layouts/Header/index.tsx`) uses the same `getSessionPublicRole` on Clerk's client `useAuth().sessionClaims`, not the API user's `role`.
- API tokens use the `CLERK_SESSION_TEMPLATE` template (`src/providers/AuthTokenBridge.tsx`).
- Only `NEXT_PUBLIC_*` variables reach the client; add no secret to one (`NEXT_PUBLIC_IMAGE_KEY`, the ImgBB key in `src/services/image.ts`, is a known exception).

## Styling and accessibility

- Merge classes with `cn` from `@/utils/styles` (two older conditional template literals remain, e.g. `src/sections/CheckoutPageContent/index.tsx`).
- New code uses theme tokens (`bg-surface-*`, `text-on-surface-*`) over raw colours; status badges (`src/utils/order.ts`, table rows) still use palette colours.
- Every new form control and select has an accessible name: a `<Label htmlFor>` or `aria-label` (`src/components/Select/index.tsx`); some dashboard filter selects and the flavour-note inputs still lack one.

## TypeScript

From `../../packages/eslint-config/next.mjs`:

| Rule                                                                         | Level   |
| ---------------------------------------------------------------------------- | ------- |
| Type-only imports marked `type` (`import type { X }` or `import { type X }`) | error   |
| Unused values prefixed with `_`                                              | error   |
| No `any` in **new** code (existing hits, e.g. `src/hooks/useUrlState.ts`)    | warning |
| No non-null `!` in **new** code                                              | warning |
| No `console.log` (`console.warn` and `console.error` are allowed)            | warning |

## Not prescribed

Follow the neighbouring files and do not flag existing code for:

- how a hook turns a failed result into an error (`throwIfServiceFailed` or `throw new Error`);
- the `useForm` `mode` and whether a form sets `noValidate`;
- relative imports between sibling folders;
- older export styles.
