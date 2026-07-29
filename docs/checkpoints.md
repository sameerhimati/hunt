# Checkpoints

Internal sequencing. `roadmap.md` is the public, feature-facing one.

Each checkpoint has a **gate** — a thing that is either true or it isn't.

**Waves are retired.** They sequenced parallel agent builds against PHASE-PLAN;
the goal is now users, not scope. The machinery (`hunt-wave-build`, worktrees,
`gates/DONE`) stays useful as a tactic, just not as the plan.

---

**CP1 — launch-ready · IN PROGRESS**
Provider save validation (a save can report success for a provider that cannot
make one call — this is how a real tailor run died on 2026-07-28) · honest
degrades · route `/` by state · archive not delete · board-URL ingest with no
key. Public roadmap: done.
→ **Gate:** fresh clone to tailored PDF in under 10 min, by someone new, with one key.

**CP2 — public launch**
Landing page · waitlist with a public 30-day countdown · Loom walkthrough + demo
GIF · Show HN / LinkedIn. All still to build.
→ **Gate:** three strangers get it *running*.

**CP3 — first revenue · parallel, zero code**
Brother sells done-for-you tailoring; he runs hunt, delivers the PDF. Answers
"will anyone pay" in a way free signups never can.
→ **Gate:** one person pays.

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
- **Curated feed** — the "found for me" pillar; next feature after CP1.
- **Autofill application forms** — ~15 min of retyping per application, and
  nobody drafts those with citations. Strongest unbuilt feature; not a blocker.
- **Two security items** (plaintext provider errors in `hunt.db`; unfenced
  `jdText` in four prompts). Not stranger-exploitable on a local-first app, so
  below the launch blockers — but they ship before anything is hosted.
