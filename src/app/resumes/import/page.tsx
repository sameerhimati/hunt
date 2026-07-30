import { AppShell } from '@/components/app-shell'
import { ImportReview } from '@/components/resume/import-review'
import { resolveLlm } from '@/lib/llm'

export const dynamic = 'force-dynamic'

export default async function ImportResumePage() {
  // Resolved here only so the screen can be honest about how long to expect to
  // wait: reading the layout is instant, a model re-reading it is ~30 seconds.
  // Importing works either way, so this gates copy and nothing else.
  const hasModel = Boolean(await resolveLlm())

  return (
    <AppShell title="Import a résumé">
      <ImportReview hasModel={hasModel} />
    </AppShell>
  )
}
