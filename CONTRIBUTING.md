# Contributing to hunt

Thanks for looking. hunt is a local-first job-hunting app with one unusual rule,
and most of what follows exists to protect it.

## The rule

**Nothing in hunt may assert something it has not checked.**

That is not a style preference, it is the product. Concretely:

- No match score, ATS score, résumé grade or compatibility percentage. Nobody
  outside an ATS vendor knows how Workday reads a résumé, so any number claiming
  to is invented. There is nowhere in the data model to put one, and that is
  deliberate.
- Every tailored edit must cite the place in the user's own résumé it came from,
  and the citation is **verified in code after the model answers** — not
  requested in the prompt. A claim that cannot be traced is refused, and the
  refusal is shown rather than hidden.
- If the UI says something happens, the code must do it. The worst bug we have
  shipped was a timeline that read "sequence halts automatically when they
  reply" while the function behind it had zero callers.

A patch that adds a number the code cannot defend will be turned down however
good the rest of it is.

## Getting set up

```sh
pnpm install     # Node 22 (see .nvmrc); pnpm 10 via corepack
pnpm dev         # http://localhost:3000
```

There is no migrate step. The database creates and migrates itself on first
query, in `./data`, and that directory is the whole of your state — back it up,
or delete it for a clean install.

You need no API keys to work on most of hunt. Résumé import and editing, the
pipeline, public-board search and four of the five checks all run without one.

## Before you open a pull request

```sh
pnpm verify      # typecheck, lint, unit tests, promoted phase gates, build
pnpm e2e         # Playwright, against a production build, on fake adapters
```

`pnpm verify` must be green. It is not advisory — it is what every change is
held to, and it is the loop the maintainers run continuously.

## Things worth knowing before you change them

Each of these has bitten us, and the comment in the code explains why:

- **The Prisma client is lazy behind a proxy.** Constructing it at module scope
  segfaults `next build` workers. Do not "simplify" it.
- **`better-sqlite3` is pinned** to the version `@prisma/adapter-better-sqlite3`
  depends on. Two native builds of it in one process segfault the server.
- **`output: standalone` is opt-in** via `HUNT_STANDALONE=1`, because it disables
  `next start`, which dev and e2e both need.
- **Adapters ship with a fixture-backed `Fake*` twin.** Tests and e2e run on the
  fakes; live APIs sit behind env flags. A PR that makes the suite need a network
  connection will be asked to add a fake instead.
- **Providers are declared once** in `src/lib/providers/registry.ts` from each
  adapter's `meta`. A test fails the build if a provider ships without its
  onboarding copy, because a Settings card you can fill in and get nothing from
  is a promise the code does not keep.

## Gates

Each phase's acceptance tests are written and committed **failing**, before the
phase is built, under `gates/`. They are the contract. They are read-only to the
implementation: if a gate is wrong, say so and change it deliberately in its own
commit — do not edit one to make a build pass.

## Tests

Integration over unit. Test behaviour, not implementation. Skip trivial getters.

One specific warning, learned twice: **a test built from invented inputs can pass
while the code fails on every real one.** The page counter passed seven
hand-written buffers and returned zero on every actual PDF. Where a fixture can
be a real artifact, make it one.

## Commits

Explain **why**, not what. One logical change per commit. Branches are
`feature/`, `fix/` or `chore/`.

## Reporting bugs

Use the issue templates. The single most useful thing you can include is what
you expected the app to say versus what it said — most of our real defects have
been the UI claiming something the code did not do.
