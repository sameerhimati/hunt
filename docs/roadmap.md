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
| **Paste a job link from Greenhouse, Lever or Ashby** — the real posting, straight from the board | no |
| **Four of the five honest checks** — parse fidelity, keyword coverage, format lint, AI-tell audit | no |
| **Outreach sequences** — write them yourself, copy out, mark as sent | no |
| **Archive a résumé** — never delete, so an application keeps the record of what you actually sent | no |
| **Résumé import, PDF or .docx** — read from your document's own layout, so nothing is invented and every field traces to text you wrote | no |
| **AI tailoring with citations** — every edit traces to a path in your own résumé; unsupported claims are refused *and shown* | one LLM key |
| **Cover letters** under the same citation guard | one LLM key |
| **Fit ratings and outreach drafts** | one LLM key |

Everything else — scraping, contact lookup, extra job sources, sending email —
is optional and only widens what you already have.

---

## Next

*The three items that stood here — pasting board links with no key, a first run
that can't fail quietly, and archiving résumés — all shipped on 2026-07-29 and
moved up to Built.*

**A notebook of facts about you.** Today hunt can only write what your résumé
already says. When it can't trace a claim it refuses — which is honest, and a
dead end: you get a gap where a sentence should be and no way forward. Next it
asks instead. *"You wrote 'scaled the ingest pipeline' with no number — what was
the throughput?"* Your answer becomes a fact you own, kept in one place, and
every future résumé and cover letter can cite it the same way they cite your
résumé today. The rule doesn't loosen — hunt still refuses anything you didn't
say. It just stops pretending your résumé is the only place you've said things.

The notebook is bigger than any one résumé on purpose, which raises the question
of what to draw from it for a given job. A person who has shipped ML pipelines,
run a family office and framed houses is not three résumés — they are one person
whose relevant half changes per posting. So the notebook is **the whole store,
and each application draws a slice of it**: hunt proposes which facts earn their
place against this posting, and you decide, the same way you decide on a tailored
bullet. What it must never become is a bank of claims the model dips into
unsupervised — the fact still has to be one you wrote down, and the citation
still has to resolve. It widens where provenance can point, not whether it has to.

**Which résumé version actually works.** "v3 got 4 interviews from 11 sends; v1
got 0." Every application already pins the exact version sent and stamps when a
reply, interview or decision landed. This is one join away, and nobody in this
space has it.

**Know when your résumé runs long.** hunt renders your PDF but doesn't yet read
the page count back — so tailoring, which only ever adds text, can quietly push
you to a third page. Next: hunt notices, and when it has to cut, it cuts the
line that is least relevant to *this* posting rather than the oldest one.

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

**Telemetry, tracking, or an account you didn't ask for.** No analytics, no
phone-home, no sign-up wall. Your résumé and your job search stay on your
machine and leave only through API calls you configure.

*Amended 2026-07-29.* This entry used to open "Sending your data anywhere" and
promised "no hosted backend." That was a claim about a business model, not about
your data, and it flatly contradicted the open question at the bottom of this
file. A hosted version is undecided and stays undecided until people ask for
one. Everything above is true either way, and the version you run yourself stays
free, MIT and BYOK regardless of what gets decided.

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
*DOCX import stood here as an open question and shipped on 2026-07-29, along
with keyless import for both formats — see Built.*
