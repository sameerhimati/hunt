<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# hunt — session orientation

**Read `PLAN.md` first.** It is the source of truth: end goal, principles,
stack, data model, and Phases 0–8 each with a verifiable exit gate.

## Current state
- Phase 0 (skeleton & keys) is next. Task breakdown exists in the session task
  list (scaffold ✅ partial → encrypted settings → Settings UI → lib/llm →
  adapter fakes → Docker/Tectonic → exit gate).
- `DESIGN.md` + HTML mockups are being produced in a separate design session
  and will be committed as ground truth for all UI work. Phase 0 is plumbing
  (no UI beyond a functional Settings page) — don't invest in visual polish
  until DESIGN.md lands.

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
