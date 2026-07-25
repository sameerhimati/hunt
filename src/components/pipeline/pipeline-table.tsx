import Link from 'next/link'

import { StatusBadge } from '@/components/pipeline/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { BoardCardRow } from '@/lib/pipeline/board'

/**
 * The same rows as the board, dense. For triaging forty applications, where a
 * kanban is a scrolling exercise and a table is a list you can scan.
 */
export function PipelineTable({ cards }: { cards: BoardCardRow[] }) {
  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fit</TableHead>
            <TableHead>Résumé</TableHead>
            <TableHead className="text-right">Last activity</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {cards.map((card) => (
            <TableRow key={card.id} data-testid="pipeline-row">
              <TableCell className="font-medium">
                <Link href={`/applications/${card.id}`} className="hover:text-primary">
                  {card.company}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{card.title}</TableCell>
              <TableCell>
                <StatusBadge status={card.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{card.fitTier ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {card.resumeLabel ?? 'not pinned'}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-faint">
                {card.daysInStage}d ago
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
