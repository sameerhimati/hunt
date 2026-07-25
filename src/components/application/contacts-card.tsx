/**
 * Slot component — Phase 4 replaces this file with Apollo lookup + ContactCard.
 * Until then it names the key that would light it up rather than hiding the
 * feature, which is the degraded pattern the whole app uses (SCREENS §11).
 */
import Link from 'next/link'

export function ContactsCard() {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Contacts</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Nobody found yet. Add an Apollo key to search for the recruiter and hiring manager
        automatically, or add someone by hand.
      </p>
      <p className="mt-2 font-mono text-xs text-faint">
        Finding and adding contacts lands in Phase 4 ·{' '}
        <Link href="/settings" className="underline underline-offset-2 hover:text-muted-foreground">
          Settings
        </Link>
      </p>
    </section>
  )
}
