'use client'

import { Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'

import { updateJobAction } from '@/app/applications/[id]/job-actions'
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
import { Textarea } from '@/components/ui/textarea'

/**
 * Correcting the posting after it is saved.
 *
 * hunt could only ever *create* a job, so whatever the form held at import time
 * was final: a location left blank stayed blank, and a title the keyless reader
 * guessed wrong stayed wrong — while being quoted back in cover letters and
 * outreach. This is the missing half, and it is deliberately the same four
 * fields the manual tab offers, in the same order, so there is one shape for
 * "what hunt knows about this job" rather than two.
 *
 * The description is edited here rather than in place because it is long and
 * because changing it is rare and consequential — it is the evidence tailoring
 * and the checks cite, so it belongs behind an explicit save, next to the
 * fields that describe it, not behind a click on a paragraph.
 */

interface EditPostingProps {
  applicationId: string
  job: { id: string; title: string; company: string; location: string | null; jdText: string | null }
}

export function EditPosting({ applicationId, job }: EditPostingProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [draft, setDraft] = useState({
    title: job.title,
    company: job.company,
    location: job.location ?? '',
    jdText: job.jdText ?? '',
  })

  /** Reopening after a cancel should show what is saved, not the abandoned edit. */
  const reset = () => {
    setDraft({
      title: job.title,
      company: job.company,
      location: job.location ?? '',
      jdText: job.jdText ?? '',
    })
    setError(null)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateJobAction(applicationId, job.id, draft)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid="edit-posting">
          <Pencil size={14} aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit posting</DialogTitle>
          <DialogDescription>
            What hunt knows about this job. The description is what tailoring and the checks cite.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Role</Label>
              <Input
                id="edit-title"
                data-testid="edit-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-company">Company</Label>
              <Input
                id="edit-company"
                data-testid="edit-company"
                value={draft.company}
                onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              data-testid="edit-location"
              value={draft.location}
              placeholder="Remote, or a city"
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-jd">Description</Label>
            <Textarea
              id="edit-jd"
              data-testid="edit-jd"
              rows={6}
              // Same cap as the manual tab: `field-sizing-content` would grow
              // this to the height of a whole job description.
              className="max-h-64"
              placeholder="Paste the posting."
              value={draft.jdText}
              onChange={(event) => setDraft({ ...draft, jdText: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Stored exactly as you paste it. Rewriting this changes what every future tailoring run
              and check reads — versions you already saved keep the text they were built from.
            </p>
          </div>
        </div>

        {error ? (
          <p
            data-testid="edit-posting-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" data-testid="save-posting" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save posting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
