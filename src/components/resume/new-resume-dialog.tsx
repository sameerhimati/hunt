'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'

import { createResumeAction } from '@/app/resumes/actions'
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

/**
 * Start a résumé line. The name is the only thing asked for — everything else
 * is edited in the document itself, where it's visible.
 */
export function NewResumeDialog({ variant = 'default' }: { variant?: 'default' | 'secondary' }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-resume" variant={variant} size="sm">
          <Plus size={15} aria-hidden="true" />
          New résumé
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <form action={createResumeAction}>
          <DialogHeader>
            <DialogTitle>New résumé</DialogTitle>
            <DialogDescription>
              This becomes your base version. Tailored versions branch from it.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-2">
            <Label htmlFor="resume-name">Your name</Label>
            <Input
              id="resume-name"
              name="name"
              data-testid="resume-name-input"
              placeholder="Alex Chen"
              autoComplete="off"
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" data-testid="create-resume">
              Create résumé
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
