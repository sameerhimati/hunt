# hunt

The whole job hunt in one local app: resume → tailor → verify → find the human → outreach → track.

Job hunting today means Overleaf for the resume, a spreadsheet for tracking, LinkedIn for sourcing, some keyword tool for ATS anxiety, Apollo for finding recruiters, and Gmail for cold email. Six tabs, none of them talking to each other. hunt collapses that loop into one app that runs on your machine.

## What it does

- **Resume as data.** Your resume lives as structured, versioned data and renders to PDF through LaTeX templates. Diff any two versions. No Overleaf.
- **Paste a job URL**, get the posting and company scraped into your pipeline.
- **Tailoring you can audit.** Tailoring against a job description produces a new version shown as a diff — every change annotated with why, every claim traceable back to your base resume. It will not invent experience for you.
- **Honest checks, no fake scores.** Nobody outside an ATS vendor knows how Workday scores a resume, so we don't pretend to. Instead: parse fidelity (render your PDF, re-parse it, see what an ATS would actually extract), keyword coverage against the JD, format lint, and a "does this read like AI wrote it" audit.
- **Find the human.** Look up the recruiter or hiring manager, draft outreach and follow-up sequences, send from your own email.
- **Track everything.** Pipeline board with the exact resume version pinned to every application, funnel stats, and a follow-ups-due queue.

## Principles

- **Local-first.** SQLite on your disk, single user, no accounts, no telemetry, no hosted backend. Your resume and your job hunt never leave your machine except through API calls you configure.
- **Bring your own keys.** Every integration — LLM, scraping, contact lookup, job search, email — runs on keys you provide, entered in the app. Everything is optional; features degrade gracefully when a key is missing.
- **Any LLM.** Anthropic is the tuned default, but the provider layer takes any OpenAI-compatible endpoint: OpenAI, OpenRouter, Fireworks, Together, Groq, or local models via Ollama.

## Status

Pre-alpha, building in public. The full plan — architecture, data model, phased milestones — is in [PLAN.md](PLAN.md).

**Phase 0 is done:** the app runs, and Settings stores your API keys encrypted on disk. The features above land in Phases 1–8, so there is nothing to job-hunt with yet — watch the repo if you want to follow along.

## Stack

Next.js / TypeScript / Tailwind / SQLite + Prisma / Tectonic (LaTeX → PDF). Ships as Docker compose or a local dev server.

## Running it

```sh
docker compose up
# or, if something already has port 3000:
HUNT_PORT=3300 docker compose up
```

Then open <http://localhost:3000> and add your keys under Settings. The image
bundles Tectonic, so there is no TeX install to do, and the database builds
itself on first boot — there is no migrate step.

Everything hunt stores lives in `./data`: the SQLite database and the secret
that encrypts your API keys. Back up that directory and you have backed up
hunt. Delete it and you are back to a clean install.

## Development

```sh
pnpm install
pnpm dev
```

`pnpm verify` (typecheck + lint + tests + build) is the gate every change has to
pass; `pnpm e2e` drives the Playwright suite against a production build. Tests
run entirely on fixture-backed fake adapters — no keys, no network.

Keys can also come from the environment (`ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`,
and friends) during development; anything saved in Settings takes precedence.

## License

[MIT](LICENSE)
