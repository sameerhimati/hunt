import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Phase exit-gate runner. Gates live in gates/{unit,e2e}/phase-<N>/ and are
 * committed RED before their phase is built — they are the phase's contract.
 *
 *   node scripts/run-gates.mjs --phase 3     one phase's gates (the autoloop verifier; RED until built)
 *   node scripts/run-gates.mjs --done-unit   unit gates of every phase listed in gates/DONE (pnpm verify)
 *   node scripts/run-gates.mjs --done-e2e    e2e gates of every phase listed in gates/DONE (pnpm e2e)
 *
 * Promoting a finished phase = appending its number to gates/DONE. From then on
 * its gates run inside `pnpm verify` / `pnpm e2e` forever — regression armor.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function donePhases() {
  const file = path.join(root, 'gates', 'DONE')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(Number)
    .filter(Number.isInteger)
}

function existingDirs(kind, phases) {
  return phases
    .map((n) => path.join('gates', kind, `phase-${n}`))
    .filter((dir) => fs.existsSync(path.join(root, dir)))
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runUnit(dirs) {
  if (dirs.length === 0) return
  run('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.gates.config.mts', ...dirs])
}

function runE2e(dirs) {
  if (dirs.length === 0) return
  run('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.gates.config.ts', ...dirs])
}

const [mode, phaseArg] = process.argv.slice(2)

if (mode === '--phase') {
  const phase = Number(phaseArg)
  if (!Number.isInteger(phase)) {
    console.error('usage: run-gates.mjs --phase <N>')
    process.exit(2)
  }
  const unit = existingDirs('unit', [phase])
  const e2e = existingDirs('e2e', [phase])
  if (unit.length === 0 && e2e.length === 0) {
    console.error(`gate: no gates exist for phase ${phase} — a phase without a gate cannot be verified`)
    process.exit(1)
  }
  runUnit(unit)
  runE2e(e2e)
  console.log(`gate: phase ${phase} GREEN`)
} else if (mode === '--done-unit') {
  runUnit(existingDirs('unit', donePhases()))
} else if (mode === '--done-e2e') {
  runE2e(existingDirs('e2e', donePhases()))
} else {
  console.error('usage: run-gates.mjs --phase <N> | --done-unit | --done-e2e')
  process.exit(2)
}
