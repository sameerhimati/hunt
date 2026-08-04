# The notebook of facts

Design for the next feature after v1. Nothing here is built. `docs/roadmap.md`
carries the one-paragraph version under *Next*; this is the whole argument and
the decisions taken on 2026-08-04.

---

## The problem

hunt's guard is *"cite a path in the source résumé."* That was never a truth
check — it is a cheaply-enforceable proxy for one, and the proxy has drifted.
Your résumé is a lossy compression of you, tuned for a previous search. So the
rule currently conflates **true** with **already written down in this one
artifact**, and the failure mode is documented in two places:

- **Tailoring refuses.** An edit that cannot cite a résumé path is struck
  through. On a real run against a strong match it kept 3 of 7.
- **Cover letters flag.** `parseCoverLetterDraft` attaches *"No source — nothing
  in your résumé or the posting backs this paragraph"* and leaves the text
  standing (`src/lib/tailor/cover-letter.ts:268-278`).

Both are honest. Neither offers a move. The flag names the problem and stops —
a dead end with good manners.

There is a second, larger symptom. A cover letter has to answer three questions:
**how good a fit you are**, **why this company**, and **what you would bring**.
The résumé is thin material for the first and contains *nothing at all* for the
second. So the model pads — which is what produced a 255-word letter against 152
for a simpler posting, and why the length rule needed a word cap on 2026-08-04.
The cap bounds the damage. This is the fix.

## What a fact is

**Atomic.** One claim, in your words. If a fact were a paragraph the model would
have to excerpt from it, and the moment it excerpts, *"fact #12 said something
like this"* proves nothing. Keeping facts atomic means using bits and pieces of
your context is **selection among facts**, never **extraction from prose**.
Composability comes from having many small units, not from cutting up big ones.

| field | why |
|---|---|
| **claim** | one sentence, yours |
| **quantity** | number + unit, optional — but it is the whole point of asking *"what was the throughput?"* |
| **when** | so a fact cannot be silently presented as current |
| **attaches to** | a role, a project, or standalone |
| **notes** | freeform, **never citable** — the model may read it for tone and voice, and no citation may resolve to it |
| **origin** | you typed it, you answered a refusal question, or hunt proposed it *and you accepted it* |

`origin` is the honesty hinge. Extraction is allowed as a drafting aid; nothing
is citable until you confirm it. The rule stays *"you said it"* — it just stops
meaning *"your résumé said it."*

## Intake: the refusal becomes the question

**Refusal-triggered, to start.** Where hunt flags or strikes a claim today, it
also says what would support it — *"you wrote 'scaled the ingest pipeline' with
no number. What was the throughput?"* — with an input. Your answer becomes a
fact and the regenerate cites it.

Two reasons this is the right first mechanism:

1. **Every fact is demand-driven.** You write it because a real letter needed it,
   not into a blank form where most entries never get used.
2. **Cold start is smaller than it looks.** One draft flags several paragraphs at
   once, so the loop bites on your first application rather than filling one
   question at a time.

A paste-a-brain-dump path and extraction-then-confirm stay on the table as a
second intake, once there is evidence the first is too slow.

## Citations gain an address space, not a weaker rule

`citationTarget` (`src/lib/tailor/cover-letter.ts:238-259`) resolves a path into
résumé JSON today. It will also resolve a **fact id within this application's
slice**. Everything else is unchanged: `draws()` still requires the sentence to
share distinctive terms with what it cites, `MIN_SHARED_TERMS` is still 2, an
unresolvable address is still no citation at all.

This widens **where provenance can point**, never **whether it has to**.

## The slice

The model never sees the whole notebook. Per application, hunt proposes a
relevance-scored subset, you add and remove, and only that enters the prompt.

- **The proposer is the existing lexical machinery** — `terms()` and the stopword
  list already score overlap against the posting. Deterministic, free, and it
  ranks rather than decides.
- **You approve it.** What this must never become is a bank of claims the model
  dips into unsupervised.

A person who has shipped ML pipelines, run a family office and framed houses is
not three résumés. They are one person whose relevant half changes per posting —
which is exactly why the store is whole and the draw is a slice.

**Cache boundary.** The slice varies per application, so it cannot sit in the
frozen prefix. `coverLetterSystem()` has two cached blocks and
`coverLetterContext()` carries the résumé and the JD; facts must land *after* the
breakpoint or every application misses cache.

## "Why this company" is not a fact about you

It is per-application and it expires the day you are rejected. It lives as a
**field on the application**, cited through the same mechanism, and it keeps the
durable notebook clean. This is the half of a cover letter hunt has never had any
material for, and it is likely the larger reason cover letters are the weak
surface.

## Forward-looking claims need a bridge

*"What I'd bring"* is not a past fact, so no path resolves and the guard handles
it badly — today it can only refuse. The honest construction is a bridge that
cites **both halves**: the work you did (résumé or notebook) and what the posting
says they need (`job.jdText`). The prompt can ask for that shape and the
validator can require both ends. Anything else is either a refusal or a guess.

## Outcome data stays descriptive

hunt has a real join nobody else has: every application pins the exact résumé
version, the cover letter is stored per application, and statuses are timestamped.
*"v3 got 4 interviews from 11 sends"* is one query away.

What it does **not** have is replies. Phase 7 is cut, marking is manual, and n is
five. So this is a **descriptive** feature — hunt shows you the join and you draw
the conclusion. The moment it becomes *"this letter scores 8/10"* it is the
ATS-score entry on the won't-build list wearing a new hat. Cross-user learning
would need telemetry or a hosted version, which the roadmap rules out and leaves
undecided respectively.

## Still open

- **Granularity in practice.** How small is too small before writing a fact is
  more work than writing the sentence yourself.
- **Conflict and staleness.** Two facts that disagree; one that ages out. Cheap
  to ignore now, expensive to retrofit.
- **Whether extraction-then-confirm earns its build** as a second intake path.
