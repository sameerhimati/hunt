export const meta = {
  name: 'hunt-phase-build',
  description:
    'Build ONE phase of hunt end-to-end: plan → foundation (serial) → leaves (parallel, file-disjoint) → integrate → autoloop-to-green → review. Driven by args.phase (0–8). Human gate = between invocations.',
  phases: [
    { title: 'Plan', detail: 'expand the PLAN.md phase → task DAG + write exit-gate tests (red) first', model: 'opus' },
    { title: 'Foundation', detail: 'serial: shared scaffold/schema/registries with slots for every leaf', model: 'opus' },
    { title: 'Build', detail: 'parallel: file-disjoint leaves (adapters+fakes, templates, checks, UI sections)', model: 'opus' },
    { title: 'Integrate', detail: 'wire the registries, run pnpm verify + the exit-gate suite', model: 'opus' },
    { title: 'Autoloop', detail: 'root-cause fix loop until pnpm verify + exit gate are green', model: 'opus' },
    { title: 'Review', detail: 'reviewer (+ security pass at P8); propose the PR-sized commit', model: 'opus' },
  ],
}

// ---- inputs ----
const PHASE = args && args.phase != null ? args.phase : 0
const MAX_FIX = (args && args.maxFixAttempts) || 6

// Shared context every agent gets. Encodes the non-negotiables from AGENTS.md / PLAN.md.
const CTX = [
  'Repo: /Users/sameer/Code/hunt. Before writing code, read AGENTS.md, PLAN.md, DESIGN.md, SCREENS.md,',
  'and the specific *.dc.html mockups for the screens this phase touches (design is GROUND TRUTH).',
  'This is a MODIFIED Next.js — read node_modules/next/dist/docs/ before using any Next API; heed deprecations.',
  'Conventions: pnpm 10; "pnpm verify" = typecheck+lint+test+build and MUST stay green (it is the verifier).',
  'Every adapter (lib/adapters/*) ships a fixture-backed Fake* twin; tests/e2e run on fakes, live APIs behind env flags.',
  'Honest-AI invariant: no fake ATS scores; tailoring edits must cite source-resume paths (validator-enforced, not prompt-vibes).',
  'Keys are encrypted at rest in ./data and NEVER logged or committed; /data and .env* are gitignored.',
  'v1 provider width = BOLD SET LIVE (Anthropic, OpenAI-compatible, Firecrawl, Apollo, JSearch+Adzuna, SMTP/Resend);',
  'all other providers (Bright Data, Hunter, free job boards) ship as adapter-ready STUBS behind the same interface.',
  'OpenAI-compatible model list is DISCOVERED from the key\'s /v1/models endpoint, never hardcoded.',
  'Every provider carries metadata: getKeyUrl + 2–4 setup steps + free-tier note + degradation string (drives Settings, docs, onboarding).',
].join(' ')

// ---- structured-output schemas ----
const PLAN_SCHEMA = {
  type: 'object',
  required: ['tasks', 'exitGateTestFiles'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'kind', 'files'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['foundation', 'leaf'] },
          files: { type: 'array', items: { type: 'string' }, description: 'exact paths this task owns; leaves must be disjoint' },
          deps: { type: 'array', items: { type: 'string' } },
          detail: { type: 'string' },
          // planner marks mechanical leaves (fixtures, metadata boilerplate) cheap; builders default to opus.
          model: { type: 'string', enum: ['opus', 'fable', 'haiku'] },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    exitGateTestFiles: { type: 'array', items: { type: 'string' }, description: 'test files written RED before any impl' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['green', 'failures'],
  properties: {
    green: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['where', 'message'],
        properties: { where: { type: 'string' }, message: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['blocking', 'commitMessage'],
  properties: {
    blocking: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
    designFidelity: { type: 'string' },
    commitMessage: { type: 'string' },
  },
}

// ============ 1. PLAN — decompose at runtime (don't fake-hardcode the DAG) ============
phase('Plan')
const plan = await agent(
  `${CTX}\n\nYou are PLANNING Phase ${PHASE} of hunt. Read the "Phase ${PHASE}" section of PLAN.md and every screen it touches.\n` +
    'Produce a task DAG splitting the phase into:\n' +
    '  • FOUNDATION tasks — shared files (Prisma schema/migrations, shared types, adapter/registry index files, screen shells). Built SERIALLY. Pre-create a slot/placeholder for every leaf that will plug in, so leaves never edit a shared file.\n' +
    '  • LEAF tasks — file-disjoint additive units (one adapter + its Fake twin + fixtures, one LaTeX template, one check, one Settings provider card). Each lists the EXACT paths it owns; no two leaves may share a path.\n' +
    'Mark purely mechanical leaves (fixture JSON, provider-metadata boilerplate) with model:"fable" or "haiku"; leave real logic on opus.\n' +
    'Then WRITE THE EXIT-GATE TESTS FOR THIS PHASE TO DISK NOW — they must FAIL (red), since nothing is built yet. Return the DAG and the list of test files you wrote.',
  { phase: 'Plan', model: 'opus', schema: PLAN_SCHEMA }
)
const foundation = plan.tasks.filter((t) => t.kind === 'foundation')
const leaves = plan.tasks.filter((t) => t.kind === 'leaf')
log(`Phase ${PHASE}: ${foundation.length} foundation + ${leaves.length} leaves; ${plan.exitGateTestFiles.length} exit-gate tests written RED.`)

// ============ 2. FOUNDATION — serial, dependency order (shared files) ============
phase('Foundation')
for (let i = 0; i < foundation.length; i++) {
  const t = foundation[i]
  await agent(
    `${CTX}\n\nPhase ${PHASE} FOUNDATION task ${t.id}: ${t.title}\nFiles you own: ${(t.files || []).join(', ')}\n${t.detail || ''}\n` +
      'Build it minimally and correctly. Create registries/index files/screen shells with a named slot for EVERY leaf that will plug in later, so parallel leaves only fill their own file. Make your unit typecheck. Do NOT run the full build yet.',
    { phase: 'Foundation', model: 'opus', label: `found:${t.id}` }
  )
}

// ============ 3. BUILD — parallel, file-disjoint leaves (main tree, no worktrees) ============
phase('Build')
await parallel(
  leaves.map((t) => () =>
    agent(
      `${CTX}\n\nPhase ${PHASE} LEAF task ${t.id}: ${t.title}\n` +
        `You own ONLY these files: ${(t.files || []).join(', ')} — do NOT edit anything outside this set. The shared registry slot for ${t.id} was pre-created in Foundation; fill it.\n${t.detail || ''}\n` +
        'If this is an adapter, ship its Fake* twin + fixtures. Write unit/integration tests for this unit and make them pass in isolation.',
      { phase: 'Build', label: `leaf:${t.id}`, model: t.model || 'opus', effort: t.effort }
    )
  )
)
log(`Phase ${PHASE}: ${leaves.length} leaves built in parallel.`)

// ============ 4. INTEGRATE — wire it up, run the real verifier ============
phase('Integrate')
let verify = await agent(
  `${CTX}\n\nPhase ${PHASE} INTEGRATE: wire every leaf into the shared registries/routes, resolve import gaps, then run "pnpm verify" AND the Phase ${PHASE} exit-gate suite. Report green:true only if BOTH pass. List every failure with where + message.`,
  { phase: 'Integrate', model: 'opus', schema: VERIFY_SCHEMA }
)

// ============ 5. AUTOLOOP — root-cause fix until green (or cap) ============
phase('Autoloop')
let attempts = 0
while (!verify.green && attempts < MAX_FIX) {
  attempts++
  verify = await agent(
    `${CTX}\n\nPhase ${PHASE} AUTOLOOP fix attempt ${attempts}/${MAX_FIX}. "pnpm verify"/exit-gate is RED:\n${JSON.stringify(verify.failures, null, 2)}\n` +
      'Find the ROOT CAUSE of each failure — no band-aids, never delete or weaken a test to make it pass. Fix, re-run "pnpm verify" + exit-gate, report the new state.',
    { phase: 'Autoloop', label: `fix:${attempts}`, model: 'opus', schema: VERIFY_SCHEMA }
  )
  log(`Phase ${PHASE} autoloop ${attempts}: ${verify.green ? 'GREEN ✓' : `${verify.failures.length} still failing`}`)
}

// ============ 6. REVIEW — quality + honest-AI + design fidelity; propose the commit ============
phase('Review')
const review = await agent(
  `${CTX}\n\nPhase ${PHASE} REVIEW. Verify is ${verify.green ? 'GREEN' : 'RED'}. Review this phase's diff for: real bugs, unhandled edge cases, any fabricated/uncited resume content (honest-AI invariant), any key logged or committed, any adapter missing its Fake twin, and fidelity to DESIGN.md / the mockups. ${PHASE >= 8 ? 'Run a full security pass (keys at rest, no key in logs, CSP).' : ''} Separate BLOCKING issues from nits. Propose a PR-sized commit message that explains WHY, not what.`,
  { phase: 'Review', model: 'opus', schema: REVIEW_SCHEMA }
)

return {
  phase: PHASE,
  green: verify.green,
  autoloopAttempts: attempts,
  taskCount: plan.tasks.length,
  remainingFailures: verify.green ? [] : verify.failures,
  blockingIssues: review.blocking,
  designFidelity: review.designFidelity,
  suggestedCommit: review.commitMessage,
}
