import Link from 'next/link'

import { draftResumeNotice } from '@/app/outreach/contact-actions'
import { ContactActions, ContactCard } from '@/components/application/contact-card'
import { createAdapter } from '@/lib/adapters/factory'
import { apolloMeta } from '@/lib/adapters/people/apollo'
import { listContacts } from '@/lib/contacts/store'

/**
 * Contacts on the application hub (`design/Application Detail.dc.html`): who you
 * found, where they came from, and the two ways to add more.
 *
 * A server component that fetches and lays out — every interaction lives in
 * `contact-card.tsx`. Two things it decides:
 *
 * **Manual add is never behind a key.** Someone running hunt with nothing
 * configured can still work this card end to end, which is why the actions row
 * renders identically whether or not Apollo answers.
 *
 * **The no-key state states the price.** With no Apollo key the card prints
 * Apollo's own `degradation` string — declared once in its provider meta, so
 * Settings, the docs and this card cannot drift into three different accounts
 * of what a key buys. It says what you lose and stops; it does not nag.
 */
export async function ContactsCard({ applicationId }: { applicationId: string }) {
  const [contacts, apollo] = await Promise.all([
    listContacts(applicationId),
    createAdapter('apollo'),
  ])
  const apolloReady = apollo !== null

  // Only worth the query when there is someone to draft to.
  const draftNotice =
    contacts.length > 0
      ? await draftResumeNotice(applicationId)
      : { pinned: false, resumeName: null, label: null }

  return (
    <section data-testid="contacts-card" className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Contacts</h2>
        <span className="font-mono text-[10px] text-faint">
          {apolloReady ? 'via Apollo' : 'added by hand'}
        </span>
      </header>

      {contacts.length === 0 ? (
        <p className="px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Nobody yet. Add the recruiter or hiring manager you already know about, or search the
          company for them.
        </p>
      ) : (
        <ul>
          {contacts.map((contact, index) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              applicationId={applicationId}
              draftNotice={draftNotice}
              // The first one opens: with a single contact there is nothing to
              // choose between, and its actions are why you came to this card.
              defaultOpen={index === 0}
            />
          ))}
        </ul>
      )}

      <ContactActions applicationId={applicationId} apolloReady={apolloReady} />

      {apolloReady ? null : (
        <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
          {apolloMeta.degradation}{' '}
          <Link href="/settings" className="underline underline-offset-2 hover:text-muted-foreground">
            Add a key
          </Link>
        </p>
      )}
    </section>
  )
}
