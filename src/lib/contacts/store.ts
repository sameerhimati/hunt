/**
 * The contacts store — the humans attached to one application.
 *
 * Two rules live here rather than in the card that calls it:
 *
 * **Validation is at the boundary.** A contact arrives from three places (a
 * hand-typed form, an Apollo hit, a LinkedIn scrape in Phase 6) and only one of
 * them is a controlled shape. `source` is checked against the vocabulary in
 * `@/lib/db/enums` because SQLite has no enum type and would happily store
 * `"appolo"` — which then renders as a badge nobody can explain.
 *
 * **Saving the same person twice updates them.** The identity of a contact is
 * `(applicationId, lower(email))`: re-running the Apollo lookup after a reveal
 * credit lands must fill in the title, not stack a second Jordan Lee under the
 * first. Contacts without an email are not deduped — two unnamed-inbox humans
 * at the same company are genuinely two people, and guessing on name alone
 * would silently merge them.
 *
 * Server-only: it reads Prisma. The `ContactView` shape it returns is declared
 * in `@/lib/outreach/types`, which stays runtime-free so the card can import it
 * from the client.
 */

import { prisma } from '@/lib/db/client'
import { CONTACT_SOURCES, type ContactSource } from '@/lib/db/enums'
import type { ContactView } from '@/lib/outreach/types'

/**
 * The vocabulary guard. `@/lib/db/enums` exports the list but no predicate for
 * this column yet; membership *is* the check, so it is spelled out here rather
 * than reaching outside this module's file set to add one.
 */
function isContactSource(value: string): value is ContactSource {
  return (CONTACT_SOURCES as readonly string[]).includes(value)
}

/** Shape-only. Deliverability is the mail server's answer, not ours to guess. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface SaveContactInput {
  applicationId: string
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  linkedinUrl?: string | null
  source?: string
}

interface ContactRow {
  id: string
  name: string
  title: string | null
  company: string | null
  email: string | null
  linkedinUrl: string | null
  source: string
}

function toView(row: ContactRow): ContactView {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    company: row.company,
    email: row.email,
    linkedinUrl: row.linkedinUrl,
    source: row.source as ContactSource,
  }
}

/** Empty strings from an untouched form field are absence, not a value. */
function optional(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function listContacts(applicationId: string): Promise<ContactView[]> {
  const rows = await prisma.contact.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(toView)
}

export async function saveContact(input: SaveContactInput): Promise<ContactView> {
  const name = input.name?.trim()
  if (!name) throw new Error('A contact needs a name.')

  const email = optional(input.email)
  if (email && !EMAIL_SHAPE.test(email)) {
    throw new Error(`"${email}" does not look like an email address.`)
  }

  const source = input.source?.trim() || 'manual'
  if (!isContactSource(source)) {
    throw new Error(`Unknown contact source "${source}".`)
  }

  const data = {
    name,
    title: optional(input.title),
    company: optional(input.company),
    email,
    linkedinUrl: optional(input.linkedinUrl),
    source,
  }

  // Dedupe on (applicationId, lower(email)). Done in memory because SQLite's
  // case-insensitive matching depends on the column collation, and a contact
  // list is a handful of rows — a correct comparison beats a clever query.
  if (email) {
    const existing = await prisma.contact.findMany({ where: { applicationId: input.applicationId } })
    const match = existing.find((row) => row.email?.trim().toLowerCase() === email.toLowerCase())
    if (match) {
      // A second sighting fills gaps; it never blanks out what we already knew.
      const updated = await prisma.contact.update({
        where: { id: match.id },
        data: {
          name: data.name,
          title: data.title ?? match.title,
          company: data.company ?? match.company,
          email: data.email,
          linkedinUrl: data.linkedinUrl ?? match.linkedinUrl,
          source: data.source,
        },
      })
      return toView(updated)
    }
  }

  const created = await prisma.contact.create({
    data: { ...data, applicationId: input.applicationId },
  })
  return toView(created)
}

export async function deleteContact(id: string): Promise<void> {
  await prisma.contact.delete({ where: { id } })
}
