# Tailoring Diff — Interaction Spec

The single most important interaction in hunt. Tailoring a résumé against a job
description **never silently rewrites** anything — it produces a set of proposed
changes the user reviews like staged hunks in a code review, accepts or rejects
individually, and saves as a new version pinned to the application. This document
is the ground truth for that flow.

Design language and tokens: see `DESIGN.md`. Locked visual reference: direction
**3a** in `hunt directions.dc.html`.

---

## 1. Mental model

- **Not a chatbot.** No conversation, no "here's your new résumé." The output is a
  reviewable set of diffs against a specific base version.
- **The document is always visible.** Two-pane, Overleaf-style: review/edit on the
  left, the **live rendered PDF on paper** on the right. Accepting a change updates
  the PDF immediately.
- **Every change is atomic and reversible** until save. Nothing is committed to a
  new version until the user saves.
- **Provenance is mandatory.** Every proposed change carries a rationale and a
  citation back to a path in the source résumé. Changes the model could not cite
  are refused, not applied — and shown as such.

---

## 2. Anatomy of the screen

```
┌ topbar: Company — Role / Tailor            [⌘K]  [Accept all & save v4] ┐
├──────────────────────────────┬──────────────────────────────────────────┤
│ LEFT — review / edit          │ RIGHT — live PDF                          │
│ tabs: Review changes ·        │ toolbar: Template ▾ · Diff overlay ● ·    │
│       Structured · raw LaTeX   │          − zoom + · page 1/1 · Live       │
│                                │                                            │
│ change list (grouped by        │ ┌─ paper (light, always) ──────────────┐ │
│ résumé section):               │ │  rendered résumé; changed lines carry │ │
│  ① kept   ② selected  ③ kept   │ │  a green gutter bar; refused          │ │
│  ⚠ flagged (refused)           │ │  fabrications never appear here       │ │
│                                │ └───────────────────────────────────────┘ │
└──────────────────────────────┴──────────────────────────────────────────┘
```

- **Left tabs:** *Review changes* (the diff, default after a tailor run) ·
  *Structured* (the normal section editor) · *raw LaTeX* (escape hatch, flagged
  `advanced`, warns it detaches from structured editing).
- **Summary strip:** `N changes · X accepted · Y pending · Z flagged`. Counts are
  live and mono.

---

## 3. The DiffRow

Each proposed change is one row, grouped under its résumé section (Experience ·
Ramp, Skills, …). A row has:

1. **Pin** — a numbered circle. Green = accepted, mint(filled) = selected, hollow =
   pending, amber `!` = flagged. The number ties the row to its mark in the PDF and
   to the ChangeInspector.
2. **Change text** with **inline word-level** highlighting:
   - removed words: `--diff-del` fg on `--diff-del-bg`, strikethrough, 1px.
   - added words: `--diff-add` fg on `--diff-add-bg`.
   - unchanged words: normal `--foreground`.
   - This makes *what moved* legible at a glance; the decision is still per-row.
3. **Row control** (right): a state chip.
   - pending → `Accept` (primary) / `Reject` (ghost).
   - accepted → `✓ kept` (green outline) + `undo` on hover.
   - rejected → `✕ rejected` (muted) + `restore` on hover.
4. **Kind glyph** in the gutter: `~` edit · `+` addition · `−` removal · `⇅` reorder.

### 3.1 Granularity (decided)

- **Highlight** is word-level (inline) — you see the exact words changed.
- **Accept/reject is per-row** (the whole bullet / field), like staging a hunk.
  Not per-word — that would make review slow and produce Frankenstein bullets.
- A coarser **per-section** grouping is available via "accept all in section."

---

## 4. The ChangeInspector (selected change)

Selecting a row expands it inline (left pane) **and** is the canonical detail view.
It shows, top to bottom:

- **Was** — the original text, `--diff-del` left border, muted.
- **Now** — the proposed text, `--diff-add` left border, foreground.
- **Why this change** — one or two sentences of rationale, in plain language, tied
  to the JD ("JD leads with reliability & latency SLOs; your original buried the
  metric"). Label is mono uppercase `WHY`.
- **Traces to your résumé** — a **CitationChip** (`experience[0].bullets[3]`) plus
  the exact source snippet quoted in serif italic
  (*"reduced p99 from 210ms to 130ms after sharding"*). Clicking the chip scrolls
  the source node into view in the Structured tab.
- **Actions** — `Accept change` (primary, full-width-ish) / `Reject` (ghost).
- **Prev / next** (`↑ ↓` or `j/k`) to walk changes without leaving the keyboard.

---

## 5. Fabrication warning (the honesty moment)

When the model proposes a claim it **cannot cite** to the source résumé, a
validator refuses it. It is **never applied** and **never silently dropped** —
it's surfaced so the user sees what was attempted and trusts the ones that passed.

- Rendered as a **FabricationFlag** row: amber pin `!`, the proposed sentence shown
  **struck through** in the ghost/faint color, and the line:
  **"Not added — no source. The model proposed this; nothing in your résumé
  supports it. hunt won't invent experience."**
- It appears **inline in the section** where it would have gone (a ghost line), so
  the absence is legible, and is **docked at the bottom of the ChangeInspector**
  when reviewing that section.
- Actions: `Dismiss` (removes the flag) or **"Add it yourself"** → opens the
  Structured editor at that field with an empty input, so the user can add it *only
  if it's true* — the act is explicitly theirs, not the model's.
- The refused claim **never renders in the PDF preview.**
- Fabrication count is called out in the summary strip in amber and gates nothing —
  the user can still save; hunt only refuses to author the claim itself.

---

## 6. Cover letter

The same tailor run also drafts a cover letter, on a second tab within the run
(*Résumé changes · Cover letter*). The cover letter is **generative, not a diff**
(there's no base to diff against), so it's presented as an editable draft with the
same **citation affordance**: hover any sentence to see which résumé/JD facts it
draws on, and the same fabrication guard — uncited claims are flagged inline before
you send. Edits are free-text; "Regenerate" re-drafts, "Save" pins it to the
application alongside the résumé version.

---

## 7. Saving & versioning

- **Accept all & save vN** (topbar) or **Save** commits *accepted* changes as a new
  **child ResumeVersion** of the base (`parentVersionId` set), auto-labeled
  `Stripe — Senior Backend Eng` and pinned to the application
  (`Application.resumeVersionId`).
- Rejected changes are discarded; flagged fabrications are never in the output.
- The new version appears in the **VersionTree** as a child of the base — the base
  is untouched, so the user can re-tailor or branch again.
- Leaving with unsaved decisions prompts: *save vN / discard / keep reviewing.*

---

## 8. States

- **Generating** — skeleton rows stream in as the model returns changes; the PDF
  shows the base with a subtle "updating" shimmer. Never a blank spinner-only screen.
- **No changes proposed** — "Your résumé already covers this role well." with the
  checks summary and a `Re-run with emphasis on …` option. Not an error.
- **Key missing** (no LLM key) — the Tailor action is visible but gated with a
  DegradedBanner: *"Tailoring needs an LLM key — add Anthropic or an
  OpenAI-compatible endpoint in Settings."* + deep link. Nothing else on the app is
  blocked.
- **Model error / timeout** — inline, specific, with `Retry`; accepted changes so
  far are preserved.

---

## 9. Keyboard

| Key | Action |
| --- | --- |
| `j` / `↓` | next change |
| `k` / `↑` | previous change |
| `a` | accept selected |
| `r` | reject selected |
| `u` | undo last decision |
| `⌘↵` | accept all & save |
| `esc` | back to application |

All destructive-feeling actions (reject, dismiss fabrication) are reversible until
save; no confirm dialogs in the review loop — speed is the point.
