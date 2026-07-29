# Competitors

Researched 2026-07-26. The point of this file is to stop us rediscovering the
landscape every few weeks, and to keep one honest list of what to take, what to
refuse, and what we're actually differentiated on.

**Headline: local-first / open-source / BYOK / self-hosted / no-telemetry are
table stakes in this niche, not differentiators.** Five competitors have all of
them. What survives is the honest-AI stance and the résumé editor.

---

## 1. The field

| | **hunt** | **ai-job-search** | **JobOps** | **career-ops** | **JobSync** | **Resume Matcher** |
|---|---|---|---|---|---|---|
| Traction | pre-launch | **28.5k ★, 9.4k forks in 4 months** | HN post | niche | small | 27.9k ★ |
| Licence | MIT | MIT | — | MIT | MIT | Apache 2.0 |
| Résumé import | PDF | PDF, LinkedIn export, interview | PDF | local files | **PDF + DOCX** | **PDF + DOCX** |
| **Live editor + PDF preview** | **✅ Tectonic** | ✗ (no UI at all) | generates only | generates only | Tiptap, 2 templates | builder, drag-drop |
| **Real LaTeX typesetting** | **✅** | **✅ moderncv** | ✗ | ✗ | ✗ | ✗ (CSS imitation) |
| **Version tree + semantic diff** | **✅** | ✗ | archives sent version | ✗ | multiple résumés | ✗ |
| **Tailoring cited to your résumé** | **✅ validator-enforced** | prompt-level only | ✗ | ✗ | ✗ | ✗ |
| **Refuses uncited claims, shows refusal** | **✅ unique** | gaps named, not enforced | ✗ | ✗ | ✗ | post-hoc diff guard |
| Fake composite score | **refuses, by design** | fit score on postings; no ATS score | — | 1.0–5.0 rubric | match scores | ATS score /100 |
| Verifies the *compiled PDF* | **✅ parse-fidelity diff** | ✅ `pdftotext` checklist | ✗ | ✗ | ✗ | ✗ |
| Page-overflow / layout check | ⚠️ **gap** | **✅ compile-and-inspect loop** | ✗ | ✗ | ✗ | ✗ |
| JD frozen at apply time | ⚠️ **gap** | archives submission | **✅** | ✗ | ✗ | ✗ |
| Which résumé version performs best | ⚠️ **data exists, unbuilt** | ✗ (`/outcome` is per-application) | ✗ (asked for on HN) | ✗ | ✗ | ✗ |
| Drafts open-ended application answers | ⚠️ **gap** | ✗ | ✗ | **✅ Greenhouse/Ashby/Lever** | ✗ | ✗ |
| Guided enrichment instead of inventing | ⚠️ **gap** | **✅ `/expand`** | ✗ | ✗ | ✗ | **✅** |
| Pipeline tracking | ✅ 8-status board | offline HTML report | ✅ | terminal dashboard | ✅ + tasks/time | ✗ |
| Keyless job search | ✅ company boards | DK portals + LinkedIn public | JobSpy, Glassdoor | **150+ portals** | Greenhouse/Lever | ✗ |
| Outreach + sequences | **✅ unique** | ✗ | ✗ | ✗ | ✗ | ✗ |
| Email reply detection | P7 planned | ✗ | ✗ (top HN ask) | ✗ | ✗ | ✗ |
| Cover letter | ✅ cited | ✅ LaTeX, 1 page | ✗ | ✗ | ✗ | ✅ |
| Interview prep | ✗ | **✅ `/interview`, STAR** | ✗ | ✗ | ✗ | ✅ |
| Accounts required | none | none | none | none | **yes** | none |
| Install | pnpm / dev server | **Claude Code + Python + Bun + full TeX** | Docker | **an AI coding CLI** | Docker | Docker |
| Business model | none | Ko-fi | none | sponsors | none | none |

**Six tools, ~zero revenue, all technical-user.** That segment is saturated and
pays nothing. The unserved audience is the non-technical one — sign in, upload,
paste a job — and nobody is there because hosting, auth, support and inference
costs are the hard part. If that's ever pursued: OSS core + optional hosted
version (Cal.com / Supabase model), not a rewrite.

### ai-job-search, added 2026-07-29 — the entrant that changes the picture

Not a competing app: a **Claude Code skill pack you fork** (`/setup → /scrape →
/apply → /interview → /outcome`), profile in markdown, portals as Bun CLIs. It
passed Resume Matcher — the leader this file named three days ago — in four
months, and its prerequisites are Claude Code *plus* Python *plus* Bun *plus* a
full TeX install with both lualatex and xelatex. Install friction did not gate it.

**What bought the stars is the README's second section**, before any feature: the
author's own funnel. Position cut in late 2025, 69 tailored applications, 20
first interviews, one signed contract, started as an AI engineer in June 2026.
That is the artifact CP2 does not have and CP3 could generate.

**Two consequences.** First, its tagline is *"The job search that runs on your
machine"* — near-identical to the line README used until 2026-07-29, which is why
that line changed. Second, the 33% fork ratio is the install mechanism, not
enthusiasm: every user sits on a permanent divergent branch, which is why the
README needs a "Staying up to date" section. **Do not copy fork-as-install.**

---

## 2. What we are actually differentiated on

1. **The honest-AI invariant.** Every competitor ships the fake number we refuse
   — career-ops has a "holistic global score", JobSync saves "match scores",
   Resume Matcher shows an ATS score out of 100 with red/yellow/green. Nobody
   else refuses an uncited claim *and shows the refusal*. Enforced by a validator
   with a gate behind it, not by prompt text. **Do not dilute this.**
2. **Real typesetting — now a two-horse race.** Resume Matcher's "LaTeX" template
   is CSS imitating LaTeX, screenshotted to PDF by headless Chromium; there is no
   TeX engine in that repo. Our Tectonic output is genuine kerning, hyphenation
   and ligatures. **ai-job-search also has real LaTeX** (moderncv), so this is no
   longer unique — but it costs them a full TeX install as a prerequisite, and
   Tectonic auto-downloads. The edge moved from *having* it to *not making the
   user install it*.
   *Corollary, verified 2026-07-29:* their headline technical claim is ATS
   verification on the compiled PDF's text layer via `pdftotext`. **We already do
   that and go further** — `parse-fidelity.ts` renders, re-parses through a
   deliberately naive ATS-grade parser, and diffs field-by-field against the
   structured input, so it names the paths an ATS drops. Theirs is a checklist;
   ours is a diff. Don't chase it; do say so out loud.
3. **An editor you live in.** They all *generate* résumés. None has structured
   fields beside a live-rendered PDF, a version tree, and a semantic diff.
4. **Outreach + sequences.** Nobody else has it at all.

---

## 3. Take / refuse / ignore

### Take — ranked by value ÷ effort

1. **DOCX import.** Their pipeline is extract → markdown → the same LLM prompt →
   the same schema. For us that's `mammoth` in the extraction step only; prompt
   and Zod schema unchanged. Two competitors have it; plenty of résumés are Word.
2. **Honest keyword-gap panel — the replacement for the score we refuse.**
   Resume Matcher's `analyze_keyword_gaps()` splits missing keywords three ways:
   **missing** (JD wants it, you don't have it) · **injectable** (*it IS in your
   master résumé, you just didn't mention it in this version*) · **non-injectable**
   (you genuinely don't have it — adding it would be fabrication). Three provable
   lists instead of one invented number. Near-perfect fit for our positioning.
3. **Guided enrichment questions.** Rather than letting the model invent metrics
   to strengthen a weak bullet, detect vague bullets deterministically (no
   numbers, no scope, no tech) and ask up to ~6 targeted questions — "What
   metrics improved?", "What was the scale?" — then rewrite **only from the
   user's real answers**. This turns our stance from defensive (refuse
   fabrication) to generative (solicit the truth). Slots straight into the
   refusal-in-position pattern from the shells design.
4. **Freeze the JD on the Application at apply time.** `jdText` currently lives
   on `Job` and is mutable — re-pasting a URL overwrites the description you
   actually applied against. JobOps snapshots precisely for this. Provenance is
   our story; this is a hole in it.
5. **Résumé-version performance.** "v3 got 4 interviews from 11 sends; v1 got 0."
   Asked for on the JobOps HN thread; its author said it doesn't exist. **We are
   one join away** — `Application.resumeVersionId` already pins the exact version
   sent and `repliedAt`/`interviewAt`/`decidedAt` are already stamped. Best
   unbuilt feature we have.
6. **Draft answers to open-ended application questions** (career-ops). The gap
   between "tailored résumé" and "submitted application" is ~15 minutes of
   retyping into a Greenhouse form. Nobody does it *with citations*.
7. **Path-whitelist + original-value verification** as a second belt around the
   fabrication validator: restrict which JSON paths an LLM edit may touch (never
   company / title / institution / dates / ids), and verify each diff's claimed
   "original" against the actual current value before applying. Catches stale and
   hallucinated diffs — a different failure class than citations.
8. **`restore_dates_from_markdown()`.** LLMs reliably drop the *month* from date
   ranges while structuring ("Jun 2020 – Aug 2021" → "2020 – 2021"). They regex
   month-inclusive ranges out of the raw text *before* the call and patch
   year-only results afterwards. **Live bug class for us** — we render `2026-01`
   as "Jan 2026", so a silently dropped month becomes a bare year and we never
   know.
9. **LLM infrastructure refinements** — registry-driven `max_tokens` clamping and
   JSON-mode capability detection with graceful fallback; per-error-type retry
   policy (never retry auth / bad-request / content-policy; do retry timeout /
   rate-limit / 5xx); stripping `<think>` blocks from local reasoning models.

**Added 2026-07-29 from ai-job-search** — kept separate rather than renumbered so
the provenance stays legible:

10. **Page-overflow awareness, then relevance-weighted cutting.** Confirmed gap:
    there is no `pageCount` anywhere in `src/lib/`, so hunt cannot tell a
    two-page résumé from a four-page one — and tailoring only ever adds text.
    Their rule is to cut on overflow by scoring each line on (relevance to the
    posting × uniqueness in the document × whether the cover letter depends on
    it) and dropping the lowest first, so an old bullet that hits posting
    keywords outlives a recent one that doesn't. **Fits us specifically because
    cutting cannot fabricate** — it is the one tailoring operation the citation
    validator has nothing to say about. Highest value ÷ effort on this list.
11. **Verify the rendered pages, not just that the compile exited 0.** Their
    framing: LaTeX reliably produces output that "looks fine in the .tex and
    breaks in the PDF" — orphaned entry titles, a cover letter spilling to page
    two, list items silently falling back to the body font. They compile, read
    the pages, and apply `\needspace` / `\enlargethispage` until clean. Pairs
    with 10.
12. **Drafter–reviewer separation.** A second agent with fresh context researches
    the company and critiques the draft before revision. Our validator catches
    *fabrication*; it does not catch *generic and weak*. Different failure class,
    and the honest-AI stance says nothing about it.
13. **A portal generator instead of more adapters** (`/add-portal`). Their answer
    to the question `checkpoints.md` leaves open under "job fetching beyond the
    three boards": don't hand-build 150, ship the thing that scaffolds one.
    Harder for us — typed TS in a registry, not a markdown skill — but it is a
    real answer where we currently have none.
14. **Interview prep under our own invariant.** Their `/interview` uses only
    claims from the submitted materials and gives "bridge answers" for genuine
    gaps, never invented experience — our rule, applied to a surface we don't
    have and that sits directly downstream of a pipeline already tracking
    `interview` status.

### Refuse
- **Any composite score, rubric or grade.** It is the one thing every competitor
  ships and the one thing that makes us different.
- **Fork-as-install.** ai-job-search's 9.4k forks are the distribution mechanism,
  not fandom: every user is on a divergent branch that can never cleanly take an
  upgrade, which is why their README needs a "Staying up to date" section. Data
  in a database beats profile-in-markdown-you-forked for the audience we want.
- **LinkedIn scraping.** Decided 2026-07-26 — see session handoff.
- **Auto-submit / one-click apply.** hunt and career-ops share the stance:
  prepare everything, the human clicks send. Auto-apply is how tools blast
  garbage and get users blacklisted.
- **The multi-pass improve→refine→inject→align→score chain.** Resume Matcher's
  own issue tracker is full of opaque 500s and "why my result is nothing" — a long
  LLM chain is their biggest reliability liability. Our citation-first single
  validator is architecturally sounder for the same goal.
- Webhooks / n8n / Zapier · MCP server · CLI-only interfaces. Technical-user
  features, and we're trying to move the other way.

### Ignore
Bulk operations, time tracking, task management. Fine, not the wedge.

---

## 4. Two live gaps found in *our* code while researching

1. **Prompt injection.** `job.jdText` is scraped from an arbitrary URL — fully
   attacker-controlled — and embedded raw into the fit, cover-letter and outreach
   prompts. Resume Matcher scrubs `ignore previous instructions`-style patterns
   before embedding user text; we do not. **Mitigating context:** our fabrication
   validator is code, not prompt, so an injection cannot make it accept an
   uncited claim. But it can garbage output and push content through the
   cover-letter / outreach paths, where validation is thinner.
2. **No secret scrubbing on surfaced provider errors.** They regex-redact
   `sk-…`, `AIza…`, `Bearer …` from upstream errors before display. We surface
   adapter errors verbatim, and `testConnection` stores raw provider errors
   *unencrypted* in `hunt.db` — so a provider that echoes a key into an error
   message writes it to disk in the clear.

---

## 5. Licensing

Resume Matcher is **Apache 2.0 with no NOTICE file**. Ideas, architecture and
algorithms are free to reimplement — Apache protects the expression, not the
concept. Copying actual code obliges us to retain its licence header and
copyright notices and to mark modified files; the copied portions stay Apache 2.0
inside our MIT repo (compatible, but per-file bookkeeping). Everything in §3 is a
pattern, so **reimplement in our own style and there is nothing to track.**

---

## Sources
- [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) —
  README + repo metadata, reviewed 2026-07-29
- [srbhr/Resume-Matcher](https://github.com/srbhr/Resume-Matcher) — deep source
  review: `services/parser.py`, `services/ats.py`, `services/refiner.py`,
  `services/improver.py`, `pdf.py`, `llm.py`, `routers/enrichment.py`
- [JobOps on Hacker News](https://news.ycombinator.com/item?id=46974047)
- [career-ops.org](https://career-ops.org/)
- [Gsync/jobsync](https://github.com/Gsync/jobsync)
