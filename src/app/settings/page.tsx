import { KeyProviderCard } from '@/components/settings/key-provider-card'
import { AppShell } from '@/components/app-shell'
import { CATEGORY_LABELS, PROVIDERS } from '@/lib/providers/registry'
import { readAllProviderStates, summarise } from '@/lib/providers/status'
import type { ProviderCategory } from '@/lib/providers/types'

// Keys live in SQLite, so this page must read on every request.
export const dynamic = 'force-dynamic'

const SECTIONS: ProviderCategory[] = ['llm', 'scrape', 'jobs', 'people', 'email', 'linkedin']

export default async function SettingsPage() {
  const states = await readAllProviderStates()
  const summary = summarise(states)

  return (
    <AppShell
      title="Providers &amp; keys"
      action={
        <span className="font-mono text-xs text-muted-foreground" data-testid="provider-summary">
          {summary.configured} configured · {summary.missing} missing
        </span>
      }
      aside={<SettingsNav />}
    >
      <div className="max-w-[820px] px-6 pb-10 pt-6">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Every integration is optional. hunt tells you exactly what each key unlocks and what
          stops working without it — nothing here nags you to fill it in.
        </p>

        {SECTIONS.map((category) => {
          const providers = PROVIDERS.filter((provider) => provider.category === category)
          if (providers.length === 0) return null

          return (
            <section key={category} className="mb-8" aria-labelledby={`section-${category}`}>
              <h2 id={`section-${category}`} className="label-mono mb-3">
                {CATEGORY_LABELS[category]}
              </h2>

              {providers.map((provider) => {
                const state = states.find((candidate) => candidate.id === provider.id)!
                return <KeyProviderCard key={provider.id} meta={provider} state={state} />
              })}
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}

function SettingsNav() {
  return (
    <div className="hidden w-[196px] shrink-0 border-r border-border bg-card px-3 py-5 lg:block">
      <p className="px-2 pb-4 font-serif text-lg font-semibold">Settings</p>

      <nav className="flex flex-col gap-0.5 text-sm" aria-label="Settings sections">
        {SECTIONS.map((category) => (
          <a
            key={category}
            href={`#section-${category}`}
            className="rounded-md px-2.5 py-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {CATEGORY_LABELS[category]}
          </a>
        ))}
      </nav>

      <p className="mt-5 rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
        Keys are encrypted at rest and never leave{' '}
        <span className="font-mono text-foreground">./data</span>. No telemetry.
      </p>
    </div>
  )
}
