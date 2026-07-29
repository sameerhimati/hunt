# hunt — Plan

Open-source, local-first job-hunt platform. Bring your own keys. One app for the
whole loop: **source → tailor → verify → find the human → outreach → track → learn.**

**UI ground truth:** `DESIGN.md` (design system), `SCREENS.md` (per-screen spec),
`TAILORING-DIFF.md`, and `design/*.dc.html` mockups. Dark theme is the shipped
default; nav is a left rail + ⌘K command palette; the honesty patterns (no
aggregate ATS score, qualitative fit tiers, cited-or-refused tailoring) are
non-negotiable.

## End goal (Definition of Shipped)

A stranger on Product Hunt can, on a fresh machine:

1. `git clone` + `docker compose up` (or `npx hunt-app`)
2. Open the browser, paste their API keys in Settings (Anthropic/OpenAI-compatible, Firecrawl, Apollo, job API — each optional, features degrade gracefully)
3. Import their existing resume (PDF), get it as structured data + a rendered LaTeX PDF
4. Paste a job URL → tailored resume (with visible diff + no-fabrication guarantee) + cover letter + honest ATS checks
5. Find the recruiter via Apollo, get a drafted outreach email, send it from their own email
6. Track everything on a pipeline board, resume version pinned per application

…in under 15 minutes, with **zero data leaving their machine** except the API calls they configured.

## Product principles

- **Local-first.** SQLite on disk, single user, no auth, no telemetry, no hosted backend. Privacy is the headline.
- **BYOK everywhere.** Keys entered in the Settings UI, stored in the local DB. Every integration is optional; the app degrades gracefully (no Apollo key → outreach still drafts, just no contact lookup). Each provider ships **metadata** — where to get the key (deep link), 2–4 setup steps, a free-tier note, and a degradation string — one source that drives the Settings card, the docs, and onboarding (honest onboarding, not "figure it out"). v1 registers the **bold set** and nothing else (Anthropic, OpenAI-compat, Firecrawl, Apollo, JSearch+Adzuna, SMTP/Resend) — **every registered provider is live**. An adapter that isn't wired stays out of the registry: a card you can fill in and get nothing from is a promise the code doesn't keep. Test-enforced.
- **Honest AI.** No fake "Workday score: 87." Checks are labeled as what they are: parse fidelity, keyword coverage, format lint, AI-tell audit. Tailoring never fabricates — every claim traces to the source resume. This honesty is a README selling point.
- **Adapters, not hardcoded integrations.** Every external service sits behind a thin interface (`lib/adapters/*`). Stubs and fixtures swap in for tests and offline dev.
- **The diff view is the product.** Tailoring output is always shown as a reviewed diff against the base version, never a silent rewrite.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (App Router) + TypeScript | Single monolith; server actions / route handlers for API |
| UI | Tailwind + shadcn/ui | Kanban via dnd-kit |
| DB | SQLite + Prisma | DB file in `./data/hunt.db` (volume-mounted in Docker) |
| LLM | Anthropic SDK (native, prompt caching) + OpenAI-compatible client | Thin `lib/llm` abstraction; Claude is the tuned default. OpenAI-compatible = user-set base URL + key; the **model list is discovered from the provider's `/v1/models` endpoint, never hardcoded** (Fireworks alone rotates dozens). Covers OpenAI, OpenRouter, Fireworks, Together, Groq, DeepSeek, local Ollama/vLLM — the whole open-model ecosystem with one adapter |
| LaTeX | Tectonic | Bundled in the Docker image; auto-download for bare-metal dev |
| Scraping | Firecrawl (BYOK) | JD + company pages. The Bright Data stubs were cut 2026-07-28 — a Settings card asking for a key that fed a code path throwing `NotWiredError` |
| People | Apollo.io (BYOK) + manual entry | Contact/recruiter lookup + enrichment; a hand-added contact with their profile URL is both the keyless floor and the replacement for the cancelled LinkedIn adapter |
| Job APIs | JSearch + Adzuna (BYOK) + free boards | **US-first, keep it simple.** JSearch = broad US via RapidAPI/Google-for-Jobs; Adzuna = official first-party API, free tier. Plus **free/no-key** boards (Greenhouse/Lever/Ashby, Remotive). Other countries + salary data are a later, not-v1 concern |
| Email | SMTP/Resend (BYOK) first; Gmail over **IMAP + app password** later | Reply detection is an IMAP feature, not a Gmail-API one — see below |
| E2E | Playwright | Drives the launch-critical flows |

### Gmail without OAuth (researched 2026-07-27)
Reply detection means: find the message that replied to *the one we sent*. IMAP has
a standards-mandated answer — `SEARCH HEADER References "<id>"` matches exactly that,
off the `Outreach.threadRef` we already store. Gmail's API has no header search; its
only message-id operator is `rfc822msgid:`, which matches a message by its **own** id,
so the best the API can do is approximate with `from:X after:Y`.

So: app password, three setup steps against OAuth's eight, no Google Cloud project,
and no 7-day refresh-token expiry (which every Testing-status OAuth app gets). It sits
behind an adapter with a `Fake` twin, so a Gmail-OAuth adapter can land later if Google
retires app passwords — Microsoft already did for personal Outlook.com in Sept 2024.

## Data model (Prisma sketch)

```
Resume          id, name, createdAt
ResumeVersion   id, resumeId, label, content(JSON), rawLatexOverride?, parentVersionId?, createdAt
Template        id, name, engine(latex), source            // Jake's, moderncv, etc.
Job             id, url, title, company, location, jdText, companyBlurb, source(paste|api|linkedin), scrapedAt
Application     id, jobId, resumeVersionId, status, matchScore?, notes, timestamps per stage
                status: sourced → tailored → applied → outreach → replied → interview → offer | rejected
Contact         id, applicationId?, companyId?, name, title, email?, linkedinUrl?, source(apollo|linkedin|manual)
Outreach        id, applicationId, contactId, sequenceStep, subject, body, status(draft|sent|replied|bounced), sentAt, threadRef?
CheckResult     id, resumeVersionId, jobId?, kind(parse_fidelity|keyword_coverage|format_lint|ai_tell|match_rating), score, details(JSON), createdAt
SourcingRun     id, query(JSON), adapter, resultCount, createdAt
Setting         key, value(encrypted-at-rest via local secret file)   // API keys, SMTP config, feature flags
```

Key invariant: `Application.resumeVersionId` pins the exact version sent — provenance
for the future "what actually converts" analytics.

## Architecture notes

- `lib/adapters/` — `scrape` (Firecrawl), `people` (Apollo), `jobs` (JSearch/Adzuna + free boards), `email` (SMTP/Resend; Gmail-IMAP in Phase 7), each with a `Fake*` twin backed by fixtures for tests/offline **and a `meta` block** (getKeyUrl, steps, freeTier, degradation). `linkedin/` still exists as a dormant, **unregistered** seam (Phase 6 cancelled — below): it renders no Settings card and `createAdapter` cannot build it.
- `lib/llm/` — provider abstraction (Anthropic native + OpenAI-compatible), prompt registry, **prompt caching on the base-resume prefix** (same resume resent on every tailor/score/draft call — verify `cache_read_input_tokens` in dev logs).
- `lib/resume/` — schema (superset of JSON Resume), import (PDF → LLM → structured), LaTeX rendering (template + content → .tex → Tectonic → PDF), diffing (structured semantic diff, not text diff).
- `lib/checks/` — the evals layer. Parse fidelity runs the *rendered PDF* back through open-source ATS-style parsers and compares to source structure.
- No-fabrication enforcement: tailoring prompt returns edits **with citations to source-resume paths**; a validator rejects any bullet that cites nothing. This is code, not vibes.

---

## Phases

Each phase is an autoloop-able unit: scoped, with a **verifiable exit gate**.
Global verifier from Phase 0 onward: `pnpm verify` = typecheck + lint + unit/integration tests + build.
E2E gates use `pnpm e2e` (Playwright, fake adapters unless noted).

### Phase 0 — Skeleton & keys
Scaffold Next.js + Prisma + SQLite; Settings UI for keys (encrypted at rest via generated local secret file); `lib/llm` provider layer (OpenAI-compatible model list **discovered from `/v1/models`**); adapter interfaces + fakes + `meta` blocks (getKeyUrl/steps/free-tier/degradation) driving the Settings cards; Docker compose (app + Tectonic in image); `pnpm verify` wired.
**Exit gate:** fresh clone → `docker compose up` → Settings page saves/loads a key; `pnpm verify` green; LLM round-trip test passes against a fake provider.

### Phase 1 — Resume core (the Overleaf killer)
Structured resume editor (sections: profile, experience, education, skills, projects, custom); PDF import → LLM parse → structured (review/fix screen); versioning with named versions + semantic diff view between any two; 2–3 LaTeX templates; Tectonic render to PDF with live preview; raw-LaTeX escape hatch per version (edit the generated .tex directly; flagged as detached from structured editing).
**Exit gate:** golden tests — fixture resume JSON renders byte-stable PDFs per template; import of 3 sample PDFs round-trips ≥95% of fields; diff view e2e passes.

### Phase 2 — Jobs in + tracker (the spine)
Paste-a-URL ingest via Firecrawl (JD + company page → `Job`); manual job entry fallback; pipeline board (kanban by status) + table view; application detail page (job, pinned resume version, checks, contacts, outreach — later phases fill these in); **home dashboard** — pipeline summary, funnel stats (applied → replied → interview), recent activity; grows a "follow-ups due today" queue in Phase 4.
**Exit gate:** e2e — paste URL (fixture-backed fake Firecrawl) → job card → create application → drag through statuses; real-Firecrawl smoke test behind an env flag.

### Phase 3 — Tailoring + the evals layer (the wedge)
Tailor resume version against a JD → new child version + **semantic diff with per-change rationale**; no-fabrication validator (citation-checked edits; violations shown, not silently dropped); cover-letter generation; checks: keyword coverage vs JD, format lint, parse fidelity (render → re-parse → compare), AI-tell audit; match rating (role ↔ resume fit score with reasons).
**Exit gate:** eval suite — fabrication test (JD demanding skills absent from resume → zero uncited claims in output), keyword-coverage scoring against hand-labeled fixtures, checks render on application page in e2e.

### Phase 4 — People + outreach
Apollo adapter: company → recruiters/eng managers; contact cards on the application; outreach drafting (email referencing role + resume highlights); **sequences** (initial + N follow-ups with day offsets, stored as steps); send via SMTP/Resend (BYOK); manual status updates (sent/replied) so tracking works before Gmail.
**Exit gate:** e2e with fake Apollo + local SMTP capture (mailpit) — find contact → draft sequence → send step 1 → message lands in mailpit; sequence scheduler unit-tested.

### Phase 5 — Sourcing
Job-API adapter (JSearch/Adzuna, + free/no-key boards Greenhouse/Lever/Ashby/Remotive): keyword/location/remote search → job cards; board-match rating over results (which of these fit *my* resume — batch LLM scoring); one-click "pull into pipeline"; saved searches with manual re-run (cron later).
**Exit gate:** e2e with fixture job-API responses — search → rated results → import to pipeline; rating quality spot-checked against labeled fixtures.

### ~~Phase 6 — LinkedIn adapter (at-own-risk, off by default)~~ — **CANCELLED 2026-07-26**
*Would have been:* cookie-session auth (user pastes their `li_at`); people-graph intel — who works at company X, connection degree, recruiter search — feeding `Contact` alongside Apollo; deep links only, no write automation; ToS disclaimer + feature flag.

**Why it's cut,** in the order the reasons mattered:
1. It is the only integration in the product that can get the user's **own** LinkedIn account restricted. Nothing else here can hurt them.
2. A trust-first, local-first product cannot ship a card whose copy is "this may violate their ToS, the risk is yours." Shipping the warning instead of the cut was the worst of both.
3. It parses an undocumented internal endpoint, so its fixtures go stale **by definition** — permanently the highest-maintenance module in the repo, for a secondary feature.

**The replacement:** a manually-added contact + `Contact.linkedinUrl` deep-linking out to their profile + the existing outreach drafter writing the message. Most of the value, no cookie, and it cannot harm the user.

**What survives:** `src/lib/adapters/linkedin/{cookie,types}.ts` as a dormant, unregistered seam (no Settings card, `createAdapter` can't build it); `Contact.linkedinUrl`; the `paste|api|linkedin` and `apollo|linkedin|manual|brightdata` source vocabularies. `gates/unit/phase-6/` and `gates/e2e/phase-6/` stay committed, RED, and never promoted — `gates/DONE` skips 6.

### Phase 7 — Gmail (IMAP + app password)
Settings flow for a Gmail app password (docs with screenshots); send via SMTP as today; **reply detection over IMAP** — `SEARCH HEADER References "<threadRef>"` finds the reply to exactly the message we sent → auto-flip status to `replied`, advance/halt sequences; the closed loop, closed. No OAuth, no Google Cloud project — see *Gmail without OAuth* above for why the API can't do this.
**Exit gate:** integration tests against a fake IMAP server; manual smoke test with a real personal Gmail documented in a runbook; sequence-halt-on-reply unit-tested.

### Phase 8 — Launch polish
Onboarding (first-run wizard: keys → import resume → first job); empty states, error states, key-missing states everywhere; README with GIF demo, architecture diagram, honest-AI section; docs site or thorough `/docs`; `npx` runner and/or one-line install script alongside Docker; license + CONTRIBUTING + issue templates; Product Hunt assets (tagline, gallery, first-comment); security pass (keys encrypted at rest, no key ever logged, CSP).
**Exit gate:** full Playwright run of the end-goal script (steps 1–6 above) with fake adapters; two cold-start tests on clean machines (Docker path + npx path); README review by fresh-eyes agent.

---

## Build system (how we execute)

- **Fable plans, Opus builds, autoloop grinds.** Each phase gets a kickoff: expand this plan section into concrete tasks + tests *first* (the verifier is the deliverable of planning), then `/autoloop` against `pnpm verify` + the phase's exit-gate suite.
- **Subagents:** fan out research (LaTeX template licensing, JSearch vs Adzuna, Apollo API surface, ATS parser libraries) and exploration; keep conclusions, not dumps. `reviewer` pass at each phase boundary; `security-auditor` before Phase 8 exit.
- **Fixtures over live calls.** Every adapter gets recorded fixtures on day one; live-API smoke tests run behind env flags only.
- **One phase = one PR-sized unit** (or a few commits max), even pre-collaborators — keeps history reviewable for open source.

## Open questions (decide before the relevant phase)

1. **Name.** "hunt" is the working name; check npm/domain/PH availability before Phase 8.
2. **License.** MIT (max adoption) vs AGPL (blocks closed SaaS clones). Leaning MIT for a PH launch; decide by Phase 8.
3. ~~**Job API pick.**~~ **Resolved:** ship both (it's an adapter) — JSearch (broad US) + Adzuna (official, free tier) — plus free/no-key boards for a works-before-any-key tier. **US-only for v1**; other countries + salary data are later adapter additions.
4. **ATS parser(s) for parse-fidelity.** Candidate libs to evaluate at Phase 3 kickoff (open-source resume parsers; possibly a second LLM-as-parser baseline).
5. **PDF export without LaTeX** (HTML→PDF fallback for users allergic to Tectonic)? Default no; revisit if Phase 1 friction says otherwise.
