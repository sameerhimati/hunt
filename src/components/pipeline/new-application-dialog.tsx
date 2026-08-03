'use client'

import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { createManualJobAction, ingestJobAction } from '@/app/pipeline/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

/**
 * The two ways a job enters hunt: paste the link, or type it in.
 *
 * Manual entry is not a fallback bolted on for tests — it is the keyless floor
 * the product promises. Someone with no Firecrawl key and no model key can
 * still run their entire search here, so it sits beside the paste box as an
 * equal, not behind an "advanced" disclosure.
 *
 * The paste box is only *partly* key-gated, and the helper text has to say
 * which part: Ashby, Greenhouse and Lever postings come back as free structured
 * JSON straight from the board, and those are most of the links people paste.
 * Copy that implied every URL needed Firecrawl would send users to buy a key
 * they mostly do not need.
 */
export function NewApplicationDialog({
  variant = 'default',
  testId = 'new-application',
  label = 'New application',
}: {
  variant?: 'default' | 'secondary'
  /** The dashboard's empty state addresses this trigger as `empty-state-cta`. */
  testId?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('paste')
  const [url, setUrl] = useState('')
  const [manual, setManual] = useState({ title: '', company: '', location: '', jdText: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ingest = () => {
    setError(null)
    startTransition(async () => {
      // On success the action redirects and nothing after this line runs.
      const result = await ingestJobAction(url)
      if (result?.error) setError(result.error)
    })
  }

  const addManually = () => {
    setError(null)
    startTransition(async () => {
      const result = await createManualJobAction(manual)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid={testId} variant={variant} size="sm">
          <Plus size={15} aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>
            Paste the posting and hunt reads it, or type the two fields you always know.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="my-4">
          <TabsList>
            <TabsTrigger value="paste" data-testid="paste-url-tab">
              Paste a URL
            </TabsTrigger>
            <TabsTrigger value="manual" data-testid="manual-entry-tab">
              Enter manually
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-2 pt-3">
            <Label htmlFor="job-url">Job posting URL</Label>
            <Input
              id="job-url"
              data-testid="job-url-input"
              value={url}
              placeholder="https://jobs.example.com/…"
              autoComplete="off"
              onChange={(event) => setUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ashby, Greenhouse and Lever links are read straight from the board — no key needed.
              Anything else is scraped, which needs a Firecrawl key. Either way the full text is
              stored as written — it is the evidence tailoring cites later.
            </p>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="manual-title">Role</Label>
                <Input
                  id="manual-title"
                  data-testid="manual-title"
                  value={manual.title}
                  onChange={(event) => setManual({ ...manual, title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-company">Company</Label>
                <Input
                  id="manual-company"
                  data-testid="manual-company"
                  value={manual.company}
                  onChange={(event) => setManual({ ...manual, company: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-location">Location</Label>
              <Input
                id="manual-location"
                data-testid="manual-location"
                value={manual.location}
                onChange={(event) => setManual({ ...manual, location: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-jd">Job description</Label>
              <Textarea
                id="manual-jd"
                data-testid="manual-jd"
                rows={4}
                placeholder="Paste the description — tailoring and checks read it."
                value={manual.jdText}
                onChange={(event) => setManual({ ...manual, jdText: event.target.value })}
              />
            </div>
          </TabsContent>
        </Tabs>

        {error ? (
          <p
            data-testid="new-application-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {tab === 'paste' ? (
            <Button type="button" data-testid="ingest-job" disabled={pending} onClick={ingest}>
              {pending ? 'Reading the posting…' : 'Add from URL'}
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="create-manual-job"
              disabled={pending}
              onClick={addManually}
            >
              Add application
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
