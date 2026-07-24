import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { HuntMark } from '@/components/hunt-mark'
import { buttonVariants } from '@/components/ui/button'
import { readAllProviderStates, summarise } from '@/lib/providers/status'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const summary = summarise(await readAllProviderStates())

  return (
    <AppShell title="Dashboard">
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <HuntMark size={32} className="mx-auto text-primary" />

          <h2 className="mt-5 font-serif text-2xl font-semibold">Nothing in your sights yet</h2>

          <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
            hunt runs entirely on this machine. Add the keys you want to use and nothing else
            leaves it — the pipeline, résumés, and outreach all land in the phases ahead.
          </p>

          <p className="mt-4 font-mono text-xs text-faint">
            {summary.configured} providers configured · {summary.missing} still to set up
          </p>

          <Link href="/settings" className={`${buttonVariants({ size: 'default' })} mt-5`}>
            Set up your keys
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
