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

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * `2026-01` → `Jan 2026`, on the way onto the paper and nowhere else.
 *
 * The schema stores dates ISO-style on purpose: they sort, they diff, and the
 * import prompt can normalise every résumé's idiosyncratic format into one
 * shape. But nobody writes "2026-01" on a résumé, and until now that stored
 * form went straight into the PDF — so the document you send an employer read
 * like a database row.
 *
 * Anything that is not exactly YYYY-MM passes through untouched. A bare year,
 * "Summer 2019", "Present" — résumé dates are free text, and re-formatting what
 * we cannot confidently parse would be worse than echoing what the user wrote.
 */
export function humanDate(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return value

  const month = Number(match[2])
  if (month < 1 || month > 12) return value

  return `${MONTHS[month - 1]} ${match[1]}`
}

/** `Mar 2023 -- Present`. Dates stay strings; résumés don't have real timestamps. */
export function dateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return ''
  return `${tex(humanDate(start ?? ''))} -- ${end ? tex(humanDate(end)) : 'Present'}`
}
