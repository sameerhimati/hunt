import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 3 / Wave-2-foundation exit gate — fit rating is QUALITATIVE. Tiers with
// cited reasons, structurally incapable of carrying a fake percentage.
// RED until src/lib/fit/rate.ts exists.
import { rateFit } from '@/lib/fit/rate'
import { parseResumeContent } from '@/lib/resume/schema'
import { FakeLlmProvider } from '@/lib/llm'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))
const jdText = fs.readFileSync(path.join(FIXTURES, 'jobs/stripe-sbe.md'), 'utf8')

const llm = new FakeLlmProvider({
  responder: () =>
    JSON.stringify({
      tier: 'strong',
      reasons: [
        {
          text: 'Payments-ledger ownership matches the charge-path scope',
          citations: ['experience[0].bullets[0]'],
        },
        {
          text: 'No gRPC exposure — the JD lists it under nice-to-have',
          citations: [],
          gap: true,
        },
      ],
    }),
})

describe('fit rating', () => {
  it('returns a tier with reasons traced to the résumé', async () => {
    const content = parseResumeContent(alexChen)
    const rating = await rateFit({ content, job: { title: 'SBE', company: 'Stripe', jdText }, llm })

    expect(['strong', 'possible', 'reach']).toContain(rating.tier)
    expect(rating.reasons.length).toBeGreaterThan(0)
    expect(rating.reasons[0].citations).toContain('experience[0].bullets[0]')
  })

  it('carries no numeric score field anywhere in the payload — by construction', async () => {
    const content = parseResumeContent(alexChen)
    const rating = await rateFit({ content, job: { title: 'SBE', company: 'Stripe', jdText }, llm })

    const json = JSON.stringify(rating)
    expect(json).not.toMatch(/"(score|percentage|percent|grade)"\s*:/i)
  })

  it('rejects a model response with an out-of-vocabulary tier', async () => {
    const bad = new FakeLlmProvider({
      responder: () => JSON.stringify({ tier: '87%', reasons: [] }),
    })
    const content = parseResumeContent(alexChen)
    await expect(
      rateFit({ content, job: { title: 'SBE', company: 'Stripe', jdText }, llm: bad }),
    ).rejects.toThrow()
  })
})
