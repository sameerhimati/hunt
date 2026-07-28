# hunt — Phase Plan (Waves 1–4, Phases 1–8)

Planning artifact produced by Fable, 2026-07-24. Opus builds from this; the plan
is the contract. Read alongside `PLAN.md` (product truth), `DESIGN.md` /
`SCREENS.md` / `TAILORING-DIFF.md` / `design/*.dc.html` (UI truth), and
`AGENTS.md` (Phase 0 guardrails). Nothing here overrides those — it sequences
them.

**The gates are the plan.** Every phase has a committed, currently-RED verifier:
`pnpm gate <N>`. A phase is done when its gate is GREEN and `pnpm verify` +
`pnpm e2e` are still green. The gate files under `gates/` are the API contract —
builders implement *to* them and do not edit them (a gate may be amended only at
a human review boundary, with the change called out).

---

## 1. Execution model

```
Wave 1:  foundation₁ → [ P1 résumé-core ‖ P2 jobs+tracker ] → integrate → gate → HUMAN
Wave 2:  foundation₂ → [ P3 tailoring+evals ‖ P4 people+outreach ‖ P5 sourcing ] → integrate → gate → HUMAN
Wave 3:  foundation₃ → [ P6 LinkedIn ‖ P7 Gmail ] → integrate → gate → HUMAN
Wave 4:  [ P8 launch polish ] → gate (golden path + cold starts) → HUMAN → ship
```

This validates the DAG from `session-handoff.md` with **one structural
correction**: each wave gets a serial **wave-foundation step** before the fan-out.
The handoff DAG had a hidden intra-wave dependency — P3 *and* P5 both need the
fit-rating engine (P3 for the application match rating, P5 for batch board
rating). Two parallel implementations would drift into two definitions of
"Strong/Possible/Reach". The fix: shared seams are built serially at the top of
the wave, then the phases fan out file-disjoint. Same fix covers nav, the ⌘K
palette, shadcn primitive installs, and schema changes.

Every wave is bounded:
- **Entry state:** `main` green (`pnpm verify` + `pnpm e2e`), all prior waves'
  gates promoted into `gates/DONE`.
- **Fixed phase set:** exactly the phases listed — no scope pulled forward.
- **Integrate+verify gate:** merge worktrees → `pnpm verify && pnpm e2e &&
  pnpm gate <N>` for each phase in the wave → promote gates to `DONE` → verify
  again (proves the gates are now regression armor).
- **Single exit condition:** the wave branch is green on all of the above and a
  human has reviewed it. Merge to `main` is always human-performed.

### Worktree + branch layout per wave K
- `wave-<K>` integration branch, cut from `main` by preflight.
- Wave foundation commits land on `wave-<K>` directly (serial, one owner).
- Each phase N builds in worktree `../hunt-p<N>` on `feature/phase-<N>`, cut
  from `wave-<K>` *after* foundation. Phases never touch another phase's files
  (ownership maps below). `package.json`/`pnpm-lock.yaml` conflicts are resolved
  at integrate by re-running `pnpm install` — never hand-merged lockfiles.

### The gate mechanism (already wired, committed with this plan)
- `gates/unit/phase-<N>/*.gate.test.ts` — vitest, run via
  `vitest.gates.config.mts`. `gates/e2e/phase-<N>/*.gate.spec.ts` — Playwright,
  run via `playwright.gates.config.ts` (same prod server on :3100, plus
  `HUNT_TEST_MODE=1`).
- `pnpm gate <N>` runs both suites for phase N. **RED today for N=1..8.**
- `gates/DONE` lists completed phases. `pnpm verify` ends by running the unit
  gates of every DONE phase; `pnpm e2e` ends with the e2e gates of every DONE
  phase. Promoting a phase = appending its number to `gates/DONE`. So gates are
  RED-but-inert until their phase lands, then permanently part of verify.
- `gates/` is excluded from `tsc` and eslint **by design**: gate files import
  modules that don't exist yet (that's what makes them RED without breaking
  `pnpm verify` today). They are runtime-verified only. App code keeps full
  typecheck.
- Gate fixtures live in `gates/fixtures/`. Fixtures committed today:
  `resume/alex-chen.json` (the canonical sample résumé — this file **pins the
  ResumeContent shape**), `jobs/stripe-sbe.*`, `checks/keyword-coverage-1.json`
  (hand-labeled), `llm/tailor-stripe.json` (scripted tailor output incl.
  fabrications). Fixtures a phase must still record are that phase's **first
  task** (called out per phase below).

### Test-mode contract (Wave 1 foundation, used by every later gate)
`HUNT_TEST_MODE=1` ⇒ `createAdapter()` returns the `Fake*` twin loaded with
fixtures from `gates/fixtures/` (override dir: `HUNT_FIXTURES_DIR`), and
`resolveLlm()` returns `FakeLlmProvider` with a **script file** responder:
fixture JSON mapping a `promptKind` tag to a canned response. Every LLM call in
the app sends its kind as the first system block (`kind:tailor`, `kind:extract`,
`kind:rate`, …) so the fake can dispatch. Live APIs only ever run behind
explicit env flags (`HUNT_SMOKE_FIRECRAWL=1`, etc.), never in gates.

### Next.js 16.2.11 fork — what builders must know (from `node_modules/next/dist/docs/`)
- `params`/`searchParams`/`cookies()`/`headers()` are **async-only** — always await.
- `middleware.ts` is now **`proxy.ts`** (nodejs runtime only). We likely need
  neither; the onboarding redirect (P8) is a layout-level check, not proxy.
- `error.tsx` receives **`unstable_retry`**, not `reset`. Error boundaries are
  client components.
- Caching: top-level `cacheComponents: true` replaces dynamicIO/PPR flags; we
  **leave it off** (local-first, DB-backed, everything dynamic — Phase 0 already
  uses `force-dynamic`). If any page opts into caching later: `'use cache'` +
  `cacheTag()`, revalidate with `updateTag(tag)` in server actions
  (`revalidateTag` now requires a second profile arg).
- Mutations: server actions in `'use server'` files, invoked from forms /
  `startTransition`; body cap 1MB (résumé PDF upload goes through a **route
  handler** with `request.formData()`, not an action).
- Streaming an LLM response: route handler returning `new Response(readableStream)`;
  for the tailoring UI prefer server-action → stream rows via RSC/`use()`.
- Key guides: `01-app/02-guides/upgrading/version-16.md`,
  `01-getting-started/08-caching.md`, `09-revalidating.md`,
  `02-guides/server-actions.md`, `02-guides/streaming.md`,
  `01-getting-started/15-route-handlers.md`.

### Phase-0 guardrails (repeat in every builder prompt, verbatim from AGENTS.md)
DB self-migrates on first query · Prisma client lazy behind proxy ·
better-sqlite3 pinned to the adapter's version · `output: standalone` only via
`HUNT_STANDALONE=1` · every adapter ships a `Fake*` twin + `meta` block ·
providers declared once in `registry.ts` · keys never logged or committed ·
`pnpm verify` + `pnpm e2e` green at every wave gate.

### User agency & honesty — how they coexist (product stance)
People embellish résumés; companies inflate JDs. hunt is not the police. The
honest-AI invariant and user agency are **two different subjects**:
- **hunt never lies to the user**: no fake ATS score, qualitative tiers with
  reasons, checks named for what they measure. Non-negotiable.
- **hunt never authors an uncited claim**: the fabrication validator is a
  *provenance instrument*, not a morality gate. Refused claims are shown, never
  silently dropped — and **never block anything**. The user can always save,
  always hand-edit any field, any bullet, the raw LaTeX, the cover letter. The
  "Add it yourself" affordance (TAILORING-DIFF §5) is the designed escape hatch:
  the act is the user's, on their own document, on their own machine.
- **No lecturing, ever.** Copy never scolds or warns about "dishonesty"; the
  FabricationFlag states a fact ("no source in your résumé") and moves on.
  Tailoring prompts must not instruct the model to refuse aggressive reframing,
  strong verbs, or confident emphasis of real experience — reframing what's true
  is the product's job. Builders: any prompt or copy that moralizes at the user
  is a review-blocking bug.

---

## 2. Shared-seam ownership

These files are collision magnets. Per wave, each is touched by exactly one
owner. "F" = wave foundation, "I" = integrate step.

| Seam | Wave 1 | Wave 2 | Wave 3 | Wave 4 |
|---|---|---|---|---|
| `prisma/schema.prisma` + `prisma/migrations/` | F (then frozen) | F | F | P8 |
| `src/components/nav-rail.tsx` (un-dim links) | I | I | — | P8 |
| `src/components/app-shell.tsx` (⌘K mount) | F | — | — | P8 |
| `src/components/command-palette.tsx` + `src/lib/commands/*` | F (core + per-area files) | own files per phase | own files | P8 |
| `src/lib/providers/registry.ts` | — | — | F (gmail slot) | P8 |
| `src/lib/adapters/factory.ts` (test mode) | F | — | F (gmail case) | — |
| `src/components/ui/*` (shadcn adds) | F | F | F | P8 |
| `package.json` deps | any phase, merged at I (`pnpm install` re-run) | same | same | P8 |
| `src/app/applications/[id]/page.tsx` composition | P2 (slots for P3/P4) | frozen (slot files only) | frozen | P8 |
| `src/lib/fit/*` | — | F (core) then P5 adds `batch.ts` | — | — |
| `src/lib/llm/prompts/*` | F (registry file) | one file per phase | one file per phase | — |
| `gates/DONE`, `gates/**` | I only | I only | I only | I only |

Command-palette seam design: `src/lib/commands/registry.ts` (F, Wave 1) exports
`registerCommands(area, commands)`; each area contributes
`src/lib/commands/<area>.ts` owned by the phase that builds that area. The
palette component reads the registry. Later phases add commands without touching
the palette.

Application-detail seam design: P2 builds the page as a composition of slot
components — `checks-panel.tsx` (placeholder "Run checks lands in Phase 3"),
`contacts-card.tsx` + `outreach-timeline.tsx` (placeholders, Phase 4). P3/P4
replace **only their own component file**. The page file itself is frozen after
Wave 1.

---

## 3. Wave 1 — P1 résumé core ‖ P2 jobs + tracker

**Entry:** `main` green post-Phase-0. **Exit:** `pnpm gate 1` + `pnpm gate 2`
GREEN, verify+e2e green on `wave-1`, gates promoted, human review.
**Realistic first autonomous run target: this entire wave.**

### Wave 1 foundation (serial, on `wave-1`)
| Task | Files | Notes |
|---|---|---|
| F1.1 Test-mode wiring | `src/lib/adapters/factory.ts`, `src/lib/llm/index.ts`, `src/lib/testmode/*` (new) | `HUNT_TEST_MODE=1` ⇒ fakes + scripted FakeLlm (contract §1). This is the keystone for every gate. |
| F1.2 Schema delta | `prisma/schema.prisma`, `prisma/migrations/` | Only if P1/P2 tasks below need it (expected: none — Phase 0 schema already covers both; treat any request as a foundation change, run `pnpm db:migrate`, commit migration). |
| F1.3 ⌘K palette core | `src/components/command-palette.tsx`, `src/lib/commands/registry.ts`, `src/components/app-shell.tsx` | shadcn `Command` in dialog; mount in AppShell; theme toggle + nav commands. |
| F1.4 shadcn installs for the wave | `src/components/ui/*` | tabs, select, dialog, dropdown-menu, tooltip, badge, textarea, separator, scroll-area, skeleton, sonner, table, switch, accordion. One commit. |
| F1.5 Prompt registry scaffold | `src/lib/llm/prompts/index.ts` | `promptKind` tagging convention (first system block), per-feature prompt files slot in later. |

### Phase 1 — résumé core (the Overleaf killer)
**Done =** a user can import a PDF or start blank, edit a structured résumé with
a live Tectonic-rendered PDF beside it, keep named versions in a tree, and read
a semantic diff between any two versions.

**Exit gate:** `pnpm gate 1` — `gates/unit/phase-1/` (schema, render
determinism, import round-trip ≥95%, semantic diff, version lineage) +
`gates/e2e/phase-1/resume-editor.gate.spec.ts` (create → edit → save version →
compare shows DiffRows).

**Contracts the gate imports (implement exactly these):**
```
src/lib/resume/schema.ts     ResumeContent (zod; shape pinned by gates/fixtures/resume/alex-chen.json:
                             basics/experience[{company,title,location,start,end,bullets[]}]/education/
                             skills[{category,items[]}]/projects/custom) · parseResumeContent(unknown)
                             → ResumeContent (throws on invalid)
src/lib/resume/render.ts     renderToPdf({ content, templateId? , rawLatexOverride? }) →
                             Promise<{ pdf: Buffer, tex: string }>  — deterministic: SOURCE_DATE_EPOCH
                             pinned inside; same input ⇒ identical bytes
src/lib/resume/templates/index.ts  TEMPLATES: {id,name,render(content)→tex}[]  — ≥3: 'jakes',
                             'moderncv', 'deedy' (start from ~/Desktop/resumes/Sameer_Himati_Resume.tex
                             for the first — do NOT commit the real résumé content, only the template)
src/lib/resume/import.ts     importResumePdf(pdf: Buffer, llm) → Promise<{ content: ResumeContent,
                             fieldConfidence: Record<path, number> }>
src/lib/resume/diff.ts       semanticDiff(a: ResumeContent, b: ResumeContent) → ResumeChange[]
                             ({ kind: 'edit'|'add'|'remove'|'reorder', path, was?, now? });
                             diff(a,a) = []
src/lib/resume/store.ts      createResume(name, content) · saveVersion({resumeId, content, label,
                             parentVersionId?}) · versionTree(resumeId)
```

**Leaves (parallel inside the P1 worktree; paths are ownership):**
| Leaf | Files | Model hint |
|---|---|---|
| P1.a schema + store + diff | `src/lib/resume/{schema,store,diff}.ts` + unit tests | opus |
| P1.b Tectonic render + ensure-tectonic | `src/lib/resume/render.ts`, `scripts/ensure-tectonic.mjs` | opus — auto-download binary for bare metal (Docker already bundles it); deterministic output is the hard requirement |
| P1.c templates ×3 | `src/lib/resume/templates/*` | one sub-leaf per template; mechanical after the first |
| P1.d PDF import | `src/lib/resume/import.ts`, `src/app/api/resumes/import/route.ts` (route handler, formData) | opus |
| P1.e editor UI | `src/app/resumes/**`, `src/components/resume/**` (structured editor, version tree, PdfPreviewFrame, raw-LaTeX tab w/ detach warning, compare view) | opus — build against `Resume Editor.dc.html` + SCREENS §5 |
| P1.f import review screen | `src/components/resume/import-review.tsx` | amber low-confidence flags; reused by P8 onboarding |
| **P1.first** record import fixtures | `gates/fixtures/resume/sample-{1,2,3}.pdf` + `expected-{1,2,3}.json` + scripted parse outputs | **Verifier gap:** the ≥95% round-trip gate is committed but its 3 sample PDFs + hand-labeled expected JSON can't exist until a real parse prompt exists. First task of P1: create/record them (use public sample résumés, never Sameer's real one), then the gate measures for real. |

### Phase 2 — jobs in + tracker (the spine)
**Done =** paste a URL (or add manually) → Job → Application; drag cards across
an 8-column board (+ table view); application detail hub with slots; dashboard
funnel + activity.

**Exit gate:** `pnpm gate 2` — `gates/unit/phase-2/` (URL ingest via fake
scrape+LLM, status transitions + timestamps, funnel stats) +
`gates/e2e/phase-2/pipeline.gate.spec.ts` (paste fixture URL → card → detail →
status change survives reload; manual-entry fallback; dashboard funnel).
Real-Firecrawl smoke stays behind `HUNT_SMOKE_FIRECRAWL=1` (not the gate).

**Contracts:**
```
src/lib/jobs/ingest.ts       ingestJobUrl(url) → Promise<Job>  — scrape via createAdapter('firecrawl')
                             (fake in test mode), extract {title,company,location,jdText,companyBlurb}
                             via LLM promptKind 'extract'; AdapterError surfaces verbatim, no partial rows
src/lib/pipeline/status.ts   APPLICATION_STATUSES (ordered 8) · transitionApplication(id, status)
                             — stamps appliedAt/repliedAt/interviewAt/decidedAt on the matching moves
src/lib/pipeline/stats.ts    funnelStats() → {byStatus, conversions} · recentActivity(limit)
```

**Leaves:**
| Leaf | Files |
|---|---|
| P2.a ingest + manual entry | `src/lib/jobs/**`, `src/app/api/jobs/**`, new-application dialog component |
| P2.b status machine + stats | `src/lib/pipeline/**` + unit tests |
| P2.c board + table | `src/app/pipeline/**`, `src/components/pipeline/**` (dnd-kit; `Pipeline.dc.html`; status dropdown as the non-drag path — the e2e gate uses it) |
| P2.d application detail + slots | `src/app/applications/[id]/**`, `src/components/application/**` incl. placeholder `checks-panel.tsx`, `contacts-card.tsx`, `outreach-timeline.tsx` (`Application Detail.dc.html`) |
| P2.e dashboard | `src/app/page.tsx` (replaces Phase-0 placeholder), `src/components/dashboard/**` (`Dashboard.dc.html`; follow-ups panel renders empty-state until P4) |
| P2.f palette commands | `src/lib/commands/{pipeline,jobs}.ts` |
| P2 deps | dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) |

### Wave 1 integrate
Merge `feature/phase-1` + `feature/phase-2` into `wave-1`; re-run
`pnpm install`; un-dim `Resumes` + `Pipeline` in `nav-rail.tsx` (drop
`comingIn`); `pnpm verify && pnpm e2e && pnpm gate 1 && pnpm gate 2`; promote
`1 2` into `gates/DONE`; verify again. Human reviews `wave-1`, merges to `main`,
**dogfoods immediately** (import the real résumé locally).

---

## 4. Wave 2 — P3 tailoring+evals ‖ P4 people+outreach ‖ P5 sourcing

**Entry:** Wave 1 merged, gates 1–2 in DONE.

### Wave 2 foundation (serial)
| Task | Files | Notes |
|---|---|---|
| F2.1 Fit engine core | `src/lib/fit/rate.ts`, `src/lib/llm/prompts/fit.ts` | ONE definition of Strong/Possible/Reach: `rateFit({content, job}) → {tier, reasons[{text, citations[]}]}`. **Structurally no numeric score field** — the P3 gate asserts its absence. P3 consumes for match_rating; P5 wraps for batch. |
| F2.2 Schema delta | `prisma/schema.prisma` | Document `halted` as a legal Outreach.status value in the field comment + `src/lib/db/enums.ts` (note: PLAN references this file but Phase 0 never created it — create it here as the status-vocabulary module both P2 and P4 import). **Plus one carried-over defect (found in Wave 1 review):** add `offeredAt` and stamp it in `MILESTONES` (`src/lib/pipeline/status.ts`), then switch the `Offer` row of `MILESTONES` in `src/lib/pipeline/stats.ts` from `{ status: 'offer' }` to `{ offeredAt: { not: null } }`. Today every funnel milestone reads a timestamp *except* Offer, which reads current status — so an offer later marked `rejected` (declined, rescinded) silently drops out of the Offer count and the Interview→Offer rate. `offer` and `rejected` share `decidedAt`, so there is no existing column to read; this is the one real schema delta the wave needs. It contradicts the comment directly above it and the honest-funnel-maths principle in DESIGN.md §7. |
| F2.3 shadcn adds | `src/components/ui/*` | hover-card, progress, alert, avatar, popover as needed |

### Phase 3 — tailoring + evals (the wedge, the hero screen)
**Done =** tailor a version against a JD into a reviewed per-change diff with
citations, refusals rendered as FabricationFlags, save as pinned child version;
cover letter with the same guard; 4 honest checks + match rating on the
application page.

**Exit gate:** `pnpm gate 3` — the eval suite:
- `fabrication.gate.test.ts` — scripted LLM output containing 1 valid cited
  edit, 1 bad-path citation, 1 uncited claim ⇒ exactly one `accepted`-eligible
  change; the two others `refused` **and present** in the result; refused text
  never in the saved version nor the rendered tex.
- `citation.gate.test.ts` — citation paths must resolve into the source content
  and the cited snippet must appear in the source field.
- `keyword-coverage.gate.test.ts` — deterministic scorer vs the committed
  hand-labeled fixture (`checks/keyword-coverage-1.json`).
- `format-lint.gate.test.ts` — rigged fixture ⇒ issue codes
  `bullet-too-long`, `date-format-mixed`, `first-person`.
- `parse-fidelity.gate.test.ts` — render→re-parse→compare contract with a fake
  parser: dropped-field list + verdict mapping (0 dropped ⇒ pass).
- `match-rating.gate.test.ts` — tier ∈ {strong,possible,reach}, reasons carry
  citations, **no numeric score key anywhere in the payload**, and
  `runAllChecks` output has no aggregate field.
- e2e `tailoring.gate.spec.ts` — run tailor on the fixture application: DiffRows
  + FabricationFlag visible, accept → save v2 → pinned; checks panel shows the 4
  checks and the "no fake ATS score — by design" header.

**Contracts:**
```
src/lib/tailor/engine.ts     tailor({ baseVersion, job, llm }) → TailorRun
                             TailorChange { id, kind:'edit'|'add'|'remove'|'reorder', path, was, now,
                             why, citation: { path, snippet } | null, status:'proposed'|'refused',
                             refusedReason? }
src/lib/tailor/validator.ts  validateChanges(changes, source: ResumeContent) → TailorChange[]
                             (uncited or unresolvable/unsupported citation ⇒ status 'refused';
                             NEVER removes an entry; NEVER blocks saving the accepted subset)
src/lib/tailor/apply.ts      applyChanges(content, accepted) → ResumeContent (child version content)
src/lib/checks/index.ts      runAllChecks({version, job?}) → CheckResult[] (kinds: parse_fidelity,
                             keyword_coverage, format_lint, ai_tell, match_rating — no aggregate)
src/lib/checks/keyword-coverage.ts  scoreCoverage(terms: string[], content) → {matched[], missing[]}
src/lib/checks/format-lint.ts       lintFormat(content) → {code, path, detail}[]
src/lib/checks/parse-fidelity.ts    runParseFidelity(version, parser?) → {dropped: string[], verdict}
src/lib/fit/rate.ts          (foundation) — match_rating check wraps this
```

**Leaves:** P3.a engine+validator+apply (`src/lib/tailor/**`) · P3.b checks
(`src/lib/checks/**`, one file per check — sub-leaves) · P3.c tailoring UI
(`src/app/tailor/**` or route-in-application, `src/components/tailor/**`:
DiffRow, ChangeInspector, CitationChip, FabricationFlag, summary strip, keyboard
j/k/a/r/u/⌘↵ — `Tailoring.dc.html` + TAILORING-DIFF.md are the spec) · P3.d
cover letter (`src/lib/tailor/cover-letter.ts`, tab UI) · P3.e checks panel
(replace `src/components/application/checks-panel.tsx`) · P3.f ATS-parser pick
(research task first: evaluate open-source résumé parsers; wrap the pick behind
`src/lib/checks/parser-adapter.ts` with a Fake twin).
**Verifier gaps (P3 first tasks):** record scripted-LLM tailor fixtures beyond
the committed one; hand-label 2 more keyword-coverage fixtures; pick the ATS
parser (open question #4) and record its fixtures.

### Phase 4 — people + outreach
**Done =** find contacts via Apollo (or add manually), draft cited outreach,
manage sequences with day offsets that halt on reply, send via SMTP/Resend, and
track it — the dashboard follow-ups queue goes live.

**Exit gate:** `pnpm gate 4` — unit: sequence math (due dates from offsets;
reply ⇒ remaining steps halted), draft cites role + résumé highlight, fake-email
outbox capture flips status/sentAt/threadRef; e2e: add manual contact → draft
sequence → send step 1 ⇒ message lands in `.e2e-data/outbox.jsonl` (the fake
email adapter's capture file — mailpit stays an env-flagged smoke, the gate
must not need Docker).

**Contracts:**
```
src/lib/outreach/sequence.ts  createSequence({applicationId, contactId, steps}) ·
                              dueSteps(date) → Outreach[] · markReplied(outreachId) — halts the rest
src/lib/outreach/draft.ts     draftOutreach({application, contact, content, llm}) →
                              { subject, body, citations }
src/lib/adapters/email/fake.ts (extend) — test-mode capture: appends JSON lines to
                              `${dataDir()}/outbox.jsonl`
```

**Leaves:** P4.a sequence engine + follow-ups feed (`src/lib/outreach/**`;
dashboard follow-ups panel reads `dueSteps`) · P4.b drafting prompts
(`src/lib/llm/prompts/outreach.ts`) · P4.c Apollo wiring + contacts UI (replace
`contacts-card.tsx`; ContactCard per DESIGN) · P4.d outreach screen
(`src/app/outreach/**`, `src/components/outreach/**` — queue + composer +
SequenceTimeline, `Outreach.dc.html`) · P4.e send path + no-email-key degrade
("Copy / mark as sent manually") · P4.f timeline slot (replace
`outreach-timeline.tsx`) + palette commands.

### Phase 5 — sourcing
**Done =** keyword/location/remote search across job adapters (JSearch, Adzuna,
free boards), batch fit-rated results with reasons, one-click pull into
pipeline, saved searches.

**Exit gate:** `pnpm gate 5` — unit: fixture search returns normalized listings,
dedupe by `externalId` across adapters, `rateFitBatch` maps tiers from scripted
LLM + preserves reasons; SourcingRun recorded with resultCount; e2e: search →
FitTierBadge cards → Strong expands "Why it fits" → Pull into pipeline ⇒
`sourced` application appears on the board.

**Contracts:**
```
src/lib/sourcing/search.ts   searchJobs(query) → JobListing[] (multi-adapter, deduped, works keyless
                             via free_boards — the no-key tier is a product promise)
src/lib/fit/batch.ts         rateFitBatch(listings, content, llm) → Map<externalId, {tier, reasons}>
src/lib/sourcing/import.ts   pullIntoPipeline(listing) → { job, application }  (status 'sourced')
src/lib/sourcing/saved.ts    saveSearch(query) · runSavedSearch(id) — records SourcingRun
```

**Leaves:** P5.a search + dedupe (`src/lib/sourcing/**`) · P5.b batch rating
(`src/lib/fit/batch.ts`) · P5.c sourcing UI (`src/app/sourcing/**`,
`src/components/sourcing/**` — `Sourcing.dc.html`; DegradedBanner when no job
key, results-arrive-then-fill-rating state) · P5.d saved searches + palette.

### Wave 2 integrate
Merge 3 branches → `pnpm install` → un-dim `Sourcing`/`Outreach` →
verify + e2e + gates 3,4,5 → promote → human review. **This is the biggest
wave; if orchestration strains, P4 and P5 can degrade to serial-after-P3 with
zero plan changes (they share only wave-foundation files).**

---

## 5. Wave 3 — P6 LinkedIn ‖ P7 Gmail

**Entry:** Wave 2 merged, gates 1–5 in DONE.

### Wave 3 foundation (serial)
F3.1 `registry.ts` + `factory.ts` gmail slot (provider meta registered by P7 but
the shared-file edits happen here: add gmail case to factory switch, PROVIDERS
entry importing from a stub meta file P7 owns). F3.2 Settings sub-nav sections
(Email, LinkedIn) if not already split into per-section files.

### Phase 6 — LinkedIn adapter (at-own-risk, off by default)
**Done =** paste `li_at` cookie in Settings behind an explicit opt-in toggle +
ToS disclaimer; read-only people-graph intel (who's at company X, degree,
recruiter search) feeding Contacts alongside Apollo; deep links only, zero write
automation.

**Exit gate:** `pnpm gate 6` — unit: fixture-backed adapter returns people with
degrees; expired-cookie fixture ⇒ `AdapterError` naming the cookie, never a
crash; changed-markup fixture ⇒ clear error; **off-by-default enforced:
`createAdapter('linkedin')` returns null when the opt-in toggle is unset even
with a cookie present**; e2e: disclaimer visible on the Settings card; enabling
shows degree badges on contacts.

**Contracts:** extend `src/lib/adapters/linkedin/cookie.ts` (implement
`findPeopleAtCompany`), `FakeLinkedInAdapter` fixtures, opt-in setting key
`provider.linkedin.enabled`.
**Verifier gap (P6 first task):** record real response fixtures (voyager JSON),
including an expired-cookie and a changed-markup capture.
**Leaves:** P6.a adapter + fixtures · P6.b contact enrichment UI (degree badge,
"who do I know here" on sourcing results/detail) · P6.c Settings card
(disclaimer + toggle).

### Phase 7 — Gmail (user-owned OAuth) + the closed loop
**Done =** user pastes their own Google OAuth client ID/secret (their project,
test mode — no verification), hunt sends via Gmail API and **polls threads of
sent outreach to auto-flip `replied` and halt sequences**.

**Exit gate:** `pnpm gate 7` — integration tests against Gmail API mocks
(mocked `fetch`): token exchange + refresh, send returns id/threadId stored as
`threadRef`, `pollReplies()` on a thread-with-reply fixture flips Outreach →
replied, Application → replied, halts remaining steps (reuses the P4 sequence
gate assertions). No e2e gate — PLAN specifies a documented manual smoke
runbook with a real Gmail (`docs/runbooks/gmail-smoke.md`).

**Contracts:** `src/lib/adapters/email/gmail.ts` (EmailAdapter + `meta` with the
BYO-OAuth steps), `src/lib/google/oauth.ts` (exchange/refresh),
`src/lib/outreach/reply-detection.ts` (`pollReplies()` — manual "Check replies"
button in v1; cron later).
**Verifier gap (P7 first task):** author the Gmail API mock fixtures (send,
thread list, message get) from the public API shapes.
**Leaves:** P7.a OAuth flow + settings docs w/ screenshots · P7.b gmail adapter
+ fake twin · P7.c reply detection + status flip · P7.d runbook.

### Wave 3 integrate
Merge both → verify + e2e + gates 6,7 → promote → human review. (No new nav
areas; LinkedIn/Gmail surface inside Settings, Contacts, Outreach.)

---

## 6. Wave 4 — P8 launch polish (single phase, leaves still parallel)

**Entry:** Waves 1–3 merged, gates 1–7 in DONE.
**Done =** a non-technical stranger on a fresh machine reaches the end-goal
script in <15 min via Docker **or** `npx hunt-app`, guided by a real wizard,
with every empty/degraded/error state designed — and the repo is
launch-presentable.

**Exit gate:** `pnpm gate 8` —
- e2e `golden-path.gate.spec.ts`: the end-goal script on fakes, from a wiped
  data dir: first-boot redirect → wizard (welcome → keys → import résumé PDF →
  review → done) → dashboard → paste job URL → tailor → accept & save → contact
  → outreach send (outbox capture) → pipeline shows the full trail.
- e2e `trust.gate.spec.ts`: CSP header present; zero non-localhost network
  requests during a dashboard load (route-interception assert — the "no
  telemetry" claim, enforced).
- unit `packaging.gate.test.ts`: `bin` entry `hunt-app` exists, `engines.node
  >=22`, standalone build config intact behind `HUNT_STANDALONE=1`.
- **Outside pnpm (wave-gate steps, human/orchestrator-run):**
  `scripts/coldstart-docker.sh` and `scripts/coldstart-npx.sh` — fresh-clone
  Docker path and packed-tarball npx path on a clean tmpdir; README fresh-eyes
  review agent; `security-auditor` pass (keys at rest, nothing logged, CSP).

**Leaves:** P8.a onboarding wizard (`src/app/onboarding/**` per
`Onboarding.dc.html`; first-boot redirect via root layout check — not proxy.ts;
reuses P1's import-review component; progress persists) · P8.b `npx hunt-app`
runner (see §7) · P8.c states sweep (every screen × empty/degraded/error per
`System States.dc.html` — checklist-driven, one sub-leaf per area) · P8.d README
+ GIF + architecture diagram + honest-AI section + docs/ · P8.e CONTRIBUTING +
issue templates + name check (npm/domain/PH) · P8.f security pass + CSP ·
P8.g Product Hunt assets · P8.h CI (GitHub Action running verify + e2e + done
gates — the "small residual" from Phase 0, promoted to a real task).

---

## 7. Non-technical usability plan (cross-cutting; lands as P8.a/P8.b but designed now)

**Who:** Sameer's brother/friends — no terminal fluency assumed beyond pasting
one command.

1. **`npx hunt-app`** — a published launcher package:
   - Ships the standalone server (`HUNT_STANDALONE=1` build output) + static
     assets; `bin` script boots it on `localhost:4826` (HUNT), opens the
     browser, stores everything in `~/.hunt/` (`HUNT_DATA_DIR` default when
     packaged).
   - **Node ≥22 enforced** (`engines` + a friendly preflight message): on 22,
     better-sqlite3 installs from prebuilds in ~3s; on 20 it's a 2-minute
     source compile that fails without a C++ toolchain — the exact failure mode
     that kills non-technical installs (proven in the Phase-0 session).
   - Tectonic auto-downloads on first render with a visible progress state in
     the preview pane ("fetching the PDF engine, ~30s, one time") — never a
     silent hang.
   - Risks to burn down at P8 kickoff: package size (standalone + prisma
     engines), better-sqlite3 prebuild coverage per platform (darwin-arm64,
     darwin-x64, linux-x64, win — smoke each in CI), version skew between
     launcher and app (ship them as one package, no launcher-fetches-app).
   - Verifier: `scripts/coldstart-npx.sh` = `pnpm pack` → `npx ./tarball` in a
     clean tmpdir → poll `localhost:4826` → onboarding responds.
2. **First-run wizard** (`Onboarding.dc.html` is ground truth): Welcome → Keys
   (each row says what it unlocks *and what breaks if skipped*; LLM badged "the
   one to add"; live Test on blur; all skippable, "Continue anyway" persistent)
   → Import résumé (drop PDF → parse → review/fix with amber low-confidence
   flags; parse failure offers blank-start, never a dead end) → Done → Dashboard
   empty state with the next action. Progress persists across closes.
3. **Degraded-by-design everywhere** (built per-phase, audited at P8): every
   key-gated feature renders visible-but-dimmed with a DegradedBanner naming the
   exact key, the fallback, and a deep link to the exact Settings card. The
   keyless floor must stay genuinely useful: manual jobs + free-board sourcing +
   résumé editing + manual contacts + copy-paste outreach all work with zero
   keys.
4. **Error voice:** what failed, the real reason in mono (`402 — over plan
   limit`), 2–3 recovery actions. Never a stack trace, never lost work.
5. **Docs for humans:** README quickstart is the npx line + a GIF; the
   BYO-Google-OAuth guide has screenshots; every provider's Settings card links
   its own get-a-key page (already in `meta`).

---

## 8. Orchestration (how Opus runs this)

- **Per phase (manual mode):** `Workflow({scriptPath: '.claude/workflows/hunt-phase-build.js', args: {phase: N, dir?}})`
  — now gate-aware: the plan step reads this file + the committed RED gates
  (never edits them); integrate/autoloop drive `pnpm verify` + `pnpm gate N`.
- **Per wave (the intended mode):** `Workflow({scriptPath: 'scripts/orchestrate-phases.workflow.js', args: {wave: K}})`
  — preflight (main green, cut `wave-K`) → wave foundation (serial) → phases in
  parallel worktrees via child `hunt-phase-build` workflows → integrate (merge,
  un-dim nav, verify + e2e + gates) → promote gates to DONE → report and STOP.
  Human reviews `wave-K` and merges to `main`; the next wave is a new
  invocation. The script never merges to `main` and never pushes.
- **First autonomous run:** `args: {wave: 1}`. Then review, dogfood P1 with the
  real résumé, and kick off Wave 2.

## 9. Decisions taken in this plan (surfaced, not silent)

1. **Wave-level foundation step added** to the handoff DAG (fit engine, palette,
   schema, shadcn installs) — fixes the P3/P5 hidden dependency.
2. **Gates are runtime-verified only** (excluded from tsc/eslint) so they can be
   committed RED without breaking `pnpm verify`. Promotion via `gates/DONE`
   folds them into verify/e2e forever after.
3. **`gates/fixtures/resume/alex-chen.json` pins the ResumeContent shape** now
   (citation paths like `experience[0].bullets[3]` come from the design docs) —
   P1 implements the schema to the fixture, not vice versa.
4. **E2E gates avoid dnd-kit drag simulation** (flake factory); the status
   dropdown is the tested path, drag is UI polish verified by humans.
5. **Mailpit demoted from the P4 gate** to an env-flagged smoke; the fake email
   adapter's `outbox.jsonl` capture keeps the gate Docker-free and deterministic.
6. **P6 gains an off-by-default gate** (adapter refuses to construct without the
   explicit opt-in toggle) — the ToS posture is enforced in code, not copy.
7. **User-agency stance codified** (§1): validator = provenance instrument;
   nothing blocks, nothing lectures; "Add it yourself" is the escape hatch.
8. **`src/lib/db/enums.ts`** is referenced by the schema comment but was never
   created in Phase 0 — created in Wave 2 foundation where the status
   vocabularies are first shared.
9. **Port 4826** for the packaged `npx` runner (avoids 3000 clashes on dev
   machines); dev/e2e ports unchanged.
