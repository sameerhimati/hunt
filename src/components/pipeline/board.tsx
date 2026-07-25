'use client'

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { transitionApplicationAction } from '@/app/pipeline/actions'
import { StatusDot } from '@/components/pipeline/status-badge'
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@/lib/pipeline/statuses'
import { cn } from '@/lib/utils'

/**
 * The board — eight columns, drag to advance.
 *
 * Dragging is optimistic and reconciled against the server: the card moves the
 * instant you drop it, and if the write fails the card goes back where it was
 * and the failure is named. A board that silently keeps a move it didn't
 * persist would be worse than one that doesn't move at all.
 *
 * The status dropdown on the application detail page is the equal, keyboard-
 * reachable path to the same transition — drag is an accelerator, never the
 * only way through.
 */

export interface BoardCard {
  id: string
  status: ApplicationStatus
  company: string
  title: string
  location: string | null
  fitTier: string | null
  resumeLabel: string | null
  daysInStage: number
}

function initial(company: string): string {
  return company.trim().charAt(0).toUpperCase() || '?'
}

function Card({ card, dragging }: { card: BoardCard; dragging?: boolean }) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })

  return (
    <div
      ref={setNodeRef}
      data-testid="pipeline-card"
      onClick={() => router.push(`/applications/${card.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') router.push(`/applications/${card.id}`)
      }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'cursor-pointer rounded-md border border-border bg-card p-2.5 text-left transition-colors duration-150 hover:border-primary/50',
        (isDragging || dragging) && 'rotate-1 opacity-80 shadow-lg',
        card.status === 'rejected' && 'opacity-60',
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-[11px] text-muted-foreground">
          {initial(card.company)}
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-sm font-medium',
              card.status === 'rejected' && 'line-through',
            )}
          >
            {card.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">{card.company}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-faint">
          {card.resumeLabel ? `résumé ${card.resumeLabel}` : (card.fitTier ?? card.location ?? '—')}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-faint">{card.daysInStage}d</span>
      </div>
    </div>
  )
}

function Column({ status, cards }: { status: ApplicationStatus; cards: BoardCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${status}`}
      className={cn(
        'flex w-[248px] shrink-0 flex-col rounded-lg border border-border bg-surface-2/40 transition-colors duration-150',
        isOver && 'border-primary/60 bg-surface-2',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <StatusDot status={status} />
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="ml-auto font-mono text-xs text-faint">{cards.length}</span>
      </header>

      <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {cards.length === 0 ? (
          <p className="px-1 py-3 text-xs leading-relaxed text-faint">
            {status === 'offer' ? 'Nothing here yet. Go get one.' : 'Nothing here yet.'}
          </p>
        ) : (
          cards.map((card) => <Card key={card.id} card={card} />)
        )}
      </div>
    </div>
  )
}

export function PipelineBoard({ cards: initialCards }: { cards: BoardCard[] }) {
  const [cards, setCards] = useState(initialCards)
  const router = useRouter()
  const [, startTransition] = useTransition()

  // A small activation distance keeps a click on a card a click, not a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return

    const status = String(over.id) as ApplicationStatus
    const id = String(active.id)
    const moved = cards.find((card) => card.id === id)
    if (!moved || moved.status === status) return

    const previous = cards
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, status, daysInStage: 0 } : card)),
    )

    startTransition(async () => {
      const result = await transitionApplicationAction(id, status)
      if (result?.error) {
        setCards(previous)
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {APPLICATION_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            cards={cards.filter((card) => card.status === status)}
          />
        ))}
      </div>
    </DndContext>
  )
}
