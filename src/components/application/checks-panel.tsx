/**
 * Slot component — Phase 3 replaces this file with the real checks panel.
 *
 * The placeholder still states the honesty rule, because the rule is the
 * feature: there is no aggregate ATS score here and there never will be, and
 * saying so before the checks exist is the point of the header.
 */
export function ChecksPanel() {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Checks</h2>
        <span className="font-mono text-xs text-faint">no fake ATS score — by design</span>
      </header>

      <div className="px-4 py-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Parse fidelity, keyword coverage, format lint and an AI-tell audit run against the
          résumé version pinned to this application. Each one reports a concrete count and a
          verdict — never a grade.
        </p>
        <p className="mt-2 font-mono text-xs text-faint">Running checks lands in Phase 3.</p>
      </div>
    </section>
  )
}
