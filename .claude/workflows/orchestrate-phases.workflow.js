export const meta = {
  name: 'hunt-wave-build',
  description:
    'Build ONE wave of hunt: preflight → wave foundation (serial) → phases in parallel git worktrees (file-disjoint per PHASE-PLAN.md) → merge → verify+e2e+gates → promote gates → STOP for human review. Waves: 1=[P1,P2] 2=[P3,P4,P5] 3=[P6,P7] 4=[P8]. Driven by args.wave.',
  phases: [
    { title: 'Preflight', detail: 'main is green; cut the wave-K integration branch', model: 'opus' },
    { title: 'Foundation', detail: 'serial: the wave\'s shared seams from PHASE-PLAN.md §Wave K', model: 'opus' },
    { title: 'Phases', detail: 'parallel worktrees, one hunt-phase-build child workflow each', model: 'opus' },
    { title: 'Integrate', detail: 'merge feature branches, un-dim nav, verify + e2e + gates, fix loop', model: 'opus' },
    { title: 'Promote', detail: 'append phases to gates/DONE; verify the gates now bite; clean worktrees', model: 'opus' },
  ],
}

// ---- the DAG (validated in PHASE-PLAN.md §1; do not reorder without replanning) ----
const WAVES = { 1: [1, 2], 2: [3, 4, 5], 3: [6, 7], 4: [8] }

// args can arrive as an object or as a JSON-encoded string depending on how the
// Workflow tool call was serialized; a bare number is accepted as the wave too.
const ARGS =
  typeof args === 'string' ? JSON.parse(args) : typeof args === 'number' ? { wave: args } : args || {}

const WAVE = Number(ARGS.wave)
if (!WAVES[WAVE]) throw new Error(`args.wave must be one of ${Object.keys(WAVES).join(', ')}`)
const PHASES = WAVES[WAVE]
const MAX_FIX = ARGS.maxFixAttempts || 8
const ROOT = '/Users/sameer/Code/hunt'
const BRANCH = `wave-${WAVE}`

// Matches .nvmrc (22) and package.json engines (>=22). Update if the installed
// v22 patch changes; `nvm which 22` prints the current path.
const NODE_BIN = '/Users/sameer/.nvm/versions/node/v22.16.0/bin'

const RULES = [
  `Repo root: ${ROOT}. PHASE-PLAN.md is the execution contract; AGENTS.md guardrails apply verbatim.`,
  'Gate files under gates/ are read-only everywhere. Never merge to main. Never push. Never touch ./data.',
  'pnpm 10 via corepack on Node 22. Lockfile conflicts are resolved by re-running "pnpm install", never hand-merged.',
  // Non-interactive tool shells do not source nvm and land on whatever node the
  // parent process PATH froze in (v20 as of this writing). better-sqlite3 has no
  // prebuild for the Node 20 ABI, so it silently falls back to a ~2min source
  // build and then mismatches at runtime. Pin the interpreter per command.
  `EVERY shell command MUST start with 'export PATH="${NODE_BIN}:$PATH"' so node resolves to 22.`,
  `Non-interactive shells do NOT source nvm and default to Node 20, which breaks better-sqlite3. Verify with "node -v" (expect v22.x) before the first "pnpm install" in any new worktree; if it reports v20, fix PATH before continuing rather than proceeding.`,
].join(' ')

// ---- surviving a dead agent ----
// agent() and workflow() return null when a subagent dies on a terminal API
// error after retries, or when the operator skips it — documented behaviour
// that a long wave hits when it runs out of session budget. On Wave 2 an
// unguarded `verify.green` threw at Integrate, so the script never reached its
// return and three finished phase worktrees sat orphaned until a human found
// them. Losing an agent must cost that agent's work, never the wave's: every
// nullable call goes through alive(), which degrades the loss into a reported
// non-green outcome and records WHICH agent vanished. A lost agent (retryable —
// rerun it) is deliberately distinguishable from an agent that ran and reported
// failure (needs a code fix); `dead:true` and lostAgents carry that difference
// into both the log and the returned result.
const lostAgents = []
function alive(where, result, fallback) {
  if (result) return result
  lostAgents.push(where)
  log(`Wave ${WAVE}: AGENT LOST at ${where} — no result (terminal error or skipped), not a reported failure. Work already committed is preserved; continuing to a reported non-green outcome.`)
  return fallback
}
function deadVerify(where) {
  return {
    green: false,
    dead: true,
    failures: [{ where, message: 'agent returned no result (died or was skipped) — retryable, not a test failure' }],
  }
}

const OK_SCHEMA = {
  type: 'object',
  required: ['ok', 'detail'],
  properties: { ok: { type: 'boolean' }, detail: { type: 'string' } },
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

// ============ 1. PREFLIGHT — never build on a broken base ============
phase('Preflight')
const preflight = alive(
  'Preflight',
  await agent(
    `${RULES}\n\nPreflight for wave ${WAVE} (phases ${PHASES.join(', ')}):\n` +
      `1. In ${ROOT}: working tree must be clean and the current branch must be main (report ok:false otherwise — do not stash or fix).\n` +
      `2. Every prior wave's phases must already be listed in gates/DONE (wave ${WAVE} needs ${WAVE > 1 ? `phases ${WAVES[WAVE - 1].join(', ')} promoted` : 'only phase 0'}).\n` +
      '3. Run "pnpm verify" and "pnpm e2e". Both must be green.\n' +
      `4. Create branch ${BRANCH} from main and check it out.\n` +
      'Report ok + a one-line detail.',
    { phase: 'Preflight', model: 'opus', schema: OK_SCHEMA }
  ),
  { ok: false, detail: 'preflight agent returned no result (died or was skipped) — nothing was built, rerun the wave' }
)
if (!preflight.ok) {
  return { wave: WAVE, aborted: 'preflight', detail: preflight.detail, green: false, lostAgents }
}

// ============ 2. WAVE FOUNDATION — serial owner of the shared seams ============
phase('Foundation')
await agent(
  `${RULES}\n\nYou own the WAVE ${WAVE} FOUNDATION, working on branch ${BRANCH} in ${ROOT}.\n` +
    `Implement exactly the "Wave ${WAVE} foundation" tasks in PHASE-PLAN.md — shared seams only (schema deltas + migrations, ⌘K/palette registry, shadcn primitive installs, shared engines like lib/fit, test-mode wiring). Do NOT start any phase's own leaves.\n` +
    'When done: "pnpm verify" green, committed on the branch in logical commits (messages explain WHY).',
  { phase: 'Foundation', model: 'opus', label: 'wave-foundation' }
)

// ============ 3. PHASES — parallel worktrees, one child workflow each ============
phase('Phases')
const results = await parallel(
  PHASES.map((n) => async () => {
    const dir = `${ROOT}/../hunt-p${n}`

    await agent(
      `${RULES}\n\nSet up the worktree for phase ${n}: in ${ROOT} run\n` +
        `  git worktree add ${dir} -b feature/phase-${n} ${BRANCH}\n` +
        `then in ${dir}: corepack enable && pnpm install. Confirm "pnpm typecheck" passes there. If the worktree already exists from an aborted run, remove it first with "git worktree remove --force ${dir}" (it contains only generated state).`,
      { phase: 'Phases', label: `worktree:p${n}`, model: 'haiku' }
    )

    // Registered workflow NAME, not a path — a path string resolves against the
    // workflow registry and throws "no workflow with that name", which silently
    // skips the entire phase build (the thunk dies, the phase branch stays empty).
    const built = alive(`Phases:p${n}`, await workflow('hunt-phase-build', { phase: n, dir }), deadVerify(`phase ${n} build`))

    await agent(
      `${RULES}\n\nFinalize phase ${n} in ${dir}: ensure everything is committed on feature/phase-${n} ` +
        '(PR-sized commits, WHY-messages, no stray files, nothing under gates/ modified, no secrets). Report ok + detail.',
      { phase: 'Phases', label: `commit:p${n}`, schema: OK_SCHEMA }
    )

    return { phase: n, dir, result: built }
  })
)
// A phase counts as green only if it SAID so: a missing thunk result or a dead
// child workflow means unknown, and unknown must never be advertised as ready.
const failed = PHASES.filter((_, i) => !results[i] || results[i].result?.green !== true)
const readyBranches = PHASES.filter((n) => !failed.includes(n)).map((n) => `feature/phase-${n}`)
log(`Wave ${WAVE}: ${PHASES.length - failed.length}/${PHASES.length} phases green in their worktrees.`)

// ============ 4. INTEGRATE — merge, wire nav, run the wave gate, fix loop ============
phase('Integrate')
let verify = alive(
  'Integrate',
  await agent(
    `${RULES}\n\nWAVE ${WAVE} INTEGRATE on ${BRANCH} in ${ROOT}:\n` +
      `1. Merge ${PHASES.map((n) => `feature/phase-${n}`).join(', ')} into ${BRANCH} (in that order). package.json conflicts: keep both dep sets; then re-run "pnpm install" to regenerate the lockfile.\n` +
      '2. Un-dim this wave\'s areas in src/components/nav-rail.tsx (remove their comingIn markers) per PHASE-PLAN.md.\n' +
      `3. Run: pnpm verify && pnpm e2e && ${PHASES.map((n) => `pnpm gate ${n}`).join(' && ')}.\n` +
      'Report green only if ALL pass; list every failure with where + message.' +
      (failed.length ? `\nNOTE: phases ${failed.join(', ')} reported non-green from their worktrees — expect their gates to need work.` : ''),
    { phase: 'Integrate', model: 'opus', schema: VERIFY_SCHEMA }
  ),
  deadVerify('Integrate')
)

let attempts = 0
// `!verify.dead` stops the loop the moment an agent vanishes: whatever killed it
// (session budget, terminal API error, an operator skip) will kill the next
// eight identically, and burning the cap teaches the operator nothing.
while (!verify.green && !verify.dead && attempts < MAX_FIX) {
  attempts++
  verify = alive(
    `Integrate:fix:${attempts}`,
    await agent(
      `${RULES}\n\nWAVE ${WAVE} fix attempt ${attempts}/${MAX_FIX} on ${BRANCH} in ${ROOT}. RED:\n${JSON.stringify(verify.failures, null, 2)}\n` +
        `Root-cause each failure — no band-aids, never weaken a test, gates/ is read-only. Fix, re-run pnpm verify && pnpm e2e && ${PHASES.map((n) => `pnpm gate ${n}`).join(' && ')}, report the new state.`,
      { phase: 'Integrate', label: `fix:${attempts}`, model: 'opus', schema: VERIFY_SCHEMA }
    ),
    deadVerify(`Integrate fix ${attempts}`)
  )
  log(`Wave ${WAVE} fix ${attempts}: ${verify.green ? 'GREEN ✓' : verify.dead ? 'AGENT LOST — stopping the fix loop' : `${verify.failures.length} still failing`}`)
}

// ============ 5. PROMOTE — the gates become permanent regression armor ============
phase('Promote')
let promoted = false
if (verify.green) {
  const promote = await agent(
    `${RULES}\n\nPROMOTE wave ${WAVE} on ${BRANCH} in ${ROOT}:\n` +
      `1. Append ${PHASES.join(', ')} (one number per line) to gates/DONE.\n` +
      '2. Run "pnpm verify" and "pnpm e2e" again — the promoted gates now run inside them and must stay green.\n' +
      `3. Commit as "chore: promote wave ${WAVE} gates into verify".\n` +
      `4. Remove the worktrees (${PHASES.map((n) => `git worktree remove ${ROOT}/../hunt-p${n}`).join('; ')}) — keep the feature branches.\n` +
      'Report ok + detail.',
    { phase: 'Promote', model: 'opus', schema: OK_SCHEMA }
  )
  promoted = promote?.ok ?? false
}

// STOP. Human reviews wave-K and merges to main; the next wave is a new invocation.
return {
  wave: WAVE,
  phases: PHASES,
  green: verify.green,
  promoted,
  fixAttempts: attempts,
  remainingFailures: verify.green ? [] : verify.failures,
  branch: BRANCH,
  // Empty on a clean run. Non-empty means those agents never reported — retry
  // them; it is NOT the same signal as a failure they reported themselves.
  lostAgents,
  readyBranches,
  nextStep: verify.green
    ? `Human: review branch ${BRANCH}, merge to main, dogfood, then run {wave: ${WAVE + 1}}.`
    : (lostAgents.length ? `AGENTS LOST (${lostAgents.join(', ')}) — they returned nothing, so this is retryable rather than a code failure. ` : `RED after ${attempts} fix attempts. `) +
      `Committed work is safe on ${readyBranches.length ? readyBranches.join(', ') : 'no phase branch (nothing finished)'}${readyBranches.length ? ` — merge ${readyBranches.length > 1 ? 'them' : 'it'} into ${BRANCH} by hand (worktrees: ${PHASES.map((n) => `${ROOT}/../hunt-p${n}`).join(', ')}), then re-run pnpm verify && pnpm e2e && ${PHASES.map((n) => `pnpm gate ${n}`).join(' && ')}` : ''}. Human intervention needed on ${BRANCH}.`,
}
