import Link from 'next/link'

import type { FunnelStats } from '@/lib/pipeline/stats'

/**
 * The funnel row: five real counts and the conversion between them.
 *
 * Every number here is `SELECT count(*)` over rows the user created. When a
 * stage has nothing to divide by, the conversion reads "—" rather than 0% —
 * "no data yet" and "nobody replied" are different facts and the dashboard is
 * not allowed to confuse them.
 */
export function FunnelRow({ stats }: { stats: FunnelStats }) {
  const conversionTo = new Map(stats.conversions.map((step) => [step.to, step]))

  return (
    <div data-testid="funnel-stats" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.reached.map((stage) => {
        const step = conversionTo.get(stage.label)
        const next = stats.conversions.find((entry) => entry.from === stage.label)

        return (
          <Link
            key={stage.label}
            href="/pipeline"
            data-testid="funnel-stat"
            className="rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/50"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{stage.label}</p>
            <p className="mt-1 font-serif text-3xl font-semibold tabular-nums">{stage.count}</p>

            <p className="mt-1 font-mono text-xs text-faint">
              {next ? (
                next.rate === null ? (
                  <>— → {next.to.toLowerCase()}</>
                ) : (
                  <>
                    {Math.round(next.rate * 100)}% → {next.to.toLowerCase()}
                  </>
                )
              ) : stage.count === 0 ? (
                'keep hunting'
              ) : (
                'the good end'
              )}
            </p>

            {step ? (
              <span className="sr-only">
                {step.count} of {stats.reached.find((entry) => entry.label === step.from)?.count} from{' '}
                {step.from}
              </span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}
