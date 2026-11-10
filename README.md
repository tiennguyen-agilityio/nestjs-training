# Coffee Shop

A pnpm + Turborepo monorepo for the Coffee Shop app: a NestJS API and a Next.js web app. It is
also the training repo where we practise a Claude Code workflow, from a Trello card to a merged
pull request.

**Live:** [Website](https://nestjs-training-weld.vercel.app/) ·
[API Swagger](https://nestjs-training-develop.onrender.com/api/docs)

## Repository Layout

| Path       | What                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` | NestJS API — see [apps/api/README.md](apps/api/README.md)                                                                                               |
| `apps/web` | Next.js web app — see [apps/web/README.md](apps/web/README.md)                                                                                          |
| `packages` | Shared config (`@repo/typescript-config`, `@repo/eslint-config`, `@repo/prettier-config`) and `@repo/constants`, the runtime constants both apps import |
| `docs`     | Training exercises, conventions, images                                                                                                                 |

## Prerequisites

- [Node.js](https://nodejs.org) >= 24
- [pnpm](https://pnpm.io) 10.34.5 (pinned by `packageManager` in `package.json`)
- [Docker](https://www.docker.com) + [Docker Compose](https://docs.docker.com/compose/) (for PostgreSQL)
- A [Clerk](https://clerk.com) application

## Quick Start

1. Clone the repo and install the workspace. This also installs the git hooks and builds
   `@repo/constants`.

   ```bash
   git clone -b develop git@github.com:tiennguyen-agilityio/nestjs-training.git
   cd nestjs-training && pnpm install
   ```

2. Create the env files and fill them in as the
   [API](apps/api/README.md#environment-variables) and
   [web](apps/web/README.md#environment-variables) READMEs say:
   `apps/api/.env` and `apps/api/.env.docker` from `apps/api/.env.example`, and `apps/web/.env`
   from `apps/web/.env.example`.
3. Start PostgreSQL and apply the migrations. See [API Getting Started](apps/api/README.md#getting-started)
   for the compose command.

   ```bash
   pnpm api migration:up
   ```

4. Start both apps with `pnpm dev`, or one at a time with `pnpm dev:api` and `pnpm dev:web`:
   - API: `http://localhost:3000`, Swagger at `http://localhost:3000/api/docs`
   - Web: `http://localhost:3001`

> **Signing in locally:** a user exists in the API database only after Clerk's webhook reaches
> `POST /webhooks/clerk`, so Clerk needs a public URL to your local API; until then a signed-in
> user gets `401` from `/users/me`. The admin role comes from `public_metadata.role` on Clerk. See
> [Auth & Authorization](apps/api/README.md#auth--authorization).

## Common Commands

```bash
pnpm install          # workspace + git hooks
pnpm dev              # all apps
pnpm build            # all packages
pnpm test             # all packages
pnpm lint             # all packages; runs eslint --fix
pnpm format           # Prettier --write; format:check only checks
pnpm build:api        # one app; also dev:api, test:api, lint:api, start:api (and the same for :web)
pnpm api <script>     # any API script, e.g. pnpm api migration:up; pnpm web <script> for web
```

## Documentation

- [Workflow cheat sheet](https://claude.ai/artifact/Br6StWbM28dH93haRSrRrc): how a Trello card goes
  through `/work-ticket` (design → plan → code → review → verify → commit → PR), the approval
  gates, generated files, CI/CD and common commands
- [Git conventions](docs/conventions/git.md): branches, commits, hooks and pull requests
- [API README](apps/api/README.md) and [web README](apps/web/README.md)

## Contributing

- Branch from `develop` as `<type>/<short-kebab-description>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org); the
  `commit-msg` hook checks them.
- Open the pull request into `develop`; it merges with a merge commit.

Details are in [docs/conventions/git.md](docs/conventions/git.md).
