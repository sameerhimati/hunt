import { ResendAdapter } from './email/resend'
import { SmtpAdapter } from './email/smtp'
import { AdzunaAdapter } from './jobs/adzuna'
import { FreeBoardsAdapter } from './jobs/boards'
import { JSearchAdapter } from './jobs/jsearch'
import { LinkedInCookieAdapter } from './linkedin/cookie'
import { ApolloAdapter } from './people/apollo'
import { BrightDataPeopleAdapter } from './people/brightdata'
import { BrightDataScrapeAdapter } from './scrape/brightdata'
import { FirecrawlAdapter } from './scrape/firecrawl'
import type { Adapter } from './types'

import { getProvider, settingKey } from '@/lib/providers/registry'
import { resolveSecret } from '@/lib/providers/status'
import { readSetting } from '@/lib/settings/store'

/**
 * Builds a live adapter from stored settings. Returns null when the provider
 * isn't configured (the caller shows a DegradedBanner) or when it's an LLM
 * provider — those live behind `resolveLlm()` and test via `listModels()`.
 */
export async function createAdapter(providerId: string): Promise<Adapter | null> {
  const meta = getProvider(providerId)
  if (!meta) return null

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
    case 'brightdata_scrape':
      return new BrightDataScrapeAdapter()
    case 'brightdata_people':
      return new BrightDataPeopleAdapter()
    case 'linkedin':
      return new LinkedInCookieAdapter()
    default:
      return null
  }
}
