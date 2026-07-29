'use client'

import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  clearProvider,
  discoverModels,
  saveProvider,
  testProviderConnection,
  type SaveResult,
} from '@/app/settings/actions'
import { StatusPill } from '@/components/settings/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConnectionTestResult } from '@/lib/adapters/types'
import {
  envFallbackFor,
  listFieldLabels,
  missingRequiredFields,
} from '@/lib/providers/fields'
import type { ProviderField, ProviderMeta } from '@/lib/providers/types'
import type { ProviderState } from '@/lib/providers/status'
import { cn } from '@/lib/utils'

interface KeyProviderCardProps {
  meta: ProviderMeta
  state: ProviderState
}

export function KeyProviderCard({ meta, state }: KeyProviderCardProps) {
  // Only genuinely broken providers start open. On a fresh install everything is
  // unset, and expanding all twelve cards buries the one thing this screen is
  // good at: showing the whole BYOK inventory at a glance.
  const [open, setOpen] = useState(state.status === 'missing' || state.status === 'error')
  // The outcome, not just its text: a save that reported failure must not be
  // rendered in the same neutral grey as "Anthropic saved."
  const [message, setMessage] = useState<SaveResult | null>(null)
  const [test, setTest] = useState<ConnectionTestResult | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const fieldState = (key: string) => state.fields.find((field) => field.key === key)

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveProvider(meta.id, formData)
      setMessage(result)
      setTest(null)
    })
  }

  function onTest() {
    startTransition(async () => {
      setTest(await testProviderConnection(meta.id))
    })
  }

  function onDiscoverModels() {
    startTransition(async () => {
      try {
        setModels((await discoverModels(meta.id)).map((model) => model.id))
        setMessage(null)
      } catch (error) {
        setMessage({
          ok: false,
          message: error instanceof Error ? error.message : 'Could not fetch models.',
        })
      }
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await clearProvider(meta.id)
      setMessage(result)
      setTest(null)
    })
  }

  const needsAttention = state.status === 'missing' || state.status === 'error'
  const missing = missingRequiredFields(meta, state.fields)
  const missingKeys = new Set(missing.map((field) => field.key))
  // Anything the user actually saved is removable, working or not. Gating this on
  // `configured` left a half-filled provider with no escape but editing the DB.
  const hasStored = state.fields.some((field) => field.source === 'stored')

  return (
    <section
      id={meta.id}
      className={cn(
        'mb-3.5 rounded-lg border bg-card',
        needsAttention ? 'border-warn/35' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 font-serif text-lg"
          aria-hidden="true"
        >
          {meta.name.charAt(0)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold">
            {meta.name}
            {meta.badge && (
              <span className="rounded-sm border border-primary px-1.5 py-px font-mono text-xs text-primary">
                {meta.badge}
              </span>
            )}
            {meta.ship === 'stub' && (
              <span className="rounded-sm border border-faint px-1.5 py-px font-mono text-xs text-faint">
                stub in v1
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{meta.powers}</span>
        </span>

        <StatusPill status={state.status} />
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="px-4 pb-4">
          {meta.risk && (
            <p className="mb-3 flex gap-2.5 rounded-md border border-destructive/30 bg-destructive/[0.07] p-3 text-sm leading-relaxed text-muted-foreground">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
              <span>{meta.risk}</span>
            </p>
          )}

          {state.status !== 'configured' && (
            <p className="mb-3 flex gap-2.5 rounded-md border border-warn/25 bg-warn-bg p-3 text-sm leading-relaxed">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
              <span>
                <strong className="font-semibold">What breaks without this:</strong>{' '}
                {meta.degradation}
              </span>
            </p>
          )}

          {state.status === 'missing' && missing.length > 0 && (
            <p
              data-testid="missing-fields"
              className="mb-3 rounded-md border border-warn/25 bg-warn-bg p-3 text-sm leading-relaxed"
            >
              <strong className="font-semibold">Half configured:</strong>{' '}
              {listFieldLabels(missing)} {missing.length > 1 ? 'are' : 'is'} empty, so
              nothing here can run yet.
            </p>
          )}

          {state.errorDetail && (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/[0.07] p-3 font-mono text-sm text-destructive">
              Last test failed: {state.errorDetail}
            </p>
          )}

          <form action={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              {meta.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  providerId={meta.id}
                  field={field}
                  stored={fieldState(field.key)}
                  missing={missingKeys.has(field.key)}
                  envFallback={envFallbackFor(meta, field.key)}
                  models={models}
                  onDiscoverModels={onDiscoverModels}
                  pending={pending}
                />
              ))}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || meta.fields.length === 0}>
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={pending}>
                Test connection
              </Button>
              {hasStored && meta.fields.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={pending}>
                  Remove
                </Button>
              )}

              {test && (
                <span
                  className={cn('font-mono text-xs', test.ok ? 'text-pass' : 'text-destructive')}
                >
                  {test.ok ? '✓' : '✕'} {test.detail}
                </span>
              )}
              {message && (
                <span
                  data-testid="save-message"
                  className={cn(
                    'text-xs',
                    message.ok ? 'text-muted-foreground' : 'font-medium text-warn',
                  )}
                >
                  {message.message}
                </span>
              )}
            </div>
          </form>

          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              How to get this key
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {meta.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="label-mono">Cost</span> {meta.freeTier}
            </p>
            {meta.getKeyUrl && (
              <a
                href={meta.getKeyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Open {meta.name} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </details>
        </div>
      )}
    </section>
  )
}

interface FieldInputProps {
  providerId: string
  field: ProviderField
  stored?: { display: string | null; source: 'stored' | 'env' | null }
  /** Required, and nothing stored or in the environment stands behind it. */
  missing: boolean
  /** The environment variable hunt reads for this field, if it declares one. */
  envFallback: string | null
  models: string[]
  onDiscoverModels: () => void
  pending: boolean
}

function FieldInput({
  providerId,
  field,
  stored,
  missing,
  envFallback,
  models,
  onDiscoverModels,
  pending,
}: FieldInputProps) {
  const hasValue = stored?.source != null
  const fromEnv = stored?.source === 'env'
  // Every card has an "apiKey" field, so ids must be namespaced per provider —
  // otherwise duplicate ids leave each label pointing at the first card's input.
  const domId = `${providerId}-${field.key}`

  return (
    <div
      data-testid={`field-${providerId}-${field.key}`}
      className={field.kind === 'model' ? 'sm:col-span-1' : undefined}
    >
      <Label htmlFor={domId}>
        {field.label}
        <span className="ml-1 normal-case tracking-normal">
          {field.optional ? '(optional)' : '(required)'}
        </span>
      </Label>

      {field.kind === 'select' ? (
        <select
          id={domId}
          name={field.key}
          aria-required={field.optional ? undefined : true}
          defaultValue={stored?.display ?? field.defaultValue}
          className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm"
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'model' ? (
        <div className="flex gap-2">
          <Input
            id={domId}
            name={field.key}
            aria-required={field.optional ? undefined : true}
            list={`${domId}-options`}
            defaultValue={stored?.display ?? field.defaultValue ?? ''}
            placeholder={field.placeholder}
          />
          <datalist id={`${domId}-options`}>
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDiscoverModels}
            disabled={pending}
            title="Fetch the model list from this provider"
          >
            Fetch
          </Button>
        </div>
      ) : (
        <Input
          id={domId}
          name={field.key}
          type={field.secret ? 'password' : 'text'}
          aria-required={field.optional ? undefined : true}
          autoComplete="off"
          // A saved secret is shown only as a mask in the placeholder; leaving
          // the box empty keeps the stored key exactly as it is.
          placeholder={
            field.secret && hasValue ? (stored?.display ?? undefined) : field.placeholder
          }
          defaultValue={field.secret ? '' : hasValue && !fromEnv ? (stored?.display ?? '') : ''}
        />
      )}

      {fromEnv ? (
        <p className="mt-1 text-xs text-faint">
          Set from your environment — save a key here to override it.
        </p>
      ) : (
        <>
          {missing && <p className="mt-1 text-xs text-warn">Required — this box is empty.</p>}
          {!hasValue && envFallback && (
            <p className="mt-1 text-xs text-faint">
              hunt also reads <code className="font-mono">{envFallback}</code> from your
              environment — nothing is set under that name.
            </p>
          )}
          {field.help && <p className="mt-1 text-xs text-faint">{field.help}</p>}
        </>
      )}
    </div>
  )
}
