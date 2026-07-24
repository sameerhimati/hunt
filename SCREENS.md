# hunt — Screen Specs

Screen-by-screen specs for the 11 areas. For each: **layout**, **on screen & why**,
**states**, **key interactions**. Read alongside `DESIGN.md` (tokens, shell,
components) and `TAILORING-DIFF.md` (the hero). Every screen sits inside the
**AppShell** (left rail + contextual topbar) unless noted. HTML ground-truth
mockups are named in each section.

Sample data across all mockups is one consistent throwaway candidate — *Alex Chen,
backend engineer* — applying to Stripe, Linear, Notion, etc. Replace with real data.

---

## 1. First-run onboarding wizard
**Mockup:** `Onboarding.dc.html` (keys step)

- **Layout:** full-screen, no app shell yet. Centered card (~660px) on the app
  ground, wordmark top-left, 4-step stepper: *Welcome → Add your keys → Import
  résumé → Done*.
- **On screen & why:** the app has zero data on first run; onboarding's job is to
  get the user to a working dashboard in <15 min without a login. It never asks to
  create an account — there are none.
- **Steps:**
  1. **Welcome** — one line on what hunt is + "runs locally, nothing leaves this
     machine." Single Continue.
  2. **Add your keys** — provider rows (LLM, Firecrawl, Apollo, Email). Each states
     what it unlocks *and what breaks if skipped*. The LLM key is badged "the one to
     add." Everything is skippable; a persistent "Continue anyway" reassures.
  3. **Import résumé** — PDF drop → LLM parse → **review/fix screen** (structured
     fields with the parsed values; low-confidence fields flagged amber for the user
     to confirm; this reuses the résumé editor's structured pane).
  4. **Done** → lands on the Dashboard (empty state until they add a job).
- **States:** no-key path (all skipped) still completes; parse-failure on import →
  "we couldn't read that PDF cleanly — start from a blank résumé or try another
  file," never a dead end.
- **Interactions:** keys validated with a live Test on blur; back/skip always
  available; progress persists if they close mid-way.

---

## 2. Home dashboard
**Mockup:** `Dashboard.dc.html`

- **Layout:** shell + topbar ("Dashboard", date, ⌘K, + New application). Content:
  a **funnel row** (5 stat cards), then a 2-col grid — left (1.5fr): *Follow-ups
  due today* + *Pipeline summary bar*; right (1fr): *Recent activity* feed.
- **On screen & why:** answers "what do I do right now?" Follow-ups due is the
  action queue (this is where the closed loop pays off); the funnel shows whether
  the search is working (conversion between stages, honest — a 0 offer count says
  "keep hunting", not a fake grade); activity is the memory of a single-user tool.
- **States:** empty first-run → EmptyState ("Nothing in your sights yet", CTA to
  paste a URL / search). Degraded → funnel still works from local data; follow-ups
  needing email show a "connect email to send" nudge, still let you draft.
- **Interactions:** every follow-up row has an inline Send/Draft; funnel cards and
  the pipeline bar deep-link into filtered Pipeline; activity items link to their
  application.

---

## 3. Pipeline
**Mockup:** `Pipeline.dc.html` (board; table is a toggle)

- **Layout:** shell + topbar with a **Board / Table** segmented toggle, sort, +
  New. Board = horizontally-scrolling kanban, 8 columns:
  *Sourced · Tailored · Applied · Outreach · Replied · Interview · Offer · Rejected.*
  Each column: status dot + name + count; cards stack; column scrolls independently.
- **PipelineCard:** company initial tile, role, company, a state line (fit tier in
  early stages, pinned `résumé vN` once tailored, sequence progress in Outreach,
  reply note in Replied), follow-up dot (amber) if due, days-in-stage. dnd-kit
  sortable; dragging lifts + rotates the card and shows a dashed drop target.
- **Table view:** same data as a dense sortable table — columns: Company, Role,
  Status, Fit, Résumé, Last activity, Next action. For power users triaging many
  rows; ~36px rows, sticky header, click → detail.
- **On screen & why:** the spine of the app; the résumé-version pin per card is the
  provenance the whole product is built on. Statuses use hue-on-`surface-2`, not
  saturated fills, to stay calm at 14 cards.
- **States:** empty column → "Nothing here yet. Go get one." (Offer). Empty board →
  see Dashboard empty. Rejected cards dim + strike the role.
- **Interactions:** drag between columns updates status (+ optimistic, with undo
  toast); right-click card → quick actions; click → Application detail.

---

## 4. Application detail
**Mockup:** `Application Detail.dc.html`

- **Layout:** shell + breadcrumb. Header (company tile, role, status badge,
  location/salary/source, fit tier). 2-col: left (1.6fr) = **Checks panel** + Job
  description + company; right (1fr) = **Pinned résumé** card, **Contacts**,
  **Outreach timeline**, **Status history**.
- **On screen & why:** the per-application hub tying every subsystem to one job —
  the JD you're targeting, the exact résumé version pinned, the honest checks on
  that version, who you found, and where outreach stands. Everything actionable
  from here (Tailor, Find contacts, Send follow-up).
- **Checks panel:** the 4 checks as expandable rows with a verdict dot + concrete
  count (see §7). One expanded by default showing specifics. Header explicitly says
  "no fake ATS score — by design."
- **States:** pre-tailor → pinned résumé shows "base v1, not yet tailored" + Tailor
  CTA. No contacts / no Apollo key → Contacts card shows "Add Apollo to auto-find,
  or add manually." Checks not yet run → "Run checks" CTA.
- **Interactions:** status badge is a dropdown; contact rows expand to ContactCard;
  timeline steps action inline.

---

## 5. Résumé section
**Mockup:** `Resume Editor.dc.html`

- **Layout:** shell rail + a **Versions** tree panel (172px) + **structured
  editor** (left) + **live PDF preview** (right) — the Overleaf split. Topbar:
  résumé name, version chip, Tailor, Export PDF.
- **Résumé list** (index, not mocked separately): cards per résumé (name, base
  version, # tailored children, last edited) + New / Import.
- **Structured editor:** sections (Profile, Experience, Education, Skills,
  Projects, Custom) as blocks; entries drag-sortable (grip handles); bullets are
  editable rows; skills are tag chips. **raw LaTeX** tab is the escape hatch —
  flagged `adv`, warns edits detach from structured editing for that version.
- **Live PDF preview:** light paper, template selector (Jake's / moderncv / deedy),
  zoom, page nav, re-renders on edit via Tectonic. Always light in both themes.
- **Version tree:** base → tailored children (indented, connector lines); select
  the base or any child; "Compare two →" opens the **semantic diff** between any two
  versions (same DiffRow language as tailoring, minus accept/reject — it's a
  read-only comparison).
- **On screen & why:** this is the Overleaf killer — résumé as versioned structured
  data with a real rendered document always visible. The tree makes provenance
  (which version went where) legible.
- **States:** empty → import or start blank. Import review → parsed fields with
  low-confidence flags. Render error (bad LaTeX in raw mode) → inline Tectonic error
  with the offending line, preview holds last good render.
- **Interactions:** autosave with a saved indicator; ⌘-drag reorder; template swap
  re-renders live.

---

## 6. Tailoring flow (hero)
**Mockup:** `Tailoring.dc.html` · **Full spec:** `TAILORING-DIFF.md`

- **Entry:** from an application ("Tailor résumé") or the editor ("Tailor to a
  job"). Pick base version → generate.
- **Layout:** two-pane, run tabs *Résumé changes · Cover letter*. Left = review
  (tabs Review / Structured / raw LaTeX); right = live PDF with diff overlay.
- **Core:** per-bullet accept/reject, inline word-level highlight, ChangeInspector
  (was/now/why/citation), FabricationFlag for refused uncited claims, save as a
  child version pinned to the application. Cover letter = generative draft with the
  same citation + fabrication guard. See the dedicated spec for full mechanics,
  states, and keyboard.

---

## 7. Checks panel
**Lives in:** Application detail (§4) + Résumé view. Shown in `Application Detail.dc.html`

- **The four checks**, each a row/card with a **verdict dot** (pass green / warn
  amber / fail red) + a **concrete count**, expandable to specifics:
  - **Parse fidelity** — render the PDF, re-parse with an open-source ATS parser,
    diff against your structured data. `2 of 14 fields dropped` → lists which
    (e.g. dates merged, GitHub link parsed as text) with a link to fix the field.
  - **Keyword coverage vs JD** — `18 / 22 JD terms`; expand shows matched vs
    missing terms, click a missing term to see where it could go.
  - **Format lint** — objective format rules (margins, bullet length, tense
    consistency, date format). `clean` or `N issues`.
  - **AI-tell audit** — flags phrasing that reads machine-written
    (`1 phrase flagged`); expand shows the phrase + a human rewrite suggestion.
- **Why:** the honesty pillar. **No aggregate score.** Each check is named for what
  it actually measured; the panel header says so. Unflattering results (dropped
  fields, missing keywords) are framed as instrument readings with a fix, never a
  grade or a scold.
- **States:** not-run → per-check "Run"; running → skeleton; key-missing (LLM-based
  checks) → those two checks gated, the format/parse checks still run offline.
- **Interactions:** each expandable; fixes deep-link to the exact résumé field.

---

## 8. Sourcing
**Mockup:** `Sourcing.dc.html`

- **Layout:** shell + topbar ("rated against Base résumé ▾"). Search row (keyword,
  location, remote toggle, Search) + saved-search chips. Results list.
- **Result card:** company tile, role, **FitTierBadge** (Strong / Possible /
  Reach), location/salary/posted/source; Strong results expand a **"Why it fits"**
  block (+ matches, ~ gaps, all traced to your résumé); **Pull into pipeline**
  one-click (creates a `sourced` application).
- **On screen & why:** batch LLM fit-rating over API results, honest and
  qualitative (no fake %); reasons let the user trust or dismiss fast. Saved
  searches make it a repeatable habit.
- **States:** no job-API key → DegradedBanner ("Sourcing needs a job-search API key
  — add JSearch/Adzuna; or paste a URL"), search UI dimmed (see `System States`).
  No results → "Nothing matched — widen the search." Rating in progress → cards
  arrive unrated then fill in fit.
- **Interactions:** remote toggle, sort by best fit / newest / salary; pull-in →
  toast with link to the new card; save search.
- **Later:** LinkedIn network-intel appears as contact enrichment on results/detail
  ("who do I know here", connection degree), not listing scraping.

---

## 9. Outreach
**Mockup:** `Outreach.dc.html`

- **Layout:** shell rail + **queue** column (Due today / Active, per-contact) +
  composer main. Composer: contact header (name, title, email, source, sending-from
  address), **Sequence** timeline (steps with day offsets, states) + **message
  editor**.
- **ContactCard:** name, title, company, source badge (Apollo / LinkedIn / manual),
  email-found state, degree (when LinkedIn on).
- **SequenceTimeline:** Step 1 + N follow-ups with `day +N` offsets; states sent /
  due / scheduled; "+ add step"; note that the sequence **halts automatically on
  reply**. The editing step is highlighted.
- **Message editor:** subject + body, drafted from the role + résumé highlights;
  cited highlights are underlined (hover → source); Regenerate / Save draft / Send
  now.
- **On screen & why:** turns "find the human" into sent mail with follow-through;
  the queue integrates with the dashboard's follow-ups-due. Drafting works without
  Apollo (manual contact) and without email config (save draft, send manually).
- **States:** no email key → composer works, "Send" becomes "Copy / mark as sent
  manually." Replied → sequence halted, contact moves to Active/replied, application
  flips to Replied.
- **Interactions:** edit any step; day-offset editable; send advances the sequence.

---

## 10. Settings
**Mockup:** `Settings.dc.html`

- **Layout:** shell rail + settings sub-nav (Providers & keys, Email, LinkedIn,
  Data & privacy, Appearance, About) + **KeyProviderCards**.
- **KeyProviderCard:** icon, name, one-line "what it powers", **status pill**
  (Configured green / Missing amber / Not-set hollow / Error red), fields (masked
  key; OpenAI-compatible adds base URL + model; job API adds JSearch/Adzuna choice),
  **Test connection** with a concrete result (`✓ 200 · 180ms · cache hit`), and a
  **"what breaks without this"** line on the missing/optional ones.
- **LinkedIn** card carries an **at-your-own-risk** disclaimer (ToS + account risk,
  read-only, off by default, toggle).
- **On screen & why:** BYOK is the whole trust model. States are explicit so the
  user always knows what's live; the honesty extends here — we tell you the
  consequence of every missing key rather than nagging. Privacy note pinned:
  encrypted at rest in `~/hunt.db`, no telemetry.
- **States:** each provider is independently configured/missing/error; keys shown
  masked; a global "3 configured · 3 missing" summary in the topbar.
- **Interactions:** save per-card; test-connection; reveal-key toggle; delete key.

---

## 11. System states (cross-cutting)
**Mockup:** `System States.dc.html`

Every screen must design all four (see DESIGN.md §8). Patterns:

- **Empty / first-run** — **EmptyState**: mark glyph, one serif line, one sentence
  of what/why, 1–2 CTAs. hunt-metaphor copy allowed here ("Nothing in your sights
  yet"). Never a blank panel.
- **Key-missing / degraded** — **DegradedBanner**: names the exact key, states the
  fallback, links straight to that Settings card; the gated feature stays visible
  but dimmed, never hidden. The rest of the app is unaffected.
- **Error** — inline, specific, recoverable: what failed, the real reason in mono
  (`402 — over plan limit`), and 2–3 recovery actions (Retry / Enter manually /
  fix settings). Never a raw stack trace, never a full-screen crash; preserve any
  work in progress.

---

## Appendix — file index

| Area | Mockup file |
| --- | --- |
| Onboarding (keys) | `Onboarding.dc.html` |
| Dashboard | `Dashboard.dc.html` |
| Pipeline | `Pipeline.dc.html` |
| Application detail + checks | `Application Detail.dc.html` |
| Résumé editor + preview + versions | `Resume Editor.dc.html` |
| Tailoring diff (hero) | `Tailoring.dc.html` |
| Sourcing | `Sourcing.dc.html` |
| Outreach | `Outreach.dc.html` |
| Settings (BYOK) | `Settings.dc.html` |
| System states | `System States.dc.html` |
| Visual directions (archive) | `hunt directions.dc.html` |

Docs: `DESIGN.md` (system), `TAILORING-DIFF.md` (hero interaction), this file.
