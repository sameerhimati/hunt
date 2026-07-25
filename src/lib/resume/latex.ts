/**
 * LaTeX escaping for user text.
 *
 * Résumés are full of the characters TeX treats as syntax — `$40M/month`,
 * `C#`, `A&R`, `100% uptime`. Escaping is therefore a correctness requirement,
 * not a nicety: one unescaped `$` turns the rest of the document into math mode
 * and the render fails on a line the user never wrote.
 */

const SYMBOLS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

/** Typographic characters that survive a copy-paste from a Word résumé. */
const PUNCTUATION: Record<string, string> = {
  '—': '---',
  '–': '--',
  '‘': '`',
  '’': "'",
  '“': '``',
  '”': "''",
  '…': '\\ldots{}',
  '•': '\\textbullet{}',
  ' ': '~',
}

export function tex(value: string | null | undefined): string {
  if (!value) return ''

  return [...value]
    .map((char) => SYMBOLS[char] ?? PUNCTUATION[char] ?? char)
    .join('')
}

/** Joins the parts of a contact line, dropping the ones the user left blank. */
export function joinDefined(parts: (string | undefined | null)[], separator: string): string {
  return parts.filter((part) => part && part.trim()).join(separator)
}

/** `2023-03 — Present`. Dates stay strings; résumés don't have real timestamps. */
export function dateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return ''
  return `${tex(start ?? '')} -- ${end ? tex(end) : 'Present'}`
}
