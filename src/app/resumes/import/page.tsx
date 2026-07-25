import { AppShell } from '@/components/app-shell'
import { ImportReview } from '@/components/resume/import-review'

export const dynamic = 'force-dynamic'

export default function ImportResumePage() {
  return (
    <AppShell title="Import a résumé">
      <ImportReview />
    </AppShell>
  )
}
