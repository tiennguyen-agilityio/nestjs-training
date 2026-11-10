# Coffee Shop Web

The shop and admin dashboard for the [Coffee Shop API](../api/README.md), built with Next.js.

**Live:** [Website](https://nestjs-training-develop.vercel.app/)

## Tech Stack

- [Next.js](https://nextjs.org) v15 (App Router)
- [React](https://react.dev) v19
- [TypeScript](https://www.typescriptlang.org) v6
- [Tailwind CSS](https://tailwindcss.com) v4
- [shadcn/ui](https://ui.shadcn.com) (CLI v4)
- [Clerk](https://clerk.com) (`@clerk/nextjs` v6)
- [TanStack Query](https://tanstack.com/query) v5
- [Zustand](https://zustand.docs.pmnd.rs) v5
- [React Hook Form](https://react-hook-form.com) v7
- [Zod](https://zod.dev) v4
- [Jest](https://jestjs.io) v30
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) v16
- [`@repo/constants`](../../packages/constants) (workspace)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 24
- [pnpm](https://pnpm.io) 10.34.5 (pinned by `packageManager` in the root `package.json`)
- A running API: locally on `http://localhost:3000` (see the [API README](../api/README.md#getting-started)), or the develop API
- A [Clerk](https://clerk.com) application

### Installation

1. Install the workspace at the repo root (this also installs the git hooks and builds `@repo/constants`):

   ```bash
   pnpm install
   ```

2. In `apps/web/`, create the env file and fill it in (see [Environment Variables](#environment-variables)):

   ```bash
   cp .env.example .env
   ```

### Environment Variables

`.env.example` leaves every value empty except the two fallback redirect URLs, which it sets to `/`. An empty value does not fall back to the defaults in the code, so set every other variable.

| Variable                                          | Description                                                              | Local value              |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `CLERK_SECRET_KEY`                                | Clerk backend secret key                                                 | from the Clerk dashboard |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | Clerk publishable key                                                    | from the Clerk dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | Sign-in route                                                            | `/sign-in`               |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | Sign-up route                                                            | `/sign-up`               |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Where to go after sign-in when no redirect is given                      | `/`                      |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Where to go after sign-up when no redirect is given                      | `/`                      |
| `NEXT_PUBLIC_API_URL`                             | Base URL of the API; the app appends `/api/v1`                           | `http://localhost:3000`  |
| `NEXT_PUBLIC_IMAGE_URL`                           | ImgBB upload endpoint; image upload is off when this or the key is empty | your ImgBB upload URL    |
| `NEXT_PUBLIC_IMAGE_KEY`                           | ImgBB API key                                                            | your ImgBB key           |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`                 | Mapbox token for the address lookup at checkout                          | your Mapbox token        |

### Running Locally

From the repo root (recommended, it also rebuilds `@repo/constants` on change):

```bash
pnpm dev:web
```

Or from `apps/web/`:

```bash
pnpm dev
```

Open `http://localhost:3001`.

## Scripts

Run these in `apps/web/`, or from the repo root as `pnpm web <script>`. `pnpm dev` and `pnpm start` use port 3001.

| Command                             | Description            |
| ----------------------------------- | ---------------------- |
| `pnpm dev`                          | Dev server (Turbopack) |
| `pnpm build`                        | Production build       |
| `pnpm start`                        | Run production build   |
| `pnpm lint`                         | ESLint (`--fix`)       |
| `pnpm format` / `pnpm format:check` | Prettier               |
| `pnpm test`                         | Jest once (CI)         |
| `pnpm test:watch`                   | Jest watch mode        |
| `pnpm test:cov`                     | Jest with coverage     |

## Folder Structure

```text
apps/web/
├── src/
│   ├── app/                    # App Router
│   │   ├── (shop)/             # Shop, URL /: brew-guides, cart, checkout, contact, order-success, profile, roasts, subscriptions
│   │   ├── dashboard/          # URL /dashboard: categories, favorites, inventory, orders, products, settings, users
│   │   ├── sign-in/
│   │   ├── sign-up/
│   │   ├── layout.tsx
│   │   ├── globals.css         # Theme + Tailwind @theme
│   │   └── error.tsx, global-error.tsx, not-found.tsx
│   ├── components/             # One folder per component (PascalCase)
│   │   ├── ui/                 # shadcn primitives
│   │   └── icon/               # SVG icon components
│   ├── constants/
│   ├── hooks/
│   ├── layouts/
│   ├── providers/
│   ├── schemas/
│   ├── sections/
│   ├── services/               # API client, image upload, geocoding
│   ├── store/
│   ├── theme/
│   ├── types/
│   ├── utils/
│   └── middleware.ts
├── public/
├── components.json
├── eslint.config.mjs
├── jest.config.ts
├── jest.setup.ts
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── prettier.config.mjs         # extends @repo/prettier-config (no semicolons)
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

## Deploy

Web is deployed to Vercel (project `nestjs-training-web`) by GitHub Actions.

| Environment | Trigger                 | URL                                                                           | Vercel env |
| ----------- | ----------------------- | ----------------------------------------------------------------------------- | ---------- |
| Preview     | PR into `develop`       | new URL per push that changes web or the API; one PR comment shows the latest | Preview    |
| Development | merge into `develop`    | https://nestjs-training-develop.vercel.app (alias to the latest build)        | Preview    |
| Production  | `main` (not configured) | —                                                                             | Production |

- **Vercel settings to keep:** Framework Preset Next.js, Root Directory `apps/web`, Node.js 24.x, default Install Command. `vercel.json` only sets the build command and turns off Git deploys.
- **Env vars:** in the Vercel project, environment Preview (used by preview and development).
- **GitHub:** secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; variables `VERCEL_DEVELOP_ALIAS`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **API:** a PR that changes the API gets its own API preview (URL in the PR comment) and its web preview calls it. Other PRs and development call the develop API.
- **CORS:** the API's `CORS_ORIGIN` allows the development alias and the preview URLs.
