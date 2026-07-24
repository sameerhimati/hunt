import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 8 exit gate — the give-it-to-a-friend packaging contract. The real
// proof is scripts/coldstart-{docker,npx}.sh at the wave gate; this pins what
// must be true of the repo for those to work. RED until P8 lands.

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

describe('npx hunt-app packaging', () => {
  it('declares the hunt-app bin and the launcher exists', () => {
    expect(pkg.bin?.['hunt-app']).toBeTruthy()
    expect(fs.existsSync(path.join(root, pkg.bin['hunt-app']))).toBe(true)
  })

  it('requires Node ≥22 so better-sqlite3 installs from prebuilds, not a compile', () => {
    expect(pkg.engines?.node).toMatch(/>=\s*22/)
  })

  it('ships cold-start proof scripts', () => {
    expect(fs.existsSync(path.join(root, 'scripts/coldstart-docker.sh'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'scripts/coldstart-npx.sh'))).toBe(true)
  })
})

describe('launch hygiene', () => {
  it('README leads with the honest-AI story and the quickstart', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
    expect(readme).toMatch(/npx hunt-app|docker compose up/)
    expect(readme.toLowerCase()).toContain('no fake ats score')
  })

  it('ships CONTRIBUTING and issue templates', () => {
    expect(fs.existsSync(path.join(root, 'CONTRIBUTING.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.github/ISSUE_TEMPLATE'))).toBe(true)
  })
})
