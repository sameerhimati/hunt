# hunt

The whole job hunt in one app: resume → tailor → verify → find the human → outreach → track. Every AI edit has to cite the line it came from.

Job hunting today means Overleaf for the resume, a spreadsheet for tracking, LinkedIn for sourcing, some keyword tool for ATS anxiety, Apollo for finding recruiters, and Gmail for cold email. Six tabs, none of them talking to each other. hunt collapses that loop into one app you run yourself — and holds it to a rule the rest of the category doesn't.

## Quickstart

```sh
npx hunt-app
# or
git clone https://github.com/sameerhimati/hunt && cd hunt && docker compose up
```

Open <http://localhost:3000>. First boot walks you through setup — and every
step of it is skippable, because none of it is required: importing your resume,
the editor, the pipeline and public-board search all work with no API key at
all.

## It refuses to make things up

**There is no fake ATS score anywhere in hunt.** Every other tool in this space
gives you a number — an "ATS match score", a
"resume grade", a compatibility percentage. Nobody outside an ATS vendor knows
how Workday actually scores a resume, so those numbers are invented. hunt does
not have one, anywhere, and there is nowhere in the data model to put one.

When hunt tailors your resume, **every proposed edit has to cite the place in
your own resume it came from**. A claim it cannot trace gets refused — and the
refusal is *shown to you*, in the position the text would have occupied, with
the option to write it yourself. That check is code that runs after the model,
not an instruction inside the prompt.

Instead of a score, you get four things that are actually measurable:

- **Parse fidelity** — hunt renders your PDF, re-parses it, and shows you what an
  ATS would really extract.
- **Keyword coverage** against the job description, with the terms named.
- **Format lint** — the things that break parsers.
- **An AI-tell audit** — does this read like a model wrote it.

## What it does

- **Resume as data.** Your resume lives as structured, versioned data and renders to PDF through LaTeX templates. Diff any two versions semantically. No Overleaf.
- **Tailoring you can audit.** Tailoring against a job description produces a new version shown as a diff — every change annotated with why, every claim traceable back to your base resume, every refusal visible.
- **Paste a job URL**, get the posting and company scraped into your pipeline. Or type it in by hand.
- **Search real job boards.** Greenhouse, Lever, Ashby and Remotive, with no key at all.
- **Find the human.** Look up the recruiter or hiring manager, draft outreach and follow-up sequences, send from your own email. hunt never sends anything on its own — it prepares, you click send.
- **Track everything.** Pipeline board with the exact resume version pinned to every application, funnel stats, and a follow-ups-due queue.

## What works with no API keys at all

More than you'd expect, and this is deliberate:

- Importing the resume you already have, PDF or .docx — read from your document's own layout, so nothing is invented and every field traces back to text you wrote.
- The full resume editor — structured fields, three LaTeX templates, live PDF, raw-LaTeX escape hatch, named versions, and a semantic diff between any two of them.
- The whole pipeline — manual job entry, board and table views, statuses, the dashboard.
- Job search across the four public boards above.
- Four of the five checks (everything except match rating).
- Outreach sequences you write yourself, with copy-to-clipboard and mark-as-sent.

**Adding one LLM key** — Anthropic, or any OpenAI-compatible endpoint — turns on
tailoring, cover letters, fit ratings, and outreach drafting. It also re-reads an
imported PDF, which can help on an unusual layout; import works without it.
Every other integration is optional and only widens what you already have.

## Status

Pre-alpha, building in public. Phases 0–5 are built and gated: resume core,
pipeline, tailoring and checks, outreach, and sourcing, plus the first-run
wizard. What's left is launch polish. Automatic reply detection is cut from v1 —
you mark replies yourself, and the app says so rather than implying otherwise.

**[The roadmap](docs/roadmap.md) is public** — what's built, what's next, and
what we've decided not to build. That last section is the important one: no match
scores, no auto-apply, no LinkedIn scraping, and nothing that invents experience
you don't have. Architecture and phase detail live in [docs/PLAN.md](docs/PLAN.md).

It's usable today; it is not finished.

## Principles

- **Local-first.** SQLite on your disk, single user, no accounts, no telemetry, no hosted backend. Your resume and your job hunt never leave your machine except through API calls you configure.
- **Bring your own keys.** Every integration runs on keys you provide, entered in the app. Everything is optional; features degrade gracefully — and visibly — when a key is missing.
- **Any LLM.** Anthropic is the tuned default, but the provider layer takes any OpenAI-compatible endpoint: OpenAI, OpenRouter, Fireworks, Together, Groq, or local models via Ollama.
- **Nothing is sent on your behalf.** hunt drafts; a human presses send. Tools that auto-apply are how people get blacklisted.

## Stack

Next.js / TypeScript / Tailwind / SQLite + Prisma / Tectonic (LaTeX → PDF). Ships as Docker compose or a local dev server.

## Running it

```sh
docker compose up
# or, if something already has port 3000:
HUNT_PORT=3300 docker compose up

# without Docker — needs Node 22
npx hunt-app
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

`pnpm verify` — typecheck, lint, unit tests, the promoted phase gates, then build
— is what every change has to pass. `pnpm e2e` runs Playwright plus the gate
specs against a production build. Tests run entirely on fixture-backed fake
adapters: no keys, no network.

Each phase's acceptance tests are written and committed **failing**, before the
phase is built, under `gates/`. They are the contract, they are read-only to the
implementation, and once a phase passes, its number is appended to `gates/DONE`
and its gates run forever after.

Keys can also come from the environment (`ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`,
and friends) during development; anything saved in Settings takes precedence.

## License

[MIT](LICENSE)
