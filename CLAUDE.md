# CLAUDE.md

pnpm + Turborepo monorepo: `apps/api` (NestJS, ESM), `apps/web` (Next.js), shared `packages/`. App guidance: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`. Feature or bug task: `.claude/rules/workflow.md` (loaded automatically); a Trello card: `/work-ticket <card URL>`.

## Commands

- Install (also builds the `packages/*` dist and the git hooks): `pnpm install`
- Per app: `pnpm dev:api | build:api | lint:api | test:api | start:api` (same for `web`); any app script: `pnpm api <script>`, `pnpm web <script>`
- One test file: `pnpm api test <path>` (Vitest), `pnpm web test <path>` (Jest), path relative to the app dir; API e2e: `pnpm api test:e2e`
- `lint` runs `eslint --fix`; to check without rewriting, use the `apps/api:verify` or `apps/web:verify` skill

## Gotchas

- ESLint, TypeScript and Prettier config, `@repo/constants` and `@repo/schemas` live in `packages/`: change a rule there, not in an app, then lint both apps. After changing `@repo/constants` or `@repo/schemas`, rebuild with `pnpm --filter "./packages/**" build` before an app build or a running app sees it (their `dist`); unit and e2e tests read their `src` directly.
- `@repo/constants` and `@repo/schemas` follow the API (source of truth); web forms keep their own schemas.
- Shared devDependency versions come from the `catalog:` in `pnpm-workspace.yaml`; apps reference them as `"catalog:"`.
- `docs/specs/` is gitignored: workflow specs stay local.

## Git and CI

- Branch `<type>/<kebab>` from `develop`, PR into `develop`, merge commit; `docs/conventions/git.md` is authoritative. Commit messages follow Conventional Commits (commitlint).
- Fix a failing hook instead of passing `--no-verify`. Pre-push runs `turbo run build test --affected` against `origin/develop` (`TURBO_SCM_BASE=<ref> git push` overrides it).
- `pull-request-checks` is the only required status check: keep every PR job in its `needs`, and never add a path filter to `pull_request`.
- PR previews run on the develop database, and CI never runs migrations.

<!-- turbo-workflow -->
## Ticket workflow (turbo-workflow)

- Config: `.claude/workflow.json` (edit with `/turbo-workflow:init`). Per-app rules: `apps/<app>/.claude/rules/`, per-app gates: `apps/<app>/.claude/skills/verify/`.
- One ticket end to end: `/work-ticket <ticket | "task" | spec dir>`; where it stopped: `/ticket-status`.
- The workflow is copied into `.claude/` (see `.claude/turbo-workflow.lock`): update it with `/turbo-workflow-sync`. `/turbo-workflow:init` needs the plugin enabled for this project first: `claude plugin enable turbo-workflow@claude-turbo-workflow --scope local`.
<!-- /turbo-workflow -->
