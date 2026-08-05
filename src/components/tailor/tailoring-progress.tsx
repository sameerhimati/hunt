'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * What a tailoring run looks like while it is happening.
 *
 * It takes upwards of half a minute — one model call over the whole résumé and
 * the whole posting — and before this the screen showed three grey bars, which
 * say nothing about whether anything is happening or how long it might take.
 *
 * Two rules shaped what is here. **The elapsed count is real**, because it is
 * the one number hunt actually knows; there is no progress bar, because a
 * single call has no progress to report and a bar that fills on a timer is a
 * lie about work being done. And **the rotating lines are facts about the run,
 * not a narration of stages** — hunt cannot see inside the call, so claiming
 * "reading your experience… drafting bullets…" would be invented. Every line
 * below is true from the moment the button is pressed, and each one tells the
 * user something worth knowing about what they are about to review.
 */

const NOTES = [
  'Every proposed line has to name the path in your résumé it came from.',
  'Anything it can’t trace back to you is refused and shown, never quietly dropped.',
  'The refusal check is code that runs after the model, not an instruction inside the prompt.',
  'Nothing is rewritten and nothing is saved until you accept it.',
  'The paper you review is built by the same function that writes the saved version.',
  'You decide one change at a time — j and k to walk them, a to accept, r to reject.',
]

const ROTATE_MS = 5000

export function TailoringProgress({ company }: { company: string }) {
  const [elapsed, setElapsed] = useState(0)
  const [note, setNote] = useState(0)

  useEffect(() => {
    const tick = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    const rotate = setInterval(() => setNote((index) => (index + 1) % NOTES.length), ROTATE_MS)
    return () => {
      clearInterval(tick)
      clearInterval(rotate)
    }
  }, [])

  return (
    <div data-testid="tailoring-progress" className="mt-6">
      <div className="flex items-center gap-2">
        <Sparkles
          size={15}
          aria-hidden="true"
          className="shrink-0 text-primary motion-safe:animate-pulse"
        />
        {/*
          One status line, announced once. The rotating note below is decorative
          reading material — announcing every rotation would talk over the user.
        */}
        <p role="status" className="text-sm font-medium">
          Tailoring against {company}…
        </p>
        <span
          data-testid="tailoring-elapsed"
          className="ml-auto shrink-0 font-mono text-xs text-faint tabular-nums"
        >
          {elapsed}s
        </span>
      </div>

      <p
        key={note}
        aria-hidden="true"
        className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground motion-safe:animate-in motion-safe:fade-in"
      >
        {NOTES[note]}
      </p>

      <ul className="mt-4 flex flex-col gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-start gap-2.5">
            <Skeleton className="size-[18px] rounded-full" />
            <Skeleton className={cn('h-10 flex-1', row === 1 && 'h-14')} />
          </li>
        ))}
      </ul>
    </div>
  )
}
