# Checkpoints

Internal sequencing. `roadmap.md` is the public, feature-facing one.

Each checkpoint has a **gate** — a thing that is either true or it isn't.

**Waves are retired.** They sequenced parallel agent builds against PHASE-PLAN;
the goal is now users, not scope. The machinery (`hunt-wave-build`, worktrees,
`gates/DONE`) stays useful as a tactic, just not as the plan.

---

**CP1 — launch-ready · CODE COMPLETE 2026-07-29 · gate unrun**
Provider save validation (a save can report success for a provider that cannot
make one call — this is how a real tailor run died on 2026-07-28) · honest
degrades · route `/` by state · archive not delete · board-URL ingest with no
key. Public roadmap: done. All five on `main`.
→ **Gate:** fresh clone to tailored PDF in under 10 min, by someone new, with one key.
→ **Remaining: run it.** Nothing left in CP1 is code.

**CP2 — public launch**
Landing page · waitlist with a public 30-day countdown · Loom walkthrough + demo
GIF · Show HN / LinkedIn. All still to build.

⚠️ **CP2 has no proof artifact, and that is now the thing to fix.**
`MadsLorentzen/ai-job-search` took 28.5k stars in four months on a workflow with
a *worse* install story than ours (Claude Code + Python + Bun + a full TeX
distribution). What it had that we don't is the README's second section: the
author's own funnel — 69 applications, 20 first interviews, one signed contract,
hired as an AI engineer in June 2026. Features didn't buy that; the receipt did.
**CP3 is the only thing in this file that generates one.** See the sequencing
note below.

**Cold-start / onboarding run.** CP1-C routes `/` by state, which is not the same
thing. `docs/SCREENS.md §1` specs a real first-run flow — welcome → keys →
import → done, every step skippable, the LLM key badged as "the one to add" —
and `docs/PHASE-PLAN.md §7` specs the whole non-technical path around it
(`npx hunt-app`, Tectonic download with a visible progress state and *never a
silent hang*, degraded-by-design everywhere). Designed, never built. Scope it
after dogfooding, so the flow answers what actually goes wrong rather than what
we guessed would.
→ **Gate:** three strangers get it *running*.

**CP3 — first revenue · parallel, zero code · START IT NOW**
Brother sells done-for-you tailoring; he runs hunt, delivers the PDF. Answers
"will anyone pay" in a way free signups never can.
→ **Gate:** one person pays.
→ **Second output, added 2026-07-29: the funnel numbers.** Every delivery is an
application with a résumé version pinned and its outcome stamped — which is
already the shape of the story CP2 is missing. It only exists if CP3 has been
running for weeks before launch, so it starts *now*, in parallel, not after CP2.
**Open call for Sameer:** whether CP2 waits on real numbers or launches on the
product alone. Waiting is stronger and slower.

**CP4 — hosted go/no-go · ~day 25**
Decide on *rate and source*, not raw count: 1000 from one post is a spike, 1000
accruing over 30 days is a trend.
→ **Gate to start CP5:** ≥5 paid deliveries, ≥3 people asking to self-serve.

**CP5 — hosted MVP · day 30**
Sized 2026-07-28: **95–115 files**, 76 prisma call sites, zero auth today. Three
hard parts, detailed in the plan file: `Setting.key` as PK holding four unrelated
things, `Job.url @unique` forcing an architecture choice, and the self-migrating
boot dying with SQLite. **30 days is the whole 30 days.**
→ **Gate:** a stranger signs up and tailors a résumé unaided.

---

## The next feature after CP1 — decided 2026-07-29

Two candidates were competing for this slot. **The facts notebook wins; the
curated feed drops back to Deferred.**

### The facts notebook (grounded generation)

Sameer's framing: *résumés need constant updating, but the durable thing is
facts about you — effectively a notebook the résumé agent reads to stay
grounded.* The model is **Bean** (`~/Code/Bean`, `docs/notebook-ux.md` +
`docs/grounding-sources.md`), where it is designed and partly built.

**Why it's the wedge and not a feature.** Our invariant is "every edit cites a
path in your résumé." That is honest and it has a ceiling: the résumé is the
*only* ground truth, so hunt can only ever reshuffle what you already wrote
down. A bullet that's weak because you never recorded the number gets refused —
correct, and a dead end for the user. The notebook is the missing substrate that
turns refusal into a question. **The rule does not weaken.** It stays "cite
something the user authored"; the set of things they authored just grows past
the one PDF. This is also the substrate `COMPETITORS.md` §3.3 (guided
enrichment) needs — without somewhere durable to land, a solicited answer is
used once and thrown away.

**What transfers from Bean, concretely:**

- **The boundary litmus**, verbatim in shape: Bean asks *"if this changes, how
  many replies change?"* Ours is **"if this fact changes, how many résumés
  change?"** Changes every résumé → a notebook fact. Changes one application →
  stays on the Application. Changes how you'd answer a class of question → a
  judgment note.
- **Proposals-first, doc as room.** hunt does the writing, the user does the
  judging. Nothing auto-writes; a decline writes nothing. The user never authors
  into a blank structured form — Bean's `notebook-ux.md` is explicit that the
  blank-template grind is the failure mode, and our import-review screen already
  has the right idiom to reuse.
- **Provenance in the user's language.** Bean's three: `you told me` (stated) ·
  `me saw it in your replies` (observed) · `from your store` (record). Ours maps
  to: *you told me* · *it's in your résumé* · *from your GitHub / the posting*.
- **Tappable citation chips.** Bean calls this "the verification-cost lever":
  see it → tap it → fix it → confirmed. **We are closer to this than Bean is** —
  our tailoring diff already carries a citation on every edit; today it points at
  a résumé path, and it isn't tappable. Making it tappable, and letting it point
  at a notebook fact as well, is most of the feature.
- **"Propose nothing" is a valid answer** — the same shape as our
  refusal-in-position.

**The one real architecture fork, to decide before building:** does the notebook
sit *beside* `ResumeContent` (additive, safer, a second citable source) or
*above* it (the résumé becomes a rendering of the notebook for one job)? Beside
is the obvious first step. Above is the version that actually solves "résumés
need constant updating," and it is a data-model change, not a feature. **Do not
decide this from the armchair — the dogfood run says which refusals actually
hurt, and that scopes it.**

### Why not the curated feed

It adds a pillar where the wedge is already thin against 150-portal competitors;
the notebook deepens the one thing nobody else has. Consolidation over breadth —
which is also PostHog's first strategy pillar, and the reason our positioning
moved off local-first on 2026-07-29 (`COMPETITORS.md` §1).

---

## Pricing

Job searching lasts 2–4 months, so subscriptions churn by design. **A time-boxed
pass, ~$59 for 3 months** matches the real use period and undercuts the $19–30/mo
market on total spend. Free tier: editor, pipeline, ~5 tailors/month, no card.
A run costs ~1¢ — this sells the loop, not inference.

Licence is MIT. It lets anyone host and compete; theoretical at this scale, but
decide before contributors arrive.

## Deferred

- **Job fetching beyond the three boards** — CP1-D covers 66% of real links;
  the rest are custom career pages needing Firecrawl or manual entry. Open
  strategy question.
- **Freshness** — nothing rechecks whether a posting is live; two tracked roles
  already 404.
- **Bulk import** — 134 roles currently means 134 dialog opens.
- **Curated feed** — the "found for me" pillar. Was "next feature after CP1";
  lost that slot to the facts notebook on 2026-07-29, see above.
- **Four takes from `ai-job-search`** (`COMPETITORS.md` §3, items 10–14), led by
  **page-overflow detection** — there is no `pageCount` anywhere in `src/lib/`,
  so hunt cannot tell a two-page résumé from a four-page one while tailoring only
  ever adds text. Relevance-weighted cutting is the one tailoring operation that
  cannot fabricate, so it costs the validator nothing.
- **Autofill application forms** — ~15 min of retyping per application, and
  nobody drafts those with citations. Strongest unbuilt feature; not a blocker.
- **Two security items** (plaintext provider errors in `hunt.db`; unfenced
  `jdText` in four prompts). Not stranger-exploitable on a local-first app, so
  below the launch blockers — but they ship before anything is hosted.
