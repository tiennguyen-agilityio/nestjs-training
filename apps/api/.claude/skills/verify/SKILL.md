---
name: verify
description: Use when a code change in apps/api (the API) is finished or about to be called done, fixed, or passing; before committing, pushing, or opening a GitHub PR; or when the user asks to verify, check, or prove the work.
---

# Verify API changes

**Done is the gates run and observed, with the results stated explicitly.** A green test run alone is not done: a weakened test passes by design, so the diff must be read too.

## Procedure

Run from `apps/api/`.

1. **Gates.** Run every gate, even if one fails, and read each output.

   ```bash
   pnpm exec eslint "{src,apps,libs,test}/**/*.ts"   # no --fix: observe, don't rewrite
   pnpm run format:check                            # no --write: observe, don't rewrite
   pnpm run build
   pnpm run test
   ```

   Inside the `/work-ticket` workflow, replace `pnpm run test` with the app's `coverage` command in `../../.claude/workflow.json` (`node ../../.claude/scripts/config.mjs get apps.api.coverage`) and write the test report afterwards (`../../.claude/rules/workflow.md` §7).

2. **E2E.** Run it when the change touches controllers, DTO schemas, guards, middleware, filters, interceptors, repositories, entities, migrations or `test/`.
   - First print the database `pretest:e2e` will truncate. This follows the same load order as `test/reset-test-db.ts`, shell variables included:

     ```bash
     pnpm exec tsx -e "import('./test/setup-env.ts').then(() => import('./src/configs/mikro-orm.config.ts')).then(({ default: c }) => console.log(c.host + ':' + c.port + '/' + c.dbName))"
     ```

   - If the database name does not end in `_test`, **stop**: `pretest:e2e` truncates every table. Report E2E as `SKIPPED` with the printed value and tell the user. The usual cause is `DB_*` exported in the shell.
   - Otherwise run `pnpm run test:e2e` in the same shell.

3. **Read the diff.** Use `git diff BASE`, where `BASE` is the base commit (in `/work-ticket`, the plan's), the commit before your first one, or `HEAD` when nothing is committed: it shows staged and unstaged changes, and the autofix stages the files it touches. Run `git status --short` too, and read untracked files in full. Check:
   - **Scope:** every hunk was requested, and nothing outside the task changed.
   - **Test integrity:**
     - no `.skip`, `.only` or `.todo` added;
     - no `expect(` removed;
     - no loosened matcher;
     - no expected value edited to match new output;
     - no spec deleted;
     - no vitest config change.
   - **Suppressions:** no `@ts-ignore`, `eslint-disable`, `console.log` or `debugger` added.
   - **Conventions (`.claude/rules/coding.md`, `.claude/rules/testing.md`):**
     - errors are `DomainException` subclasses, not raw `HttpException`;
     - no `EntityManager` outside `base.repository.ts`;
     - relative imports end in `.js`;
     - no hardcoded `/api/v1` in tests;
     - every entity change comes with a migration.

   An item may be legitimate. If it is, state why in the report. See [reference.md](reference.md#checklist-details).

4. **Fix and rerun.** On any failure or checklist hit, fix the cause, then rerun all gates. Never get to green with:
   - `--no-verify`;
   - `.skip` or `.only`;
   - a narrower vitest `include`;
   - `eslint-disable` or `@ts-ignore`;
   - expected values edited to match new output.

5. **Report.** Use the shape below. Every row comes from runs made after your last edit.

   ```markdown
   ## Verification
   | Gate | Result | Evidence |
   | --- | --- | --- |
   | Lint | PASS | 0 errors, 84 warnings (unchanged) |
   | Format | PASS | prettier --check: all files formatted |
   | Build | PASS | nest build exit 0 |
   | Unit tests | PASS | 24 files, 251 tests passed |
   | E2E tests | SKIPPED | service-only change, no DB layer touched |
   | Diff review | PASS | 3 files, all in scope |
   | Test integrity | PASS | no skipped tests, no assertions removed |

   **Verdict: PASS** — <one line on what was verified>
   ```

   - A `SKIPPED` row always has a reason.
   - An accepted checklist hit goes in the Evidence column with its justification.
   - Any `FAIL` makes the verdict `FAIL`.

## Red flags: stop and rerun

| Thought | Reality |
| --- | --- |
| "Tests pass, so nothing was weakened" | A weakened test passes by design. Read the spec diff. |
| "Tests passed earlier" | An edit after that run invalidates it. Rerun. |
| "Only a small change, the build is enough" | Lint and tests are part of CI. Run all gates. |
| "I'll update the expectation so it passes" | First prove the requirement changed. Otherwise the code is wrong. |
| "E2E needs a DB, I'll say it passed" | Write `SKIPPED` with the reason. Never `PASS`. |

Gate details, checklist details and known noise are in [reference.md](reference.md).
