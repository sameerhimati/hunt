'use client'

import { useState, useTransition } from 'react'

import { deleteResumeAction } from '@/app/resumes/actions'
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

/**
 * The one irreversible action in the résumé section, and the only place the
 * word "delete" is allowed to appear.
 *
 * It is offered *only* for a résumé no application points at — the caller
 * decides, from a live count. Deleting cascades every version and every stored
 * check, and would null `Application.resumeVersionId`; the confirm says exactly
 * what goes, and says plainly that nothing else is attached, because that is the
 * fact making this safe.
 */
export function DeleteResumeButton({
  resumeId,
  name,
  versionCount,
}: {
  resumeId: string
  name: string
  versionCount: number
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await deleteResumeAction(resumeId)
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
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="delete-resume" variant="ghost" size="sm">
          Delete permanently…
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Delete “{name}” for good?</DialogTitle>
          <DialogDescription>
            No application points at any version of this résumé, so nothing else loses its history.
            This removes the résumé, its {versionCount} version{versionCount === 1 ? '' : 's'}, and
            any checks stored against them. It can&rsquo;t be undone — archived is the reversible
            option.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p data-testid="delete-resume-error" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-5">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            data-testid="confirm-delete-resume"
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
