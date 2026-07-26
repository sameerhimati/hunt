import { AppShell } from '@/components/app-shell'
import { Composer } from '@/components/outreach/composer'
import { OutreachQueue } from '@/components/outreach/outreach-queue'
import { outreachQueue, sequenceView } from '@/lib/outreach/queue'

export const dynamic = 'force-dynamic'

/**
 * The Outreach screen: queue column + composer, per `design/Outreach.dc.html`.
 *
 * This file is the composition and nothing else — `outreach-queue.tsx` and
 * `composer.tsx` are slots that later tasks replace wholesale, so the page
 * itself is frozen once written and two people building the queue and the
 * composer never touch the same file.
 *
 * Both columns own their internal scrolling: the wrappers here are `overflow-
 * hidden` full-height flex containers, so a slot that renders a sticky header
 * over a scrolling list (the queue's "Due today"/"Active" split) gets the
 * behaviour the mockup shows without reaching back into this file.
 */
export default async function OutreachPage({
  searchParams,
}: {
  // Next 16: searchParams is async.
  searchParams: Promise<{ contact?: string; application?: string }>
}) {
  const sp = await searchParams

  const [groups, sequence] = await Promise.all([
    outreachQueue(),
    sequenceView({ contactId: sp.contact, applicationId: sp.application }),
  ])

  // The queue highlights whoever the composer is actually showing — including
  // when nothing was asked for and `sequenceView` picked the most urgent.
  const selected = sequence?.contact?.id ?? sequence?.applicationId

  return (
    <AppShell title="Outreach">
      <div className="flex h-full min-h-0">
        <div className="flex w-[270px] min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
          <OutreachQueue groups={groups} selected={selected} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Composer sequence={sequence} />
        </div>
      </div>
    </AppShell>
  )
}
