'use client'

import { Check, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { finishOnboarding, importResumeInOnboarding } from '@/app/onboarding/actions'
import { saveProvider, testProviderConnection } from '@/app/settings/actions'
import { ImportReview } from '@/components/resume/import-review'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProviderMeta } from '@/lib/providers/types'
import { cn } from '@/lib/utils'

/**
 * First run (SCREENS §1, `design/Onboarding.dc.html`).
 *
 * Four steps, and **every one of them is skippable**. That is not a courtesy;
 * it is the product's claim made operable. hunt has no accounts and no required
 * key — the résumé editor, the pipeline and public-board search all run on
 * nothing — so a wizard that refused to end until something was supplied would
 * be a login screen wearing a different hat. Finishing with everything skipped
 * is a completed first run.
 *
 * It coexists with the dashboard's empty states rather than replacing them
 * (`src/app/page.tsx`). This runs once, on a genuinely cold boot, and answers
 * "what is this and what do I give it?". Those run forever, and answer "what is
 * missing right now?" — a user who lands here with no résumé and skips the
 * import still gets pointed at one on every later visit. The dashboard's note
 * that it is deliberately not a wizard is about *the dashboard*, and stays true.
 */

/** What a row on the keys step needs. Meta supplies the copy; state is `null` when unset. */
export interface KeyRow {
  /** Addressed by the gate as `key-row-{slot}`. */
  slot: 'llm' | 'firecrawl' | 'apollo' | 'email'
  meta: ProviderMeta
  configured: boolean
  /** The field this row collects. Providers with several are configured in Settings. */
  fieldKey: string
  fieldLabel: string
  placeholder?: string
}

const STEPS = ['Welcome', 'Add your keys', 'Import résumé', 'Done'] as const

interface OnboardingWizardProps {
  rows: KeyRow[]
  hasModel: boolean
}

export function OnboardingWizard({ rows, hasModel }: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [imported, setImported] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const finish = () => {
    startTransition(async () => {
      await finishOnboarding()
      router.push('/')
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-2/40">
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="font-serif text-lg font-semibold tracking-tight">hunt</span>
        <span className="label-mono text-muted-foreground">
          running locally · nothing leaves this machine
        </span>
      </header>

      <div className="flex flex-1 items-start justify-center px-6 pb-16 pt-4">
        <div className="w-full max-w-[660px]">
          <Stepper current={step} />

          <div className="mt-5 rounded-xl border border-border bg-card p-6 shadow-sm">
            {step === 0 ? <Welcome onContinue={() => setStep(1)} /> : null}

            {step === 1 ? (
              <KeysStep rows={rows} onSkip={() => setStep(2)} onBack={() => setStep(0)} />
            ) : null}

            {step === 2 ? (
              <ImportStep
                hasModel={hasModel}
                imported={imported}
                onImported={(name) => {
                  setImported(name)
                  setStep(3)
                }}
                onSkip={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            ) : null}

            {step === 3 ? <DoneStep imported={imported} pending={pending} onFinish={finish} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup progress">
      {STEPS.map((title, index) => (
        <li key={title} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
              index < current
                ? 'bg-primary/15 text-primary'
                : index === current
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-faint',
            )}
          >
            {index < current ? <Check size={11} aria-hidden="true" /> : index + 1}
          </span>
          <span
            className={cn(
              'truncate text-xs',
              index === current ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {title}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div data-testid="onboarding-step-welcome">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">The whole job hunt, local</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Tailor your résumé to a posting with every edit traced back to something you actually
        wrote, track applications, and draft the outreach. It runs on your machine and{' '}
        <span className="text-foreground">nothing leaves it</span> except the API calls you set
        up yourself — there is no account to create and no server holding your search.
      </p>

      <div className="mt-6 flex justify-end">
        <Button type="button" data-testid="onboarding-continue" size="sm" onClick={onContinue}>
          Continue →
        </Button>
      </div>
    </div>
  )
}

function KeysStep({
  rows,
  onSkip,
  onBack,
}: {
  rows: KeyRow[]
  onSkip: () => void
  onBack: () => void
}) {
  return (
    <div data-testid="onboarding-step-keys">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Add your keys</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Every key is <span className="text-foreground">optional</span>. Add what you have; hunt
        works with whatever you give it and tells you exactly what each one unlocks. You can
        change these anytime in Settings.
      </p>

      <div className="mt-5 space-y-2">
        {rows.map((row) => (
          <KeyRowCard key={row.slot} row={row} />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" data-testid="onboarding-skip-keys" size="sm" onClick={onSkip}>
          Continue →
        </Button>
      </div>

      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Don&rsquo;t have any keys yet?{' '}
        <button
          type="button"
          data-testid="onboarding-continue-anyway"
          onClick={onSkip}
          className="text-foreground underline underline-offset-2"
        >
          Continue anyway
        </button>{' '}
        — hunt will show you what to add, when you need it.
      </p>
    </div>
  )
}

/**
 * One provider row. Saving and testing go through Settings' own actions, so a
 * key added here is a key added there — one definition of "configured", not two.
 *
 * The test is a button the user presses, not a check on blur. On blur reads
 * better in a spec than it behaves on a first run: it fires a live network call
 * on every paste, and a slow or failed one lands in the first minute a stranger
 * spends here, next to a key that saved perfectly well. Either way it is a
 * report, never a gate — Continue does not care what it said.
 */
function KeyRowCard({ row }: { row: KeyRow }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(row.configured)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  const save = async () => {
    if (!value.trim()) return
    setBusy('save')

    try {
      const form = new FormData()
      form.set(row.fieldKey, value)
      const result = await saveProvider(row.meta.id, form)

      setSaved(result.ok)
      setMessage({ ok: result.ok, text: result.message })
      if (result.ok) setValue('')
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const result = await testProviderConnection(row.meta.id)
      setMessage({ ok: result.ok, text: result.detail })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      data-testid={`key-row-${row.slot}`}
      data-configured={saved ? 'true' : 'false'}
      className="rounded-lg border border-border bg-surface-2/40 px-3 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium">{row.meta.name}</span>
        {row.slot === 'llm' ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
            the one to add
          </span>
        ) : null}
        {saved ? (
          <span className="font-mono text-[10px] text-primary">saved</span>
        ) : null}
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{row.meta.powers}</p>
      {/* What breaks if you skip it — the honest half, and the reason a row is safe to skip. */}
      <p className="mt-0.5 text-xs leading-relaxed text-faint">
        Skip it → {row.meta.degradation}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={value}
          aria-label={`${row.meta.name} ${row.fieldLabel}`}
          data-testid={`key-input-${row.slot}`}
          placeholder={row.placeholder ?? row.fieldLabel}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 min-w-0 flex-1 font-mono text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={!value.trim() || busy !== null}
          data-testid={`key-save-${row.slot}`}
          onClick={() => void save()}
        >
          {busy === 'save' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          Add
        </Button>
        {saved ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={busy !== null}
            data-testid={`key-test-${row.slot}`}
            onClick={() => void test()}
          >
            {busy === 'test' ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : null}
            Test
          </Button>
        ) : null}

        <a
          href={row.meta.getKeyUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
        >
          Get one
        </a>
      </div>

      {message ? (
        <p
          data-testid={`key-message-${row.slot}`}
          className={cn('mt-2 text-xs', message.ok ? 'text-primary' : 'text-destructive')}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}

function ImportStep({
  hasModel,
  imported,
  onImported,
  onSkip,
  onBack,
}: {
  hasModel: boolean
  imported: string | null
  onImported: (name: string) => void
  onSkip: () => void
  onBack: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div data-testid="onboarding-step-import">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Import your résumé</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Everything else here points at one — tailoring branches from it, and each application
        pins the exact version you sent.
      </p>

      <div className="-mx-2 mt-3">
        {/*
          The same review screen the résumé section uses, told not to navigate.
          Reusing it is the point: the parse, the amber confidence flags and the
          structured editor are the ones the user will meet again, so first run
          teaches the real screen rather than a simplified stand-in.
        */}
        <ImportReview
          hasModel={hasModel}
          fileInputTestId="resume-dropzone"
          onImported={(input) => {
            setSaving(true)
            setError(null)

            void importResumeInOnboarding({
              name: input.name,
              content: input.content,
              text: input.text,
              kind: input.kind,
            })
              .then(() => onImported(input.name))
              .catch(() =>
                setError(
                  'That résumé could not be saved. You can skip this and import it later from the Résumés screen.',
                ),
              )
              .finally(() => setSaving(false))
          }}
        />
      </div>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={saving}>
          ← Back
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="onboarding-skip-import"
          onClick={onSkip}
          disabled={saving}
        >
          {imported ? 'Continue →' : 'Skip for now →'}
        </Button>
      </div>
    </div>
  )
}

function DoneStep({
  imported,
  pending,
  onFinish,
}: {
  imported: string | null
  pending: boolean
  onFinish: () => void
}) {
  return (
    <div data-testid="onboarding-step-done">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">You&rsquo;re set up</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {imported
          ? `“${imported}” is in, structured and versioned. Paste a job posting next and the pipeline starts — tailor to it, track it, follow up.`
          : 'Nothing is set up yet, and that is a fine place to start. The dashboard will point at whatever is missing when you need it — beginning with a résumé.'}
      </p>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          data-testid="onboarding-finish"
          size="sm"
          disabled={pending}
          onClick={onFinish}
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
          Go to the dashboard →
        </Button>
      </div>
    </div>
  )
}
