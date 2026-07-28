# Wave 2 review — findings

Five file-disjoint reviewers read `a13092e..wave-2` (149 files, +20,438/−153) on
2026-07-27. That diff had never been reviewed: the wave workflow crashed before
its integrate stage, so the per-phase review never ran for P3 or P5.

**Every finding below shipped with green gates and a green `pnpm verify`.** That
is the point of the document. Wave 1's lesson was that a passing test says
nothing about whether the code is right; Wave 2 proved it again at ten times the
scale.

Findings are recorded with the reviewer's letter (A–E) and their number, so
`C#5` is traceable back to the outreach reviewer's fifth finding.

---

## The two defect classes

Nearly every serious finding is an instance of one of these. They are missing
*conventions*, not isolated bugs — each shipped independently in four of the
five areas.

### 1. Check-then-act with no server-side guard

`sendStep` didn't check `status` before sending. `pullIntoPipeline` upserted on
a raw URL. Save-tailored-version had no dedupe and ⌘↵ had no `pending` guard.
Sequence creation checked `existing.length === 0` outside a transaction.

In every case a **client-side disabled button** was the only thing holding the
line — which is exactly why the tests passed: they assert the button is
disabled. `src/lib/jobs/ingest.ts:135` carries a comment explaining the fix for
this class, written during Wave 1, that `src/lib/sourcing/import.ts:52` then
ignored.

**Convention to adopt:** any irreversible or uniqueness-bearing action claims its
row server-side before acting. A disabled button is an affordance, never a lock.

### 2. The UI asserts what the code doesn't substantiate

This is the differentiator inverted, and it is the class to watch hardest:

- `sequence-timeline.tsx` told users *"Sequence halts automatically when they
  reply."* — `markRepliedAction` had **zero callers**.
- `CitationChip` rendered *"Traces to your résumé"* over a citation that passed
  on a **one-character** snippet.
- The cover letter rendered *"Draws on basics.name"* under a fabricated claim —
  the user's own name as evidence.
- A fit reason whose citations all failed to resolve rendered as a green `+`
  match, identical to an evidenced one.
- The funnel could print **200%**.

**Convention to adopt:** a UI string asserting provenance or capability needs a
code path that can fail. If nothing can make the label false, it isn't a claim,
it's decoration.

### 3. One `useTransition` shared across several actions

Found only because a long-dismissed "flaky test" was finally root-caused instead
of retried. **It was a real user-facing bug, twice written off as test noise.**

A component runs several distinct actions through one `useTransition`, then gates
every control on that single `pending`. React settles an async transition's
`isPending` back to `false` a tick *after* it commits the state the transition
awaited — so there is a genuine commit where the results are **painted on screen
with every control disabled**. React does not dispatch handlers for a click on a
disabled button, so a click in that window vanishes entirely: no handler, no
error, no feedback.

In `contact-card.tsx` that meant a user on a loaded page could click Save on a
found recruiter and have nothing happen. The window is normally sub-millisecond;
its length is however long the main thread is busy, which is why it presented as
a ~18% test flake rather than a bug report.

`src/components/sourcing/workspace.tsx:69-77` already carried a comment
describing this precise hazard and splitting its flags. The convention existed
and was written down; it just hadn't been applied everywhere.

**Convention to adopt:** one `useTransition` per action, each gating only its own
control. And: a control that is disabled is a control whose click is *discarded*,
so "disabled while something unrelated is in flight" is never merely cosmetic.

**Corollary worth internalising:** an intermittent test failure is a hypothesis
about the product, not an inconvenience. Both times this repo treated one as
flakiness — nine clean retries once, a shrug the second time — it was hiding a
defect. Raising a timeout or swapping to `findBy*` would have buried it a third
time. Instrument and capture the failing run.

---

## What the review confirmed is genuinely sound

Worth recording, because it is what the product actually has:

- **No aggregate score exists anywhere.** Reviewer A grepped
  `score|overall|aggregate|composite|percentage` across all of `lib/checks`,
  `lib/tailor`, `components/tailor` and `checks-panel.tsx` — every hit was a
  *comment explaining why there isn't one*. `CheckOutcome` has no numeric field
  and `TailorRun` has nowhere to put one. `parseFitRating` rejects an
  out-of-vocabulary tier rather than coercing it; `TIER_RANK` never reaches the
  DOM.
- **Refusals are a status, never a deletion.** `validateChanges` is a
  length-preserving `.map` that cannot throw, and `applyChanges` re-filters
  refusals as defence in depth.
- **The validator is code that runs after the model**, not an instruction inside
  the prompt.
- **`inline-diff.ts` is correct** — 5,000-pair fuzz, full non-whitespace
  fidelity, correct LCS backtrace and bail-out.
- **The `offeredAt` migration is safe on a populated DB** — verified empirically
  against the real `ensureSchema`: nullable add, no type change, no rename, no
  drop, idempotent on second boot, transaction-wrapped.
- **No auto-send machinery anywhere** — no cron, timer, queue processor, or bulk
  action. Every send traces to a click.
- **Contact dedupe, check persistence, and cascade behaviour are all correct.**
- **No control bytes or non-UTF8** in any reviewed file (Wave 1 shipped a NUL).

---

## Fixed in this session

| Ref | What |
|---|---|
| C#1,2,3 | `sendStep` claims the row before sending; dashboard Send gets a real pending state |
| C#4 | A failed dashboard send is surfaced instead of dropped in an unread query param |
| C#5 | The dashboard can no longer dispatch a message the user has never seen |
| C#6 | The false "halts automatically when they reply" claim removed; `markRepliedAction` wired to a manual control |
| D#1,2,3 | `pullIntoPipeline` — normalised URL key, `''` treated as NULL, partial-refresh discipline from `ingest.ts` |
| D#4 | Fit reasons with no resolvable citation are flagged, not rendered as evidenced matches |
| D#5 | A failed batch chunk no longer discards ratings already collected |
| E#1 | Backfill added to the `offeredAt` migration |
| E#2 | Impossible (>100%) funnel conversion rates |
| E#3,5 | Rejected server-action promises no longer strand `checks-panel`; real loading state |
| A#1 | Citation snippet floor + string-leaf requirement |
| A#2 | `change.path` validated; `applyChanges` reports what it skipped |
| A#3 / B#2 | Double-save no longer duplicates a `ResumeVersion` |
| B#1 | Cover-letter tab no longer unmounts, destroying the draft and re-spending a model call |
| B#3 | Regenerate no longer silently discards hand-written work |
| B#4 | A single keystroke no longer launders an unsourced claim into an unflagged one |
| B#5 | Cover-letter provenance checked by content, not just by address |
| B#6 | A blank line inside a paragraph no longer strips its flag on round-trip |
| — | Both workflow scripts null-guarded (20 unsafe sites); `.claude/worktrees/` ignored |

---

## Deferred — HIGH

Both are real and neither is in this session's scope. Take these first next time.

**A#4 — a mis-shaped `path` makes an entire tailor run unusable, with a raw Zod
dump on screen.** `apply.ts` `add` pushes `change.now` into whatever the path
resolves to and `edit` `setField`s a string over whatever the leaf is; neither
checks the target holds strings. Executed: a model addressing `experience`
instead of `experience[0].bullets` (plausible — the prompt asks for "the list to
append to") produces `proposed`, then `applyChanges` **throws**, surfacing raw
Zod JSON in the error box and reverting the PDF to the base document. The user
cannot save *any* of the run's changes until they guess which row is poison.
Same failure for an unknown `kind` (the validator falls back to `'edit'`).
Type-compatibility of a change with its target is currently enforced only by
prompt instruction.

**C#8 — Regenerate always writes a cold intro, whatever step you're on.**
`regenerateAction` calls `draftOutreach`, whose prompt opens *"You write one
short **cold outreach** email"*, and passes no `sequenceStep`. A user on step 3
(*"last note from me…"*) who clicks Regenerate gets a fresh first-contact
introduction. Sent as the third message in a thread it reads as if the sender
forgot the previous two.

---

## Deferred — MEDIUM

### Tailor / honest-AI
- **A#5** A `reorder` renders as one green `add` block (its `was` is `undefined`),
  so the user reads joined text as new prose, accepts it, and `reorder()` then
  silently no-ops on any verbatim mismatch. The ` · ` separator is load-bearing:
  a list item containing it makes the reorder vanish.
- **A#6** Every refusal in a section renders **twice** when any proposed row in
  that group is selected — once dismissible at top level, once docked in
  `ChangeInspector` and not dismissible. Pick one home for refusals.
- **A#7** An uncited `remove` renders a blank struck-through line plus copy about
  the model inventing experience — nonsense for a deletion. Show `was`, or don't
  route removals through the fabrication path.
- **B#7** `save()` captures `draft` at click time and unconditionally re-sets it
  from the server echo, so edits made *during* the round-trip are reverted while
  the header reads "saved". Wave-1's "re-paste reverted hand-corrections" shape,
  narrower window.
- **B#8** `templateId` and `rawLatex` are `useState`-frozen at mount while the
  base-version picker stays live. Switching base loses that version's
  `rawLatexOverride` and inherits the wrong template — and the mirror case
  carries one version's LaTeX into another's child.
- **B#9** A failed `load` is swallowed and replaced by a fresh draft; saving then
  overwrites the letter that failed to load.
- **B#10** A *rejected* server-action promise (transport failure, dev-server
  restart) leaves the cover-letter tab permanently in its skeleton with Retry
  disabled. Same class as E#3, different surface.
- **B#11** Escape leaves a tailor run with no prompt, discarding every accept/
  reject decision and any manual edits. `TAILORING-DIFF.md` §7 specifies a
  save/discard/keep-reviewing prompt; there is no `beforeunload` either.

### Outreach
- **C#7** Clicking a step in the sequence rail navigates to `?step=<id>`, which
  nothing reads, and drops `?contact=` — so `resolveKey` falls through to "most
  urgent" and the composer silently switches to a **different contact's**
  sequence.
- **C#9** Sequence creation is check-then-create with no transaction and no
  unique constraint on `(applicationId, contactId, sequenceStep)`. Two tabs, or
  one slow LLM call the user retries, yields six rows and two step-1s.
- **C#10** "Due today" is really "due at the same clock time N days later" —
  `addDays` adds `days * 86_400_000` to an exact timestamp with no day-boundary
  normalisation, so a sequence dealt at 21:40 surfaces its follow-up at 21:40.
  Each real send re-bases the tail to that send's time-of-day; DST adds an hour.
- **C#11** The dashboard "Copy" affordance navigates and copies nothing, while
  the adjacent "Mark sent" button is right there to record a send that never
  happened.

### Sourcing
- **D#6** Stale search responses overwrite newer ones: `runRef` guards the rating
  callback but not the listings, and the saved-search chips aren't disabled
  during a search. The user ends up reading results for a query the screen says
  isn't running.
- **D#7** Per-board failures are computed, documented, and thrown away.
  `searchJobsDetailed` and `FreeBoardsAdapter.errors` exist precisely so the app
  can say "Adzuna is down; showing JSearch only" — nothing reads either. A 429
  looks identical to a narrow query.
- **D#8** Board descriptions are HTML and land in `jdText`, which renders as
  plain text — visible `<p><strong>` markup on the job panel. Not XSS (no
  `dangerouslySetInnerHTML` anywhere), but keyword coverage and tailoring then
  treat tag names as JD terms.
- **D#9** The `externalId` dedupe key isn't namespaced by provider. `boards.ts`
  prefixes its ids; `adzuna.ts` and `jsearch.ts` don't. A collision silently
  drops a real listing and grafts the loser's description onto the survivor,
  which is then rated. One character of key fixes it.

### Foundation
- **E#4** `pinned-resume.tsx` hardcodes *"tailored from base"*. Re-tailoring from
  an already-tailored version makes that a false provenance claim on the one card
  whose entire job is provenance — and the parent label is already on the row.
- **E#6** Two ⌘K commands lie: *"Run checks on this application"* runs no checks
  and navigates to a **different** application (`getMostRecentApplication()`).
  Same shape for *"Start a tailor run"*. Both are clickable elsewhere, so the
  accelerant-not-primary-path rule holds — the labels just don't describe the
  behaviour. No palette command mutates anything; that part is clean.
- **E#7** `Milestones` on the application detail never shows `offeredAt`. For a
  rescinded offer the row reads `Decided` with no sign an offer ever arrived —
  the same erasure the `offeredAt` work set out to fix, still present one screen
  over.

---

## Deferred — LOW

- **A#8** `CitationChip`'s `PATH` regex requires bracket indices but `resolvePath`
  also accepts dotted ones, so `experience.0.bullets.3` validates and renders an
  empty provenance block. Unify the two path grammars.
- **A#9** A malformed model entry gets `path: ''`, producing an empty `<h3>`.
- **B#12** `key={citation.path}` collides when a model repeats a citation.
- **B#13** An all-empty letter reports "saved" and leaves nothing on disk.
- **C#12** "+ add step" is a `<div>` with no handler; `addStepAction` has no
  callers. Looks interactive, is inert.
- **C#13** `queue.ts:161` and `sequence.ts:147` sort on a single timestamp with
  no tiebreaker, over a `findMany` with no `orderBy`. `followUpsDue` slices to 8
  *after* that sort, so membership at the boundary is undefined. Same shape as
  the `updatedAt` bug already fixed in `stats.ts`.
- **C#14** `threadRef` can be stamped `''` rather than null, which a future reply
  matcher would treat as a real thread ref — `send.ts`'s own comment says a sent
  row with no provider id "is a lie the queue and the reply detector would both
  act on."
- **D#10** `href={listing.url}` unvalidated from third-party JSON. `javascript:`
  needs a hostile board (hence LOW); `url: ''` renders `href=""`, which on click
  reloads `/sourcing` and wipes every result.
- **D#11** `known` is page-wide rather than chunk-wide in batch rating, so a chunk
  could claim an id it was never shown. No realistic trigger; one line to close.
- **D#12** A malformed stored saved-search 500s `/sourcing`, contrary to
  `readAll`'s stated "an unreadable list is an empty list" contract. Related:
  `saveSearch` is read-modify-write with no locking.
- **D#13** `SavedSearches`' `query` prop is never passed, so `canSave` is
  permanently true and an empty box persists a chip labelled "any role".
  `SavedSearch.label` is written and never read.
- **D#14** `ResultCard` calls `postedAt.getTime()` directly while its sibling
  tolerates a string. Pick one contract.
- **D#15** No `AbortSignal` on a `1 + 3N` board fan-out — one hanging public board
  holds the whole search open. Codebase-wide convention, not a P5 regression.
- **E#8** `HUNT_TEST_MODE` and `HUNT_DATA_DIR` are independent. Test mode cannot
  self-activate (verified: Dockerfile sets only the data dir, both gate configs
  set the pair), but `isTestMode()` returning false unless `HUNT_DATA_DIR` is
  also set is cheap hardening.
- **E#9** `checks-panel` never resets `runStarted`/`snapshot` on `applicationId`
  change — latent until someone adds a soft-nav A→B. `match-rating-card` derefs
  `reason.text`/`reason.citations` unguarded while its sibling line carefully
  guards the same shape. `tailor-workspace:499` passes a possibly-undefined
  `baseResume?.name` that line 656 defends and this one doesn't.
- ~~The five new shadcn primitives (`alert`, `avatar`, `hover-card`, `popover`,
  `progress`) are unmodified stock and nothing outside `components/ui/` imports
  any of them.~~ **Partly wrong, and instructively so.** `hover-card` *is*
  imported, by `fit-tier-badge.tsx`. That claim came from grepping a
  double-quoted import path in a codebase that uses single quotes, which returns
  zero hits for **every** component — including `button`, which has 23 importers.
  Re-run quote-agnostically the real number was **eleven** orphans, not five, and
  they have since been deleted. Lesson: a grep that reports everything as dead is
  reporting on your pattern, not your code.

---

## Follow-ups created by this session's own fixes

Each was surfaced by the agent that made the corresponding fix, and left
deliberately — almost all because the residual sits in a file that agent did not
own, which is what kept the parallel work conflict-free.

**Still reachable, worth doing first:**

- **`ingest.ts` still stores the raw pasted URL.** `pullIntoPipeline` now
  canonicalises, but the paste path doesn't, so pasting `…/j/1?utm=a` and then
  pulling the same posting from a board still deals a duplicate `Job`. ~2 lines
  (`url: canonicalPostingUrl(url) ?? url` on both the where-clause and the
  create) — plus a decision about whether rows already written with tracking
  params need a backfill. They will each duplicate exactly once.
- **`saveVersion` has no server-side dedupe.** The UI guard closes both duplicate
  paths reachable by clicking, but not the one where `saveTailoredVersionAction`
  throws *after* `saveVersion` already inserted: the action returns `ok:false`,
  the row exists, the user retries. Either wrap the action's three writes in a
  transaction, or no-op when the newest child of the same `parentVersionId` has
  an identical label and content hash.
- **`markSentManually` has no guard at all** — it stamps `status: 'sent'` on any
  row, including one already sent and including a `halted` step. Harmless today
  only because the composer disables it, which is the same client-side-only
  defence the double-send fix was filed against.
- ~~**A#2's UI half**~~ — done. A skipped change now renders as a demoted card:
  same slot as a refusal, quieter and non-amber, no diff colours, no
  accept/reject, and excluded from the accepted count. Its copy names *staleness*
  rather than fabrication, because with the validator fix an unlandable change is
  refused before it is shown — so one surviving to commit means the résumé moved
  between the run and the save.

**Known and accepted:**

- **Editing a committed migration changes its checksum.** `ensureSchema` matches
  on migration *name*, so the runtime path is unaffected — but a dev DB that
  already applied the pre-backfill version will report drift under
  `prisma migrate dev` and will not receive the backfill. Inherent to making the
  backfill ride with the migration.
- ~~Two tests flake under full-suite load on 1000ms `waitFor` races.~~
  **Wrong — see defect class 3 below. One was a real product bug.**
- **Suppressing an impossible funnel rate overloads `FunnelRow`'s em-dash** —
  it already means "no data yet" and now also means "these stages don't nest".
  A `reason` discriminant on `StageConversion` would separate them.
- **`isUnconfirmed` is duplicated** in `sequence-timeline.tsx` and `send.ts`,
  because the client bundle can't import the Prisma-touching module. Its right
  home is `src/lib/outreach/types.ts`.
- **"They replied" always targets the last *sent* step.** Correct for the common
  case; wrong if a sequence has two sent steps and the human answered the first.
- **`fromMarkdown` recomputes an unsourced paragraph's flag as the generic
  `UNSOURCED_FLAG`**, losing the named unresolvable paths from `flagFor`. Now
  visible where it wasn't, because a touched-but-not-rewritten paragraph
  round-trips as `origin: 'model'`. Persist the sentence in the annotation.
- **The Résumé changes panel still isn't force-mounted**, so every trip to the
  cover letter and back re-runs a Tectonic compile. Not data loss, but the same
  class of wasted expensive call as the cover-letter bug.
- **Nothing prevents the underlying funnel inconsistency.** The board still lets
  any card go to any status, so `repliedAt` without `appliedAt` stays reachable.
  The dashboard has stopped lying about it; the pipeline is not ordered.
- **Workflow scripts.** `e2e` isn't in the phase-build verifier — only the
  wave-level integrate runs `pnpm e2e`, so a phase can be green in its worktree
  and break e2e at merge, which is exactly the load the integrate agent was under
  when it died. Separately, exhausting `MAX_FIX` leaves the operator the same
  `nextStep` shape as a lost-agent run; `lostAgents` now distinguishes them but
  nothing stops a later wave's preflight building on a red `wave-K`.

## Decisions worth not relitigating

- **The funnel fix suppresses impossible rates rather than backfilling
  milestones.** Backfilling looks right — you cannot reply to an application
  never sent — but `outreach` sits *between* `applied` and `replied` in this
  product's status vocabulary, so a reply to cold outreach with no application
  behind it is a real path. Stamping `appliedAt` would invent the event, not just
  the date. Clamping to 100% was rejected separately: it asserts a perfect
  conversion, which is a different false claim rather than the absence of one.
- **The send claim never expires, and a failed send does not release it.**
  Neither Resend nor SMTP accepts an idempotency key, so on a thrown send hunt
  genuinely does not know whether the message left. A lease that expired would
  eventually re-send silently — the exact failure being guarded — so the escape
  is a person ("mark as sent", or an explicit "Send again"), not a timer.
- **The citation snippet floor is 4 words and 1/3 of the replacement**, except
  when a change rewrites end-to-end the very field it quotes, which is accepted
  at any length (that is the legitimate one-word skill case, and the diff row
  shows the source beside the result anyway). Four words because one is a name
  and two or three a noun phrase — the cheapest spans to quote truthfully and
  vouch for nothing. Neither number vouches for the unquoted remainder; no
  post-hoc check on generated text can, and the comment says so.
- **A flagged cover-letter paragraph stays marked while more than half the words
  hunt wrote survive in it** — measured as multiset word retention against
  hunt's original, not against the previous keystroke (which would let a
  word-at-a-time rewrite never lift the mark) and not as string similarity
  (which would score appending your own paragraph as "mostly different" and
  launder the claim). A typo fix retains ~92%; a genuine rewrite, 43%.

---

## Still open from earlier sessions

- **Prompt injection via scraped `jdText`** — raw scraped text is embedded into
  `llm/prompts/{tailor,cover-letter,outreach,fit}.ts` with no sanitisation.
  Mitigating: the fabrication validator is code, so injection cannot make it
  accept an uncited claim.
- **No secret scrubbing on surfaced provider errors** — adapter errors are shown
  verbatim and `provider.<id>.lastError` is stored unencrypted, so a provider
  echoing a key writes it to disk in the clear. Grep for
  `redact|sanitiz|scrub` across `src/` still returns nothing.
- **Three raw `<select>` elements** in `key-provider-card.tsx`,
  `resume-editor.tsx`, `tailor-workspace.tsx` — `src/components/ui/select.tsx`
  exists with zero importers.
- **The LinkedIn / P6 cut** — agreed 2026-07-26, unapplied.
