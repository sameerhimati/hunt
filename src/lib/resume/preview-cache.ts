/**
 * The last few rendered previews, held in memory so the editor can point an
 * `<iframe>` at a real URL.
 *
 * The obvious thing is `URL.createObjectURL(blob)` — the bytes are already in
 * the browser, no server state, and it is what this used to do. It renders in
 * Chrome and shows a blank white page in Safari, which does not display a PDF
 * framed from a `blob:` URL. A same-origin URL renders in both, so the bytes
 * take one short trip back through the server rather than the preview being
 * broken in a browser a third of people use.
 *
 * Bounded and deliberately forgetful: a preview is regenerated on every edit,
 * so anything but the newest few is already stale paper. Nothing is persisted —
 * these die with the process, which is correct, since a résumé that matters is
 * saved as a version.
 */

const MAX_ENTRIES = 8

const previews = new Map<string, Uint8Array>()

export function putPreview(pdf: Uint8Array): string {
  const id = crypto.randomUUID()
  previews.set(id, pdf)

  // Map iterates in insertion order, so the first key is the oldest.
  while (previews.size > MAX_ENTRIES) {
    const oldest = previews.keys().next()
    if (oldest.done) break
    previews.delete(oldest.value)
  }

  return id
}

export function getPreview(id: string): Uint8Array | null {
  return previews.get(id) ?? null
}
