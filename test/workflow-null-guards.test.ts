import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The Workflow runtime returns `null` from `agent()` (and `workflow()`) when a
 * subagent dies on a terminal API error after retries, or when the operator
 * skips it. On the real Wave 2 run that happened at the integrate stage: the
 * script threw on `verify.green`, died before merging, and three finished phase
 * worktrees were left orphaned for a human to recover by hand.
 *
 * These tests drive both orchestration scripts with a dead agent and assert the
 * script still reaches its `return` with an actionable, non-green result.
 */

const ORCHESTRATE = '.claude/workflows/orchestrate-phases.workflow.js'
const PHASE_BUILD = '.claude/workflows/hunt-phase-build.js'

type AgentOpts = { phase?: string; label?: string; model?: string; schema?: unknown }
type Result = Record<string, unknown>

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...names: string[]
) => (...args: unknown[]) => Promise<Result>

type Runtime = {
  agent: (prompt: string, opts?: AgentOpts) => Promise<unknown>
  workflow?: (name: string, args?: unknown) => Promise<unknown>
  log?: (line: string) => void
  args: unknown
}

/**
 * Run a workflow script's source in a sandbox.
 *
 * The scripts are ES modules with a top-level `export`, top-level `await` AND a
 * top-level `return` — a dynamic `import()` rejects the last two outright. The
 * runtime evaluates them as an async function body with its API injected as
 * locals, so the test does the same: drop the single `export` keyword and
 * compile the rest with `new AsyncFunction`. That is both simpler than
 * `node:vm` (which would still need the identical wrapper to legalise the
 * top-level `return`) and closer to how the scripts actually execute.
 */
async function runWorkflow(relPath: string, runtime: Runtime): Promise<Result> {
  const src = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8')
  const body = src.replace(/^export const meta =/m, 'const meta =')
  const fn = new AsyncFunction(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'workflow',
    'args',
    'budget',
    body
  )
  return fn(
    runtime.agent,
    async (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((t) => t())),
    async (thunks: Array<() => Promise<unknown>>) => Promise.all(thunks.map((t) => t())),
    () => {},
    runtime.log ?? (() => {}),
    runtime.workflow ?? (async () => ({ green: true })),
    runtime.args,
    { spent: 0 }
  )
}

/** Stub `agent()`, keyed by the `phase` option each call passes. */
function stubAgent(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
  seen: string[],
  logs: string[]
) {
  return async (_prompt: string, opts: AgentOpts = {}) => {
    const key = opts.phase ?? 'unknown'
    seen.push(opts.label ? `${key}:${opts.label}` : key)
    // hasOwnProperty, not `??` — `null` is the override we care most about.
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key]
    void logs
    return defaults[key]
  }
}

// ---------------------------------------------------------------- wave build

const WAVE_DEFAULTS: Record<string, unknown> = {
  Preflight: { ok: true, detail: 'main clean, verify green' },
  Foundation: { done: true },
  Phases: { ok: true, detail: 'committed' },
  Integrate: { green: true, failures: [] },
  Promote: { ok: true, detail: 'gates promoted' },
}

async function runWave(overrides: Record<string, unknown> = {}) {
  const seen: string[] = []
  const logs: string[] = []
  const result = await runWorkflow(ORCHESTRATE, {
    agent: stubAgent(WAVE_DEFAULTS, overrides, seen, logs),
    workflow: async (_name, wargs) => ({
      phase: (wargs as { phase: number }).phase,
      green: true,
      remainingFailures: [],
    }),
    log: (line: string) => logs.push(line),
    args: { wave: 2 },
  })
  return { result, seen, logs }
}

describe('orchestrate-phases workflow: a dead agent must not kill the wave', () => {
  it('returns green on the happy path, so the guards do not mask real success', async () => {
    const { result } = await runWave()
    expect(result.green).toBe(true)
    expect(result.promoted).toBe(true)
    expect(result.lostAgents).toEqual([])
    expect(String(result.nextStep)).toContain('wave-2')
  })

  it('degrades to a non-green result naming the branches to merge when integrate dies', async () => {
    const { result, logs } = await runWave({ Integrate: null })

    expect(result.green).toBe(false)
    // The whole point: the operator is told which finished branches are sitting
    // unmerged, instead of discovering three orphaned worktrees by hand.
    const nextStep = String(result.nextStep)
    for (const branch of ['feature/phase-3', 'feature/phase-4', 'feature/phase-5']) {
      expect(nextStep).toContain(branch)
    }
    // "the agent died" is retryable; the operator must be able to tell.
    expect(result.lostAgents).toContain('Integrate')
    expect(logs.join('\n')).toMatch(/lost/i)
  })

  it('distinguishes a dead agent from an agent that ran and reported failure', async () => {
    const { result } = await runWave({
      Integrate: { green: false, failures: [{ where: 'pnpm gate 4', message: 'red' }] },
    })

    expect(result.green).toBe(false)
    expect(result.lostAgents).toEqual([])
    expect(JSON.stringify(result.remainingFailures)).toContain('pnpm gate 4')
    expect(String(result.nextStep)).toContain('feature/phase-3')
  })

  it('aborts cleanly with a reported reason when preflight dies', async () => {
    const { result } = await runWave({ Preflight: null })

    expect(result.aborted).toBe('preflight')
    expect(result.lostAgents).toContain('Preflight')
    expect(String(result.detail)).toMatch(/no result|died|skipped/i)
  })

  it('counts a phase whose child workflow died as not-green', async () => {
    const seen: string[] = []
    const logs: string[] = []
    const result = await runWorkflow(ORCHESTRATE, {
      agent: stubAgent(WAVE_DEFAULTS, {}, seen, logs),
      workflow: async (_name, wargs) =>
        (wargs as { phase: number }).phase === 4 ? null : { green: true },
      log: (line: string) => logs.push(line),
      args: { wave: 2 },
    })

    expect(result.lostAgents).toContain('Phases:p4')
    // Phase 4 produced nothing, so it must not be advertised as ready to merge.
    expect(result.readyBranches).toEqual(['feature/phase-3', 'feature/phase-5'])
  })
})

// --------------------------------------------------------------- phase build

const PHASE_DEFAULTS: Record<string, unknown> = {
  Plan: {
    tasks: [
      { id: 'f1', title: 'shell', kind: 'foundation', files: ['a.ts'] },
      { id: 'l1', title: 'leaf', kind: 'leaf', files: ['b.ts'] },
    ],
  },
  Foundation: { done: true },
  Build: { done: true },
  Integrate: { green: true, failures: [] },
  Autoloop: { green: true, failures: [] },
  Review: { blocking: [], commitMessage: 'feat: thing', designFidelity: 'faithful' },
}

async function runPhase(overrides: Record<string, unknown> = {}) {
  const seen: string[] = []
  const logs: string[] = []
  const result = await runWorkflow(PHASE_BUILD, {
    agent: stubAgent(PHASE_DEFAULTS, overrides, seen, logs),
    log: (line: string) => logs.push(line),
    args: { phase: 4, dir: '/tmp/hunt-p4' },
  })
  return { result, seen, logs }
}

describe('hunt-phase-build workflow: a dead agent must not kill the phase', () => {
  it('returns green on the happy path', async () => {
    const { result } = await runPhase()
    expect(result.green).toBe(true)
    expect(result.lostAgents).toEqual([])
    expect(result.suggestedCommit).toBe('feat: thing')
  })

  it('aborts cleanly when the planner dies', async () => {
    const { result } = await runPhase({ Plan: null })
    expect(result.green).toBe(false)
    expect(result.aborted).toBe('plan')
    expect(result.lostAgents).toContain('Plan')
  })

  it('degrades to non-green when the integrate agent dies', async () => {
    const { result } = await runPhase({ Integrate: null })
    expect(result.green).toBe(false)
    expect(result.lostAgents).toContain('Integrate')
    expect(String(result.nextStep)).toContain('/tmp/hunt-p4')
  })

  it('still returns a result when the reviewer dies', async () => {
    const { result } = await runPhase({ Review: null })
    expect(result.green).toBe(true)
    expect(result.lostAgents).toContain('Review')
    expect(result.blockingIssues).toEqual([])
  })
})
