import { ResendAdapter } from './email/resend'
import { SmtpAdapter } from './email/smtp'
import { AdzunaAdapter } from './jobs/adzuna'
import { FreeBoardsAdapter } from './jobs/boards'
import { JSearchAdapter } from './jobs/jsearch'
import { ApolloAdapter } from './people/apollo'
import { FirecrawlAdapter } from './scrape/firecrawl'
import type { Adapter } from './types'

import { getProvider, settingKey } from '@/lib/providers/registry'
import { resolveSecret } from '@/lib/providers/status'
import { readSetting } from '@/lib/settings/store'
import { isTestMode } from '@/lib/testmode/env'

/**
 * Builds a live adapter from stored settings. Returns null when the provider
 * isn't configured (the caller shows a DegradedBanner) or when it's an LLM
 * provider — those live behind `resolveLlm()` and test via `listModels()`.
 */
export async function createAdapter(providerId: string): Promise<Adapter | null> {
  const meta = getProvider(providerId)
  if (!meta) return null

  // One branch, at the only place adapters are constructed: under
  // HUNT_TEST_MODE every call site below gets its fixture-backed twin instead,
  // so gates exercise production code paths with no keys and no network. The
  // import is lazy so the fixture reader never enters the production bundle.
  if (isTestMode()) {
    const { testAdapter } = await import('@/lib/testmode/adapters')
    return testAdapter(meta)
  }

  const secret = (field: string) => resolveSecret(meta, field)
  const plain = (field: string) => readSetting(settingKey(providerId, field))

  switch (providerId) {
    case 'firecrawl': {
      const apiKey = await secret('apiKey')
      return apiKey ? new FirecrawlAdapter(apiKey) : null
    }
    case 'apollo': {
      const apiKey = await secret('apiKey')
      return apiKey ? new ApolloAdapter(apiKey) : null
    }
    case 'jsearch': {
      const apiKey = await secret('apiKey')
      return apiKey ? new JSearchAdapter(apiKey) : null
    }
    case 'adzuna': {
      const [appId, appKey] = [await plain('appId'), await secret('appKey')]
      return appId && appKey ? new AdzunaAdapter(appId, appKey) : null
    }
    case 'free_boards':
      // Deliberately keyless — this is the works-before-any-key tier.
      return new FreeBoardsAdapter()
    case 'resend': {
      const apiKey = await secret('apiKey')
      return apiKey ? new ResendAdapter(apiKey) : null
    }
    case 'smtp': {
      const [host, port, user, password] = [
        await plain('host'),
        await plain('port'),
        await plain('user'),
        await secret('password'),
      ]
      if (!host || !user || !password) return null
      return new SmtpAdapter({ host, port: Number(port ?? 465), user, password })
    }
    default:
      return null
  }
}
