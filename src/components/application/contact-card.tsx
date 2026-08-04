'use client'

import { Loader2, Plus, Search } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  deleteContactAction,
  draftOutreachAction,
  findContactsAction,
  saveContactAction,
  type DraftResumeNotice,
} from '@/app/outreach/contact-actions'
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
import type { PersonHit } from '@/lib/adapters/people/types'
import type { ContactView } from '@/lib/outreach/types'
import { cn } from '@/lib/utils'

/**
 * The humans, as the Contacts card draws them (`design/Application Detail.dc.html`
 * + SCREENS §9's ContactCard: name, title, company, source badge, email-found
 * state). A compact row that expands to its actions — the mockup's list stays
 * scannable when there are four people at one company, and the row you opened
 * is the one you are about to write to.
 *
 * Every interactive part of the card lives in this file: the row, the manual-add
 * dialog and the Apollo lookup. They share the same three server actions and the
 * same error surface, and keeping them together means the card itself
 * (`contacts-card.tsx`) stays a server component that only fetches and lays out.
 */

/** Two initials, the way the mockup's avatar circle reads. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Where this person came from. Named plainly — an Apollo hit is not a guess. */
function SourceBadge({ source }: { source: string }) {
  const label = source === 'brightdata' ? 'bright data' : source
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] lowercase text-muted-foreground">
      {label}
    </span>
  )
}

/**
 * Identity of a lookup hit, matching how the store dedupes: the address when
 * there is one. Two people with the same name at one company are two people.
 */
function hitKey(hit: PersonHit): string {
  return `${hit.name}:${hit.email ?? hit.linkedinUrl ?? ''}`
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
      {children}
    </p>
  )
}

/** One sentence naming the résumé a draft would cite. Never left implicit. */
function draftNoteText(notice: DraftResumeNotice): string {
  if (!notice.resumeName || !notice.label) {
    return 'No résumé yet — the draft will be a template you fill in.'
  }
  const version = `${notice.resumeName} · ${notice.label}`
  return notice.pinned
    ? `Cites ${version}, the version pinned here.`
    : `Nothing pinned — the draft cites ${version}, your most recent résumé.`
}

export function ContactCard({
  contact,
  applicationId,
  draftNotice,
  defaultOpen = false,
}: {
  contact: ContactView
  applicationId: string
  draftNotice: DraftResumeNotice
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [error, setError] = useState<string | null>(null)
  // One transition per action, each gating only its own control — the wave-2
  // convention (docs/reviews/wave-2.md §3), which this card had not adopted.
  // Sharing one flag meant Remove went dead while Draft was in flight, and a
  // click on a disabled button is discarded rather than queued: no handler, no
  // error, nothing. `ContactActions` below splits its two for the same reason.
  const [drafting, startDrafting] = useTransition()
  const [removing, startRemoving] = useTransition()

  const draft = () => {
    setError(null)
    startDrafting(async () => {
      // On success the action redirects into the composer and nothing below runs.
      const result = await draftOutreachAction(applicationId, contact.id)
      if (result?.error) setError(result.error)
    })
  }

  const remove = () => {
    setError(null)
    startRemoving(async () => {
      const result = await deleteContactAction(contact.id)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <li data-testid="contact-card" className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
          {initials(contact.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{contact.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[contact.title, contact.company].filter(Boolean).join(' · ') || 'No title recorded'}
          </span>
        </span>

        <span
          className={cn(
            'shrink-0 font-mono text-[10px]',
            contact.email ? 'text-diff-add' : 'text-faint',
          )}
        >
          {contact.email ? '✉ found' : 'no email'}
        </span>
      </button>

      {open ? (
        <div className="space-y-2.5 px-4 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={contact.source} />
            {contact.email ? (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {contact.email}
              </span>
            ) : null}
            {contact.linkedinUrl ? (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] underline underline-offset-2 hover:text-muted-foreground"
              >
                LinkedIn ↗
              </a>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2" aria-busy={drafting || removing || undefined}>
            <Button
              type="button"
              size="sm"
              data-testid="draft-outreach"
              disabled={drafting}
              aria-busy={drafting || undefined}
              onClick={draft}
            >
              {drafting ? 'Writing…' : 'Draft outreach'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="delete-contact"
              disabled={removing}
              aria-busy={removing || undefined}
              onClick={remove}
            >
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-faint">
            {draftNoteText(draftNotice)}
          </p>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Adding someone by hand is the keyless floor, not a fallback: with no Apollo
 * key at all this dialog is the whole contacts feature, and it works. Name is
 * the only required field — you often have a name before you have an address.
 */
function AddContactDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', email: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveContactAction({ applicationId, ...form })
      if (result?.error) {
        setError(result.error)
        return
      }
      setForm({ name: '', title: '', email: '' })
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
        <Button type="button" size="sm" variant="outline" data-testid="add-contact-manual">
          <Plus size={14} aria-hidden="true" />
          Add manually
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>
            The recruiter or hiring manager you already know about. Works with no keys configured.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              data-testid="contact-name"
              autoComplete="off"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-title">Title</Label>
            <Input
              id="contact-title"
              data-testid="contact-title"
              autoComplete="off"
              placeholder="Optional"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              data-testid="contact-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Without an address you can still draft the message and send it yourself.
            </p>
          </div>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <DialogFooter>
          <Button type="button" data-testid="save-contact" disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The card's action row — the two ways a human gets onto an application —
 * plus whatever the Apollo lookup came back with.
 *
 * The Find button is here whether or not Apollo is configured. Keyless it
 * answers with Apollo's own degradation line, which the card has already
 * printed once (`apolloReady === false`), so this only renders a reason when
 * it is news: a rate limit, a 402, a company with no name to search on. A
 * feature you cannot see is worse than one you are told the price of, and
 * nobody needs to be told twice.
 */
export function ContactActions({
  applicationId,
  apolloReady,
}: {
  applicationId: string
  apolloReady: boolean
}) {
  const [hits, setHits] = useState<PersonHit[] | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // Two transitions, not one. `isPending` for an async transition does not fall
  // back to false in the commit that paints the awaited state — React only
  // settles it once the action's promise has resolved, a tick later. Share one
  // flag between the lookup and the save and the hits arrive with every Save
  // button still disabled: the list is on screen, looks ready, and swallows the
  // click (React drops events on a disabled button). On a busy main thread that
  // window is long enough for a real person to land a click in it and get
  // nothing back. The lookup gates its own button; saving gates its own.
  const [finding, startFinding] = useTransition()
  const [saving, startSaving] = useTransition()

  const find = () => {
    setError(null)
    startFinding(async () => {
      const result = await findContactsAction(applicationId)
      setHits(result.hits)
      setReason(result.reason)
      setError(result.error ?? null)
    })
  }

  const keep = (hit: PersonHit) => {
    setError(null)
    // Which hit is in flight, so the button that was clicked is the one that
    // says so. `saving` alone cannot tell them apart, and on a cold app this
    // wait is seconds of route compilation rather than the 40ms it costs warm.
    setSavingKey(hitKey(hit))
    startSaving(async () => {
      const key = hitKey(hit)
      const result = await saveContactAction({
        applicationId,
        name: hit.name,
        title: hit.title,
        company: hit.company,
        email: hit.email,
        linkedinUrl: hit.linkedinUrl,
        source: hit.source,
      })
      setSavingKey(null)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved((current) => [...current, key])
    })
  }

  return (
    <div className="space-y-2.5 border-t border-border p-3">
      <div className="flex flex-wrap gap-2">
        <AddContactDialog applicationId={applicationId} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="find-contacts"
          disabled={finding}
          onClick={find}
        >
          {finding ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Search size={14} aria-hidden="true" />
          )}
          Find contacts
        </Button>
      </div>

      {hits && hits.length > 0 ? (
        <ul data-testid="contact-hits" className="space-y-1.5" aria-busy={saving || undefined}>
          {hits.map((hit) => (
            <li
              key={hitKey(hit)}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{hit.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {[hit.title, hit.email ?? 'no email found'].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="save-found-contact"
                disabled={saving || saved.includes(hitKey(hit))}
                aria-busy={savingKey === hitKey(hit) || undefined}
                onClick={() => keep(hit)}
              >
                {saved.includes(hitKey(hit))
                  ? 'Saved'
                  : savingKey === hitKey(hit)
                    ? 'Saving…'
                    : 'Save'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {reason && apolloReady ? (
        <p
          data-testid="find-contacts-reason"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {reason}
        </p>
      ) : null}

      {apolloReady && hits && hits.length === 0 && !reason ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nobody came back for this company. Add the person by hand if you know who to write to.
        </p>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  )
}
