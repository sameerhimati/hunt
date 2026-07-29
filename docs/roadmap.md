# Roadmap

What hunt does today, what's coming, and — the part most roadmaps leave out —
**what we've decided not to build, and why.**

This file is the plan. If something isn't here, we're not working on it.

---

## Built

All of this works today, on your own machine.

| | Needs a key? |
|---|---|
| **Résumé as structured data** — versioned, three LaTeX templates, live PDF, raw-LaTeX escape hatch | no |
| **Semantic diff between any two versions** — what actually changed, not a text blob | no |
| **Pipeline tracker** — board and table, eight statuses, the exact résumé version pinned to each application | no |
| **Job search across public boards** — Greenhouse, Lever, Ashby, Remotive | no |
| **Four of the five honest checks** — parse fidelity, keyword coverage, format lint, AI-tell audit | no |
| **Outreach sequences** — write them yourself, copy out, mark as sent | no |
| **AI tailoring with citations** — every edit traces to a path in your own résumé; unsupported claims are refused *and shown* | one LLM key |
| **Cover letters** under the same citation guard | one LLM key |
| **PDF résumé import** | one LLM key |
| **Fit ratings and outreach drafts** | one LLM key |

Everything else — scraping, contact lookup, extra job sources, sending email —
is optional and only widens what you already have.

---

## Next

**Paste any job URL, no key.** Greenhouse, Lever and Ashby publish job data
openly. Pasting one of their links should fetch the real posting — title,
company, full description — without a scraping key. Roughly two thirds of real
job links are on those three boards.

**A first run that can't fail quietly.** Today you can save a half-configured
provider and hunt will tell you it saved. That's being fixed: it names the field
that's missing, and points at the exact card when a feature needs a key.

**Archive résumés.** Right now you can create them and never remove them.
Archive rather than delete, so an application never loses the record of what you
actually sent.

---

## Later

**A curated feed.** Jobs found *for* you — matched against your résumé and the
kind of company you want, rated, arriving regularly. Searching another board is
not the problem; deciding what's worth your time is.

**Draft the application form.** Between "tailored résumé" and "clicked submit"
sits fifteen minutes of retyping answers into a Greenhouse form. Nobody drafts
those with citations. We will.

**Reply detection.** Notice when someone replies, halt the follow-up sequence,
and move the application forward on its own. Over IMAP with an app password —
three setup steps, no Google Cloud project, and it matches the exact message we
sent rather than guessing from sender and date.

**Résumé performance.** "v3 got 4 interviews from 11 sends." We already pin the
exact version to every application; this is one join away, and nobody in this
space has it.

---

## What we won't build

This list is the product. Each of these is a real request we've turned down.

**Any match score, ATS score, resume grade, or percentage.** Nobody outside an
ATS vendor knows how Workday reads a résumé, so any number claiming to is
invented. Every competitor ships one. We don't have one, and there is nowhere in
our data model to put one. Instead you get named checks with criteria you can
inspect, and a fit rating that has to cite the line in your résumé it's talking
about.

**Auto-apply and one-click submit.** hunt prepares everything; a human presses
send. Tools that blast applications automatically are how people end up
blacklisted by the companies they most wanted.

**LinkedIn scraping.** Cancelled 2026-07-26. It needs your session cookie, it can
get *your* account restricted, and it breaks whenever LinkedIn changes a page.
Instead: add the contact yourself, keep a link to their profile, and let hunt
draft the message.

**Anything that invents experience for you.** If the model can't trace a claim to
your own résumé, hunt refuses it and shows you the refusal in the place the text
would have gone — with the option to write it yourself. That check is code that
runs after the model, not an instruction inside a prompt.

**Sending your data anywhere.** No accounts, no telemetry, no hosted backend.
Your résumé and your job search stay on your machine and leave only through API
calls you configure.

---

## Open questions

Genuinely undecided. Opinions welcome — open an issue.

- **A hosted version.** Not everyone wants to run Docker and bring their own API
  key. If hunt is hosted, the open-source version stays free and BYOK forever and
  the hosted one sells convenience — but it means we'd be holding your résumé,
  which is not a small thing. Undecided.
- **Where reply detection stops.** Reading replies to messages *you sent through
  hunt* is clearly in scope. Reading your inbox more broadly is clearly not.
  The line between them needs to be drawn precisely before any code is written.
- **DOCX import.** PDF works. DOCX is a small library away and keeps coming up.
