# hunt — Design System

The whole job hunt in one local-first app. This is the visual and interaction
spec that build sessions treat as ground truth. Direction: **Signal × Dossier ×
Steel merge** — cool graphite ground, a single mint signal, serif document voice,
mono for data. Sharp and capable, calm under density, private by default. It
should read as a *personal command center*, never a SaaS.

> Tokens below are authored for **Tailwind v4** (`@theme` + CSS variables) and map
> onto **shadcn/ui** conventions. Values are given in `oklch` (v4 default) with a
> hex comment. Dark is the shipped default (see §3).

---

## 1. Brand

- **Wordmark:** `hunt`, always lowercase, set in **Newsreader** (serif) 600. The
  serif is deliberate — it signals "your career, on the record," and separates us
  from the sea of geometric-sans dev tools.
- **Mark:** a geometric **HUD lock** — four corner brackets around a center dot
  (`◲ · ◱`). Precision optics, not a literal animal. Stroke = `primary`. Renders
  at 16 / 20 / 24 / 32. Favicon = mark only on `--background`.
- **Metaphor level:** *subtle-to-medium.* The hunt language lives in brand
  moments, empty states, and the status vocabulary ("sourced → … → offer"); the
  dense working UI stays neutral and professional. Never gory, never cute.
- **Voice:** plain, direct, honest. We say what a check actually measured. We
  never inflate ("Great score!") and never scold. Unflattering feedback is framed
  as an instrument reading, not a judgment.

---

## 2. Type

| Family | Role | Notes |
| --- | --- | --- |
| **Newsreader** (serif) | wordmark, section & screen headings, **the résumé document**, "was/now" diff text | opsz enabled; italic used for citations & taglines |
| **Public Sans** (sans) | all UI chrome, body, labels, buttons | the quiet workhorse |
| **JetBrains Mono** (mono) | data, counts, keys, file paths, citation chips, timestamps, keyboard hints, status codes | this is where "honest instrument" comes from |

App base size is **14px** (density). Scale:

| Token | px / rem | Use |
| --- | --- | --- |
| `text-xs` | 11 / 0.6875rem | mono labels, meta, kbd hints |
| `text-sm` | 12.5 / 0.78rem | secondary UI text |
| `text-base` | 14 / 0.875rem | body, table cells, inputs |
| `text-md` | 15 / 0.9375rem | résumé bullets, emphasis |
| `text-lg` | 17 / 1.0625rem | card titles |
| `text-xl` | 21 / 1.3125rem | screen headings (serif) |
| `text-2xl` | 26 / 1.625rem | page titles (serif) |
| `text-3xl` | 32 / 2rem | onboarding / marquee (serif) |

Line-height: 1.5 body, 1.45 résumé bullets, 1.2 headings. Letter-spacing: `-0.01em`
on serif headings, `+0.1em`–`+0.16em` uppercase on mono labels. `text-wrap: pretty`
on all prose.

---

## 3. Color tokens

**Why dark default:** the app runs locally as a private workspace. Dark reads as a
command center rather than a marketing surface, matches the technical launch
audience (Product Hunt / GitHub), and lets the mint signal + green/amber diff
semantics carry meaning without shouting. Both themes ship day one; the résumé
**PDF preview is always light paper** in both themes — it's a document, not chrome.

### 3.1 Dark (`.dark`, default)

```css
.dark {
  --background:        oklch(0.16 0.008 220);  /* #0a0d0f  app ground */
  --foreground:        oklch(0.93 0.006 220);  /* #e6edf0  primary text */
  --card:              oklch(0.21 0.010 220);  /* #11161a  panels, sidebar */
  --card-foreground:   oklch(0.93 0.006 220);
  --popover:           oklch(0.21 0.010 220);  /* #11161a */
  --popover-foreground:oklch(0.93 0.006 220);
  --surface-2:         oklch(0.25 0.012 220);  /* #161d22  raised rows, chips */
  --muted:             oklch(0.25 0.012 220);  /* #161d22 */
  --muted-foreground:  oklch(0.66 0.012 220);  /* #8b969d  secondary text */
  --faint:             oklch(0.48 0.012 220);  /* #5a666d  tertiary/divid: icons */
  --border:            oklch(0.32 0.012 220);  /* #232c31 */
  --input:             oklch(0.32 0.012 220);  /* #232c31 */
  --ring:              oklch(0.79 0.140 168);  /* mint — focus */

  --primary:           oklch(0.79 0.140 168);  /* #3ad6a5  mint signal */
  --primary-foreground:oklch(0.16 0.030 165);  /* #04120c  ink on mint */

  --secondary:         oklch(0.25 0.012 220);  /* #161d22 */
  --secondary-foreground: oklch(0.93 0.006 220);
  --accent:            oklch(0.25 0.012 220);
  --accent-foreground: oklch(0.93 0.006 220);

  --destructive:       oklch(0.63 0.200 22);   /* #e5484d  delete/danger */
  --destructive-foreground: oklch(0.98 0.01 20);

  /* diff + honesty semantics (custom, added to @theme) */
  --diff-add:          oklch(0.83 0.110 165);  /* #6fdcb5  added text fg */
  --diff-add-bg:       oklch(0.24 0.050 165);  /* #0f261e  added highlight */
  --diff-del:          oklch(0.72 0.110 20);   /* #e88a8f  removed text fg */
  --diff-del-bg:       oklch(0.24 0.050 20);   /* #2a1618  removed highlight */
  --warn:              oklch(0.79 0.130 85);   /* #e0b13a  fabrication flag */
  --warn-bg:           oklch(0.22 0.030 85);   /* amber wash */

  /* check verdicts */
  --pass: var(--diff-add);   /* green  */
  --warn-check: var(--warn); /* amber  */
  --fail: var(--destructive);/* red    */
}
```

### 3.2 Light (`:root`)

```css
:root {
  --background:        oklch(0.98 0.004 95);   /* #f7f6f2  warm off-white */
  --foreground:        oklch(0.24 0.010 240);  /* #1b1e22 */
  --card:              oklch(1 0 0);           /* #ffffff */
  --card-foreground:   oklch(0.24 0.010 240);
  --popover:           oklch(1 0 0);
  --popover-foreground:oklch(0.24 0.010 240);
  --surface-2:         oklch(0.96 0.005 95);   /* #efede6 */
  --muted:             oklch(0.96 0.005 95);
  --muted-foreground:  oklch(0.50 0.010 240);  /* #6b7075 */
  --faint:             oklch(0.68 0.010 240);
  --border:            oklch(0.90 0.006 95);   /* #e4e0d6 */
  --input:             oklch(0.90 0.006 95);
  --ring:              oklch(0.62 0.120 168);

  --primary:           oklch(0.62 0.120 168);  /* #2f9e77  darker mint for AA on light */
  --primary-foreground:oklch(0.99 0.01 165);

  --destructive:       oklch(0.58 0.200 25);
  --destructive-foreground: oklch(0.99 0.01 20);

  --diff-add:          oklch(0.52 0.120 165);  /* #1f8a63 */
  --diff-add-bg:       oklch(0.93 0.060 165);  /* #d9f2e6 */
  --diff-del:          oklch(0.55 0.180 25);   /* #c0453f */
  --diff-del-bg:       oklch(0.93 0.050 25);   /* #f7dedb */
  --warn:              oklch(0.62 0.120 75);   /* #b57e1e */
  --warn-bg:           oklch(0.95 0.050 85);
}
```

Contrast: body text ≥ 7:1 on its surface; muted ≥ 4.5:1; `primary` used as a fill
carries `primary-foreground`, never light-on-mint text.

---

## 4. Spacing, radius, elevation

- **Spacing:** 4px base (Tailwind default `1`=4px). Working rhythm uses `2/3/4/6/8`
  (8/12/16/24/32px). Screen gutter 24–32px; card padding 16–20px; dense table row
  36–40px tall; kanban card padding 12px.
- **Radius:** `--radius: 0.5rem` (8px). `sm` 4px (chips, inline diff highlight),
  `md` 8px (buttons, cards), `lg` 12px (dialogs, large panels), `full` (avatars,
  status dots). The résumé paper is a flat 3px.
- **Elevation** (dark leans on borders, not shadow):
  - `flat` — `1px solid var(--border)`, no shadow (default for panels/cards).
  - `raised` — border + `0 1px 0 rgba(0,0,0,.3)` (hover on cards, kanban lift).
  - `overlay` — `0 16px 40px rgba(0,0,0,.5)` (dialogs, popovers, Cmd-K, PDF paper).
  - Focus ring: `0 0 0 3px color-mix(in oklch, var(--ring) 22%, transparent)`.

---

## 5. Layout & navigation

**Model: persistent left rail, contextual topbar, command palette.** Sidebar over
topbar because hunt has ~7 top-level areas and is used in long focused sessions —
a rail keeps them one click away and reads as a command center. A topbar alone
would bury navigation behind menus.

- **Left rail** — two states:
  - *Collapsed* (default, **54px**): mark at top, icon-only nav, active item has a
    2px `primary` inset bar + `surface-2` fill. Settings + theme toggle pinned
    bottom. Tooltips on hover.
  - *Expanded* (**220px**, toggle or hover-pin): wordmark + labeled items + section
    counts (e.g. Pipeline · 14). Persists per user (localStorage).
  - Order: **Dashboard, Pipeline, Sourcing, Resumes, Outreach** · (spacer) ·
    **Settings**.
- **Topbar** (per screen, 52px): breadcrumb / screen title on the left; primary
  screen action + `⌘K` chip on the right. Sits on `--card`, `1px` bottom border.
- **Command palette (`⌘K`)** — shadcn `Command` in a dialog. Actions: jump to any
  application/résumé, change status, start a tailor run, new application from URL,
  toggle theme, open Settings. This is a first-class navigation path, not a
  power-user afterthought — shortcuts surface in tooltips throughout.
- **Content width:** fluid, max ~1440 for reading screens; board/table screens go
  full-bleed. Must stay usable at **1280×800 (13" laptop)** — the hard target.
  Tablet is graceful degrade; phone out of scope for v1.
- **Split panes** (résumé editor, tailoring): resizable, min 380px per side, drag
  handle on the divider, ratio persisted.

---

## 6. Component inventory

### 6.1 shadcn/ui primitives (use as-is, themed by §3)

`Button` (variants: default=primary, secondary, outline, ghost, destructive, link;
sizes sm/default/icon) · `Input` · `Textarea` · `Label` · `Select` · `Checkbox` ·
`Switch` · `RadioGroup` · `Tabs` · `Card` · `Badge` · `Dialog` · `Sheet` (side
panels) · `Popover` · `DropdownMenu` · `Command` (⌘K) · `Tooltip` · `Separator` ·
`ScrollArea` · `Table` · `Accordion` · `Progress` · `Skeleton` · `Alert` ·
`Avatar` · `Sonner` (toasts) · `HoverCard` (contact/company preview).

### 6.2 Custom components (built on primitives)

| Component | Purpose | Notes |
| --- | --- | --- |
| **AppShell** | rail + topbar + content slot | owns collapse state, ⌘K mount |
| **DiffRow** | one proposed change | inline word-level add/del, numbered pin, per-row accept/reject, expandable rationale — see TAILORING-DIFF.md |
| **ChangeInspector** | detail for selected change | was/now, why, citation, actions, prev/next |
| **CitationChip** | `experience[0].bullets[3]` | mono, click → scrolls source résumé node into the editor |
| **FabricationFlag** | refused, uncited claim | amber, struck-through ghost, "not added — no source" |
| **CheckCard** | one honest check | title + concrete count + pass/warn/fail dot + expandable detail; **no aggregate score** |
| **PipelineCard** | kanban card | company, role, status age, pinned résumé vN, fit tier, follow-up dot; dnd-kit sortable |
| **StatusBadge** | pipeline status | 8 statuses, each a hue on `surface-2` (not saturated fills) |
| **FitTierBadge** | Strong / Possible / Reach | qualitative tiers + reason on hover — never a fake %/score |
| **PdfPreviewFrame** | live rendered résumé | light paper, toolbar (template ▾, zoom, page, diff-overlay), re-renders on edit |
| **SequenceTimeline** | outreach steps | step 1 + follow-ups w/ day offsets, sent/replied/scheduled states |
| **ContactCard** | recruiter / hiring mgr | source badge (Apollo/manual), LinkedIn profile link when the user recorded one, actions |
| **FunnelStat** | dashboard metric | count + stage + conversion % to next stage |
| **KeyProviderCard** | Settings BYOK | configured/missing/error state, test-connection, "what breaks without this" |
| **VersionTree** | résumé version history | base → tailored children; select two → diff |
| **EmptyState** | zero-data per screen | icon, one line of what/why, one primary action |
| **DegradedBanner** | key-missing | "X needs a Y key" + deep link to the exact Settings card |

---

## 7. Honesty patterns (cross-cutting, non-negotiable)

- **No aggregate "ATS score."** Ever. Checks are named for what they measure:
  *Parse fidelity · Keyword coverage · Format lint · AI-tell audit.*
- **Checks report concrete counts + a verdict dot**, not percentages of a made-up
  whole: `Keyword coverage — 18 / 22 JD terms` · `Parse fidelity — 2 fields dropped`
  · verdict = pass (green) / warn (amber) / fail (red). Expandable to the specifics.
- **Fit rating is qualitative:** Strong / Possible / Reach, always with the reasons,
  never a false-precision number.
- **Tailoring never fabricates.** Every accepted change traces to a source-résumé
  path (CitationChip). Uncited additions are shown as refused FabricationFlags, not
  silently dropped — the user sees exactly what the model tried and why it was cut.

---

## 8. States (design every screen for all four)

- **Populated** — the happy path, realistic density.
- **Empty / first-run** — EmptyState with one action; hunt-metaphor copy allowed here.
- **Key-missing / degraded** — DegradedBanner naming the exact key + deep link;
  the feature is visible but clearly gated, never hidden.
- **Error** — inline, specific, recoverable ("Firecrawl returned 402 — check your
  plan"); never a raw stack, never a crash.

---

## 9. Motion

Restrained. 120–160ms ease-out on hover/state; 200ms on panel/dialog entrance;
diff accept/reject animates the row to its resolved state (150ms) and the PDF
gutter mark fades (200ms). No decorative motion, no AI-sparkle. `prefers-reduced-
motion` respected — cross-fades only.
