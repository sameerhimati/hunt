import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

import type { TailorChange, TailorChangeKind } from './types'

/**
 * Writes the accepted changes into a copy of the content — the child version's
 * document. Pure: the input is never mutated, because the base version is what
 * the user re-tailors and branches from.
 *
 * Two guarantees:
 *
 *  - **A refused change cannot reach the output.** Callers pass the accepted
 *    (`proposed`) subset, and this function drops anything marked `refused`
 *    anyway. It is the last place the honesty invariant can be enforced before
 *    text becomes a saved version and then a rendered PDF, so it is enforced
 *    here too rather than trusted to every future caller.
 *  - **It applies exactly what it is given and invents nothing.** A change whose
 *    path does not exist in the document is skipped, not built out. The result
 *    goes back through `parseResumeContent`, so a run can never produce content
 *    the rest of the app would refuse to load.
 *
 * A skip is **reported, never silent.** `applyChangesWithReport` returns the
 * changes it could not land alongside the document, because a change the user
 * read, accepted and watched get counted, which then does not appear in the
 * saved version, means the document they reviewed is not the document that was
 * saved. That is the same lie as an uncited claim, told the other way round.
 * `applyChanges` keeps the plain content signature for callers that already
 * validated (`./validator.ts` refuses an unlandable target before it is ever
 * shown), and is the same function with the report dropped.
 *
 * Order matters and is fixed: edits (paths still address the base), then removals
 * high-index-first, then appends, then reorders. Anything else and one change's
 * index shift silently retargets the next one — a bullet quietly overwritten is
 * exactly the silent rewrite this whole flow exists to prevent.
 */

const ORDER: Record<TailorChangeKind, number> = { edit: 0, remove: 1, add: 2, reorder: 3 }

/** How `diffStringList` renders a list order — the reorder vocabulary. */
const ORDER_SEPARATOR = ' · '

type Container = Record<string, unknown> | unknown[]

interface Target {
  parent: Container
  /** Array index, or object key. */
  key: string | number
}

/** One accepted change the document had no place for. */
export interface SkippedChange {
  /** The change's id, so the review row can be found again. */
  id: string
  kind: TailorChangeKind
  path: string
  /** One short factual sentence — what the applier looked for and did not find. */
  reason: string
}

export interface ApplyResult {
  content: ResumeContent
  /**
   * Changes that passed the guard, were accepted, and still did not land —
   * in the order they were given. Empty on a clean apply, which is the normal
   * case; a non-empty list is something the caller must show, not swallow.
   * Refused changes are not listed: they are dropped on purpose and already
   * shown as FabricationFlags, so reporting them here would double-count.
   */
  skipped: SkippedChange[]
}

export function applyChanges(
  content: ResumeContent,
  accepted: readonly TailorChange[],
): ResumeContent {
  return applyChangesWithReport(content, accepted).content
}

export function applyChangesWithReport(
  content: ResumeContent,
  accepted: readonly TailorChange[],
): ApplyResult {
  const draft = structuredClone(content) as unknown as Record<string, unknown>

  const applicable = accepted
    .filter((change) => change.status !== 'refused')
    .map((change, index) => ({ change, index }))
    .sort((a, b) => ORDER[a.change.kind] - ORDER[b.change.kind] || rank(a) - rank(b))

  const skipped = new Map<number, SkippedChange>()
  for (const { change, index } of applicable) {
    const reason = apply(draft, change)
    if (reason) skipped.set(index, { id: change.id, kind: change.kind, path: change.path, reason })
  }

  return {
    content: parseResumeContent(draft),
    // Reported in the order the user reviewed them, not the order they ran.
    skipped: [...skipped.entries()].sort(([a], [b]) => a - b).map(([, entry]) => entry),
  }
}

/**
 * Within a kind, removals run bottom-up so earlier splices don't shift the
 * indexes later ones name; everything else keeps the model's ordering.
 */
function rank({ change, index }: { change: TailorChange; index: number }): number {
  return change.kind === 'remove' ? -indexOf(change.path) : index
}

/** Null when the change landed; otherwise the sentence saying what was missing. */
function apply(root: Record<string, unknown>, change: TailorChange): string | null {
  const segments = parsePath(change.path)
  if (segments.length === 0) return 'This change names no field in your résumé.'

  if (change.kind === 'reorder') {
    return reorder(resolve(root, segments), change.now)
  }

  if (change.kind === 'add') {
    // The prompt asks for the list itself ("experience[0].bullets"), which
    // appends. An indexed path inserts at that position instead.
    const list = resolve(root, segments)
    if (Array.isArray(list)) {
      list.push(change.now)
      return null
    }

    const target = locate(root, segments)
    if (!target) return `Nothing at ${change.path} to add to.`
    if (Array.isArray(target.parent) && typeof target.key === 'number') {
      if (target.key > target.parent.length) {
        return `${change.path} is past the end of that list.`
      }
      target.parent.splice(target.key, 0, change.now)
      return null
    }
    setField(target, change.now)
    return null
  }

  const target = locate(root, segments)
  if (!target) return `${change.path} is not a field in your résumé.`

  if (change.kind === 'remove') {
    if (Array.isArray(target.parent) && typeof target.key === 'number') {
      if (target.key >= target.parent.length) {
        return `${change.path} is not in your résumé.`
      }
      target.parent.splice(target.key, 1)
      return null
    }
    if (!(String(target.key) in (target.parent as Record<string, unknown>))) {
      return `${change.path} is not in your résumé.`
    }
    delete (target.parent as Record<string, unknown>)[String(target.key)]
    return null
  }

  // edit — only over something that is already there.
  if (resolve(root, segments) === undefined) return `${change.path} is not in your résumé.`
  setField(target, change.now)
  return null
}

/**
 * Could a change of this kind land on this path, in this document? The validator
 * asks before a proposal is ever shown, so an unlandable change is refused where
 * the user can see it rather than reviewed, accepted, counted and then dropped
 * here. It lives beside the applier because the only honest answer is the one
 * the applier itself would give, and two copies of that answer would drift.
 */
export function canApply(
  content: ResumeContent,
  kind: TailorChangeKind,
  path: string,
): boolean {
  const root = content as unknown as Record<string, unknown>
  const segments = parsePath(path)
  if (segments.length === 0) return false

  const at = resolve(root, segments)

  if (kind === 'reorder') return Array.isArray(at)
  if (kind === 'edit') return typeof at === 'string'
  if (kind === 'remove') return at !== undefined

  // `add` is the one kind that legitimately targets what is not there yet: the
  // list to append to, or the index to insert at. What must exist is the place
  // it goes — the list itself, or the container holding the named index.
  if (Array.isArray(at)) return true

  const target = locate(root, segments)
  if (!target) return false
  if (Array.isArray(target.parent)) {
    return typeof target.key === 'number' && target.key <= target.parent.length
  }
  return true
}

function setField(target: Target, value: string): void {
  if (Array.isArray(target.parent)) {
    if (typeof target.key === 'number') target.parent[target.key] = value
    return
  }
  ;(target.parent as Record<string, unknown>)[String(target.key)] = value
}

/**
 * A reorder is a permutation or it is nothing: the requested order has to be the
 * same items the list already holds. Otherwise it is a rewrite in disguise —
 * skipped, because a reorder that adds text is text nobody reviewed. (Edits run
 * first, so a reorder naming pre-edit text simply no-ops.)
 */
function reorder(list: unknown, order: string): string | null {
  if (!Array.isArray(list)) return 'That is not a list in your résumé.'
  if (!order.trim()) return 'The model gave no order to put that list in.'

  const wanted = order.split(ORDER_SEPARATOR).map((entry) => entry.trim())
  if (wanted.length !== list.length) {
    return 'That order is not the same items the list holds.'
  }

  const remaining = [...list]
  const next: unknown[] = []
  for (const entry of wanted) {
    const at = remaining.findIndex((value) => typeof value === 'string' && value.trim() === entry)
    if (at === -1) return 'That order is not the same items the list holds.'
    next.push(remaining.splice(at, 1)[0])
  }

  list.splice(0, list.length, ...next)
  return null
}

/** `experience[0].bullets[3]` → ['experience', 0, 'bullets', 3]. */
function parsePath(path: string): (string | number)[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
}

/** The trailing index of a path, for ordering removals. -1 when there is none. */
function indexOf(path: string): number {
  const last = parsePath(path).at(-1)
  return typeof last === 'number' ? last : -1
}

function resolve(root: Record<string, unknown>, segments: (string | number)[]): unknown {
  let cursor: unknown = root
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[String(segment)]
  }
  return cursor
}

/** The container holding the leaf, or null when the path leads nowhere. */
function locate(root: Record<string, unknown>, segments: (string | number)[]): Target | null {
  const parent = resolve(root, segments.slice(0, -1))
  if (parent == null || typeof parent !== 'object') return null

  return { parent: parent as Container, key: segments[segments.length - 1] }
}
