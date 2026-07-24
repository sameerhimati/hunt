import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 3 exit gate — THE honesty invariant, enforced in code, not prompt-vibes.
// A JD demanding skills the résumé lacks must produce ZERO uncited claims in
// the applied output; refusals are SHOWN, never silently dropped, and never
// block saving. RED until src/lib/tailor/{engine,validator,apply}.ts exist.
import { runTailor } from '@/lib/tailor/engine'
import { validateChanges } from '@/lib/tailor/validator'
import { applyChanges } from '@/lib/tailor/apply'
import { parseResumeContent } from '@/lib/resume/schema'
import { FakeLlmProvider } from '@/lib/llm'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))
const script = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'llm/tailor-stripe.json'), 'utf8'))
const jdText = fs.readFileSync(path.join(FIXTURES, 'jobs/stripe-sbe.md'), 'utf8')

const job = { title: 'Senior Backend Engineer', company: 'Stripe', jdText }
const llm = new FakeLlmProvider({ responder: () => JSON.stringify(script.response) })

describe('fabrication validator', () => {
  it('refuses uncited and mis-cited claims, keeps the validly cited one', async () => {
    const content = parseResumeContent(alexChen)
    const run = await runTailor({ content, job, llm })

    // All three proposals are visible — refusals are surfaced, not dropped.
    expect(run.changes).toHaveLength(3)

    const proposed = run.changes.filter((c: { status: string }) => c.status === 'proposed')
    const refused = run.changes.filter((c: { status: string }) => c.status === 'refused')
    expect(proposed).toHaveLength(1)
    expect(refused).toHaveLength(2)

    // The survivor is the change whose citation resolves AND whose snippet
    // really appears in the source résumé.
    expect(proposed[0].citation?.path).toBe('experience[0].bullets[3]')

    // Refusals carry a reason the FabricationFlag can show.
    for (const change of refused) expect(change.refusedReason).toBeTruthy()
  })

  it('never lets refused text reach the applied content', async () => {
    const content = parseResumeContent(alexChen)
    const run = await runTailor({ content, job, llm })
    const accepted = run.changes.filter((c: { status: string }) => c.status === 'proposed')

    const applied = applyChanges(content, accepted)
    const flat = JSON.stringify(applied)

    expect(flat).toContain('Cut p99 latency from 210ms to 130ms')
    // The uncited fabrication and the mis-cited rewrite must not exist anywhere.
    expect(flat).not.toContain('12-person team')
    expect(flat).not.toContain('gRPC service meshes')
  })

  it('validateChanges preserves every entry (refusal is a status, not a deletion)', () => {
    const content = parseResumeContent(alexChen)
    const validated = validateChanges(script.response.changes, content)
    expect(validated).toHaveLength(script.response.changes.length)
  })

  it('citation snippets must appear in the cited source field', () => {
    const content = parseResumeContent(alexChen)
    const forged = [
      {
        kind: 'edit',
        path: 'experience[0].bullets[0]',
        now: 'anything',
        why: 'test',
        // Path resolves, but the snippet is not in that field — still a refusal.
        citation: { path: 'experience[0].bullets[0]', snippet: 'built a Mars rover' },
      },
    ]
    const [checked] = validateChanges(forged, content)
    expect(checked.status).toBe('refused')
  })
})
