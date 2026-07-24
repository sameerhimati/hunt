import type { ProviderStatus } from '@/lib/providers/types'
import { cn } from '@/lib/utils'

const COPY: Record<ProviderStatus, { label: string; text: string; dot: string }> = {
  configured: { label: 'Configured', text: 'text-pass', dot: 'bg-pass' },
  missing: { label: 'Missing', text: 'text-warn', dot: 'bg-warn' },
  'not-set': { label: 'Not set', text: 'text-faint', dot: 'border-[1.5px] border-faint' },
  error: { label: 'Error', text: 'text-destructive', dot: 'bg-destructive' },
}

export function StatusPill({ status }: { status: ProviderStatus }) {
  const { label, text, dot } = COPY[status]

  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 text-sm', text)}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
