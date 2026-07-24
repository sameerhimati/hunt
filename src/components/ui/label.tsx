import * as React from 'react'

import { cn } from '@/lib/utils'

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('label-mono mb-1 block', className)} {...props} />
}
