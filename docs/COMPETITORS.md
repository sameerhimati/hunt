# Competitors

Researched 2026-07-26. The point of this file is to stop us rediscovering the
landscape every few weeks, and to keep one honest list of what to take, what to
refuse, and what we're actually differentiated on.

**Headline: local-first / open-source / BYOK / self-hosted / no-telemetry are
table stakes in this niche, not differentiators.** Five competitors have all of
them. What survives is the honest-AI stance and the résumé editor.

---

## 1. The field

| | **hunt** | **JobOps** | **career-ops** | **JobSync** | **Resume Matcher** |
|---|---|---|---|---|---|
| Traction | pre-launch | HN post | niche | small | **27.9k ★** |
| Licence | MIT | — | MIT | MIT | Apache 2.0 |
| Résumé import | PDF | PDF | local files | **PDF + DOCX** | **PDF + DOCX** |
| **Live editor + PDF preview** | **✅ Tectonic** | generates only | generates only | Tiptap, 2 templates | builder, drag-drop |
| **Real LaTeX typesetting** | **✅** | ✗ | ✗ | ✗ | ✗ (CSS imitation) |
| **Version tree + semantic diff** | **✅** | archives sent version | ✗ | multiple résumés | ✗ |
| **Tailoring cited to your résumé** | **✅ validator-enforced** | ✗ | ✗ | ✗ | ✗ |
| **Refuses uncited claims, shows refusal** | **✅ unique** | ✗ | ✗ | ✗ | post-hoc diff guard |
| Fake composite score | **refuses, by design** | — | 1.0–5.0 rubric | match scores | ATS score /100 |
| JD frozen at apply time | ⚠️ **gap** | **✅** | ✗ | ✗ | ✗ |
| Which résumé version performs best | ⚠️ **data exists, unbuilt** | ✗ (asked for on HN) | ✗ | ✗ | ✗ |
| Drafts open-ended application answers | ⚠️ **gap** | ✗ | **✅ Greenhouse/Ashby/Lever** | ✗ | ✗ |
| Guided enrichment instead of inventing | ⚠️ **gap** | ✗ | ✗ | ✗ | **✅** |
| Pipeline tracking | ✅ 8-status board | ✅ | terminal dashboard | ✅ + tasks/time | ✗ |
| Keyless job search | ✅ company boards | JobSpy, Glassdoor | **150+ portals** | Greenhouse/Lever | ✗ |
| Outreach + sequences | **✅ unique** | ✗ | ✗ | ✗ | ✗ |
| Email reply detection | P7 planned | ✗ (top HN ask) | ✗ | ✗ | ✗ |
| Cover letter | ✅ cited | ✗ | ✗ | ✗ | ✅ |
| Interview prep | ✗ | ✗ | ✗ | ✗ | ✅ |
| Accounts required | none | none | none | **yes** | none |
| Install | pnpm / dev server | Docker | **an AI coding CLI** | Docker | Docker |
| Business model | none | none | sponsors | none | none |

**Five tools, zero revenue, all technical-user.** That segment is saturated and
pays nothing. The unserved audience is the non-technical one — sign in, upload,
paste a job — and nobody is there because hosting, auth, support and inference
costs are the hard part. If that's ever pursued: OSS core + optional hosted
version (Cal.com / Supabase model), not a rewrite.

---

## 2. What we are actually differentiated on

1. **The honest-AI invariant.** Every competitor ships the fake number we refuse
   — career-ops has a "holistic global score", JobSync saves "match scores",
   Resume Matcher shows an ATS score out of 100 with red/yellow/green. Nobody
   else refuses an uncited claim *and shows the refusal*. Enforced by a validator
   with a gate behind it, not by prompt text. **Do not dilute this.**
2. **Real typesetting.** Resume Matcher's "LaTeX" template is CSS imitating
   LaTeX, screenshotted to PDF by headless Chromium — there is no TeX engine in
   that repo. Our Tectonic output is genuine kerning, hyphenation and ligatures.
   Against the 27.9k-star category leader, this is a real edge.
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

### Refuse
- **Any composite score, rubric or grade.** It is the one thing every competitor
  ships and the one thing that makes us different.
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
- [srbhr/Resume-Matcher](https://github.com/srbhr/Resume-Matcher) — deep source
  review: `services/parser.py`, `services/ats.py`, `services/refiner.py`,
  `services/improver.py`, `pdf.py`, `llm.py`, `routers/enrichment.py`
- [JobOps on Hacker News](https://news.ycombinator.com/item?id=46974047)
- [career-ops.org](https://career-ops.org/)
- [Gsync/jobsync](https://github.com/Gsync/jobsync)
