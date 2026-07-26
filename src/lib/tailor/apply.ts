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

export function applyChanges(
  content: ResumeContent,
  accepted: readonly TailorChange[],
): ResumeContent {
  const draft = structuredClone(content) as unknown as Record<string, unknown>

  const applicable = accepted
    .filter((change) => change.status !== 'refused')
    .map((change, index) => ({ change, index }))
    .sort((a, b) => ORDER[a.change.kind] - ORDER[b.change.kind] || rank(a) - rank(b))

  for (const { change } of applicable) apply(draft, change)

  return parseResumeContent(draft)
}

/**
 * Within a kind, removals run bottom-up so earlier splices don't shift the
 * indexes later ones name; everything else keeps the model's ordering.
 */
function rank({ change, index }: { change: TailorChange; index: number }): number {
  return change.kind === 'remove' ? -indexOf(change.path) : index
}

function apply(root: Record<string, unknown>, change: TailorChange): void {
  const segments = parsePath(change.path)
  if (segments.length === 0) return

  if (change.kind === 'reorder') {
    reorder(resolve(root, segments), change.now)
    return
  }

  if (change.kind === 'add') {
    // The prompt asks for the list itself ("experience[0].bullets"), which
    // appends. An indexed path inserts at that position instead.
    const list = resolve(root, segments)
    if (Array.isArray(list)) {
      list.push(change.now)
      return
    }

    const target = locate(root, segments)
    if (!target) return
    if (Array.isArray(target.parent) && typeof target.key === 'number') {
      target.parent.splice(target.key, 0, change.now)
      return
    }
    setField(target, change.now)
    return
  }

  const target = locate(root, segments)
  if (!target) return

  if (change.kind === 'remove') {
    if (Array.isArray(target.parent) && typeof target.key === 'number') {
      if (target.key < target.parent.length) target.parent.splice(target.key, 1)
      return
    }
    delete (target.parent as Record<string, unknown>)[String(target.key)]
    return
  }

  // edit — only over something that is already there.
  if (resolve(root, segments) === undefined) return
  setField(target, change.now)
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
function reorder(list: unknown, order: string): void {
  if (!Array.isArray(list) || !order.trim()) return

  const wanted = order.split(ORDER_SEPARATOR).map((entry) => entry.trim())
  if (wanted.length !== list.length) return

  const remaining = [...list]
  const next: unknown[] = []
  for (const entry of wanted) {
    const at = remaining.findIndex((value) => typeof value === 'string' && value.trim() === entry)
    if (at === -1) return
    next.push(remaining.splice(at, 1)[0])
  }

  list.splice(0, list.length, ...next)
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
