<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# hunt — session orientation

**Read `PLAN.md` first.** It is the source of truth: end goal, principles,
stack, data model, and Phases 0–8 each with a verifiable exit gate.

## Current state
- **Phase 0 is done** (branch `feature/phase-0-skeleton`): encrypted settings,
  `lib/llm`, adapter interfaces + fakes + `meta`, design tokens + AppShell +
  Settings UI, Docker with Tectonic. Exit gate verified from a fresh clone.
- **Phase 1 (résumé core) is next.** `DESIGN.md` / `SCREENS.md` /
  `TAILORING-DIFF.md` + `design/*.dc.html` are committed ground truth — build
  UI against them, don't invent layout.

## What Phase 0 established (don't relearn these)
- The DB **migrates itself on first query** (`src/lib/db/migrate.ts`). There is
  no migrate step to run, in Docker or locally. Adding a migration = run
  `pnpm db:migrate` in dev and commit `prisma/migrations/`.
- The Prisma client is **lazy behind a proxy** — constructing it at module scope
  segfaults `next build` workers. Don't "simplify" that away.
- `better-sqlite3` must stay on the version `@prisma/adapter-better-sqlite3`
  depends on. Two native builds of it in one process segfault the server.
- Providers are declared once in `src/lib/providers/registry.ts` from each
  adapter's `meta`. Settings, onboarding, and the docs all read from it — a test
  fails the build if a provider ships without its onboarding copy.
- `output: standalone` is opt-in via `HUNT_STANDALONE=1` because it disables
  `next start`, which dev and e2e need.

## Conventions
- pnpm 10 (via corepack; pnpm 11 breaks on Node 20). `pnpm verify` =
  typecheck + lint + test + build — must stay green; it's the autoloop verifier.
- Keys live in the Settings UI (encrypted at rest in `./data/`), but
  `.env.local` may carry dev keys (e.g. `FIREWORKS_API_KEY` exists locally) —
  the LLM provider layer should support env fallback for dev. Never commit
  or log keys; `/data` and `.env*` are gitignored.
- Adapters (`lib/adapters/*`) always ship with a fixture-backed `Fake*` twin;
  tests and e2e run on fakes, live APIs only behind env flags.
- Honest AI is a product principle: no fake ATS scores; tailoring edits must
  cite source-resume paths (validator-enforced, not prompt-vibes).
