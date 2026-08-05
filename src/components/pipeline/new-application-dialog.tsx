'use client'

import { Plus } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

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
import { readPosting, type PostingFields } from '@/lib/jobs/read-posting'

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
 *
 * **The description leads manual entry, and the fields follow from it.** It used
 * to come last, in a four-row box under Role, Company and Location — so a posting
 * hunt cannot fetch (Work at a Startup and Workday are behind a login; a mailed
 * description has no URL at all) meant retyping two fields the pasted text
 * already states. Now the paste box is the first thing in the tab, `readPosting`
 * fills what it can read underneath it, and the inputs stay exactly as they were:
 * still editable, still the fallback when nothing is parseable, still the only
 * things `createManualJob` requires. Nothing is written until the user submits,
 * which is what makes prefilling safe — see the note in `read-posting.ts` on why
 * an empty field beats a confident wrong one.
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
  /** What the last read filled in, so a correction survives the next paste. */
  const filled = useRef<PostingFields>({ title: null, company: null, location: null })

  /**
   * Re-reads on every keystroke because paste *is* a change event and there is no
   * cheaper signal for it. `readPosting` is a handful of regexes over the first
   * twenty lines, so this costs nothing worth measuring.
   */
  const pastePosting = (jdText: string) => {
    const read = readPosting(jdText)
    setManual((current) => {
      const next = { ...current, jdText }
      for (const field of ['title', 'company', 'location'] as const) {
        // Anything the user typed stands. Anything hunt filled is hunt's to replace.
        if (current[field] && current[field] !== (filled.current[field] ?? '')) continue
        next[field] = read[field] ?? ''
      }
      filled.current = read
      return next
    })
  }

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
            <div className="space-y-2">
              <Label htmlFor="manual-jd">Paste the posting</Label>
              <Textarea
                id="manual-jd"
                data-testid="manual-jd"
                rows={6}
                // `field-sizing-content` ignores rows and grows to fit, which a
                // whole job description turns into thousands of pixels. Cap it and
                // let the box scroll: what you paste here you paste and glance at,
                // and the full text is kept verbatim regardless of what's visible.
                className="max-h-64"
                placeholder="Paste the whole description — for a posting behind a login, or anywhere hunt cannot reach."
                value={manual.jdText}
                onChange={(event) => pastePosting(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored exactly as you paste it — it is the evidence tailoring and the checks cite
                later. hunt reads the role, company and location out of it below; correct anything
                it got wrong, and type anything it left blank.
              </p>
            </div>

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
