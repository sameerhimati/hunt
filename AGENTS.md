<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# hunt — session orientation

**Read `docs/PLAN.md` first.** It is the source of truth: end goal, principles,
stack, data model, and Phases 0–8 each with a verifiable exit gate. Everything
else lives in `docs/` too — only README, AGENTS and CLAUDE stay at root.

## Current state
- **Phases 0–5 are built and promoted** (`gates/DONE`): skeleton, résumé core,
  pipeline, tailoring + checks, outreach, sourcing. Current branch is `wave-2`.
- **Phase 6 (LinkedIn) is cancelled** — decided 2026-07-26. Its gates stay
  committed and RED, never promoted. Don't build against them.
- **Phase 7 (reply detection) is cut from v1** — decided 2026-08-03. Reply-marking
  is manual and the UI says so honestly, so nothing lies without it, and it is
  the only remaining v1 item whose gate needs a live Gmail account. Its gates stay
  committed and RED like Phase 6's; `gates/DONE` skips 7. It stays on the roadmap
  under *Later*, and the research still stands: **IMAP + an app password, not
  Gmail OAuth** — Gmail's API cannot search `In-Reply-To`/`References`, while
  IMAP's `SEARCH HEADER References <id>` matches exactly the message hunt sent
  (`Outreach.threadRef`).
- **Phase 8 is the whole remaining v1 bar, and it is narrowed** (PLAN.md §Phase 8):
  forkable + a first run that teaches + trust, each already encoded as a gate, plus
  three fixes on the stranger's own path (the two parser defects, re-extract with a
  model, page-count detection). Launch marketing — GIF, docs site, PH assets — is
  explicitly **not** in the definition of done. **Done = `pnpm gate 8` green and
  promoted.**
- `docs/DESIGN.md` / `docs/SCREENS.md` / `docs/TAILORING-DIFF.md` +
  `design/*.dc.html` are committed ground truth — build UI against them, don't
  invent layout. Source docblocks cite these by bare filename (`see DESIGN.md
  §5`), which still resolves; they are names, not paths.
- **`docs/reviews/wave-2.md` records what the wave-2 review found**, including
  three defect classes that each shipped in four of five areas. Read it before
  writing code in outreach, sourcing or tailoring.

## What the early phases established (don't relearn these)
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
- pnpm 10 via corepack; Node 22 (`.nvmrc`, and `engines` requires it). `pnpm
  verify` = typecheck + lint + test + **the promoted gates** + build — must stay
  green; it's the autoloop verifier.
- Keys live in the Settings UI (encrypted at rest in `./data/`), but
  `.env.local` may carry dev keys (e.g. `FIREWORKS_API_KEY` exists locally) —
  the LLM provider layer should support env fallback for dev. Never commit
  or log keys; `/data` and `.env*` are gitignored.
- Adapters (`lib/adapters/*`) always ship with a fixture-backed `Fake*` twin;
  tests and e2e run on fakes, live APIs only behind env flags.
- Honest AI is a product principle: no fake ATS scores; tailoring edits must
  cite source-resume paths (validator-enforced, not prompt-vibes).
