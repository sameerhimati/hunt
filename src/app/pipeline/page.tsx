import { Columns3 } from 'lucide-react'
import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { NewApplicationDialog } from '@/components/pipeline/new-application-dialog'
import { PipelineBoard } from '@/components/pipeline/board'
import { PipelineTable } from '@/components/pipeline/pipeline-table'
import { boardCards } from '@/lib/pipeline/board'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function ViewToggle({ view }: { view: 'board' | 'table' }) {
  return (
    <div className="flex items-center rounded-md bg-surface-2 p-0.5">
      {(['board', 'table'] as const).map((option) => (
        <Link
          key={option}
          href={option === 'board' ? '/pipeline' : '/pipeline?view=table'}
          data-testid={`view-${option}`}
          className={cn(
            'rounded px-2.5 py-1 text-xs capitalize transition-colors duration-150',
            view === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          {option}
        </Link>
      ))}
    </div>
  )
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  // Next 16: searchParams is async.
  const { view } = await searchParams
  const cards = await boardCards()
  const mode = view === 'table' ? 'table' : 'board'

  return (
    <AppShell
      title="Pipeline"
      action={
        <div className="flex items-center gap-3">
          <ViewToggle view={mode} />
          <NewApplicationDialog />
        </div>
      }
    >
      {cards.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Nothing in your sights yet"
          body="Use + New application above: paste a job posting and hunt reads it into a card, or type one in by hand. Everything after that hangs off this board."
        />
      ) : mode === 'table' ? (
        <PipelineTable cards={cards} />
      ) : (
        <PipelineBoard cards={cards} />
      )}
    </AppShell>
  )
}
