import type {
  CustomSection,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeContent,
} from '@/lib/resume/schema'

import type { AiTellDetail, AiTellFlag, CheckOutcome, CheckRunInput } from './types'

/**
 * AI-tell audit — phrases that pattern-match LLM boilerplate, each with a
 * human rewrite (SCREENS §7).
 *
 * **This check is deterministic: a curated pattern list, not a model call.**
 * Two reasons, both load-bearing:
 *
 *  1. `PROMPT_KINDS` in `src/lib/llm/prompts/index.ts` is a closed vocabulary
 *     owned by the wave foundation. Phase 3 fills the slots it was given; it
 *     does not widen that list to buy itself a prompt.
 *  2. A keyless check keeps the panel useful before any key exists. Of the five
 *     instruments only `match_rating` is key-gated — this one runs offline on a
 *     first launch, which is exactly when a user is most likely to be staring
 *     at a résumé a model just wrote for them.
 *
 * What follows is a copy constraint, not just an implementation detail: the
 * reading is "this phrasing pattern-matches LLM boilerplate", and the UI must
 * say that. Never "AI detection" — not a measurable thing — and never "this
 * looks AI-generated", which is a judgement about the writer. `utilized` is
 * flagged because `used` is the better word, and that was true long before
 * language models existed.
 *
 * Every flag states what was found and offers a rewrite. Take it or ignore it;
 * nothing here scolds, and a flagged phrase is a reading, not a failure.
 */

interface TellPattern {
  /** Case-insensitive, global, word-bounded. */
  pattern: RegExp
  /** The rewrite to reach for, concrete enough to act on without thinking. */
  suggestion: string
}

/**
 * The curated list. Each entry earns its place by being a phrase that carries
 * no information — a longer way to say a shorter word, or a claim the bullets
 * beside it already make better.
 */
const PATTERNS: readonly TellPattern[] = [
  {
    pattern: /\bleverag(?:e|es|ed|ing)\b/gi,
    suggestion: 'Say “used” — or the verb that actually happened: “migrated”, “rebuilt”, “wired”.',
  },
  {
    pattern: /\butiliz(?:e|es|ed|ing)\b|\butilization\b/gi,
    suggestion: 'Say “used”.',
  },
  {
    pattern: /\bspearhead(?:s|ed|ing)?\b/gi,
    suggestion: 'Say “led” — and name who or what you led.',
  },
  {
    pattern: /\bpassionate about\b/gi,
    suggestion:
      'Cut it and show the passion instead: the project you shipped on your own time says it.',
  },
  {
    pattern: /\bcutting[-\s]edge\b|\bstate[-\s]of[-\s]the[-\s]art\b|\bbleeding[-\s]edge\b/gi,
    suggestion: 'Name the technology. “Kafka” dates itself honestly; “cutting-edge” does not.',
  },
  {
    pattern: /\bseamless(?:ly)?\b/gi,
    suggestion: 'Cut it, or say what did not break: “zero downtime”, “no duplicate postings”.',
  },
  {
    pattern: /\bresponsible for\b/gi,
    suggestion: 'Start with the verb: “owned”, “ran”, “built”, “maintained”.',
  },
  {
    pattern: /\bproven track record\b/gi,
    suggestion: 'Give the record itself — the number, the system, the outcome.',
  },
  {
    pattern: /\bresults[-\s]driven\b|\bresults[-\s]oriented\b/gi,
    suggestion: 'Cut it. The results are in the bullets underneath.',
  },
  {
    pattern: /\bteam player\b/gi,
    suggestion: 'Name the collaboration: who you worked with, on what, to what end.',
  },
  {
    pattern: /\bin today['’]s fast[-\s]paced\b|\bfast[-\s]paced environment\b/gi,
    suggestion: 'Delete the preamble and start at what you did.',
  },
  {
    pattern: /\bself[-\s]starter\b/gi,
    suggestion: 'Show it: the thing you started that nobody asked you to.',
  },
  {
    pattern: /\bsynerg(?:y|ies|istic)\b/gi,
    suggestion: 'Say what the two things did together, in plain words.',
  },
]

/** Three or more manner adverbs in one sentence reads generated. */
const ADVERB_STACK_THRESHOLD = 3

/**
 * `-ly` words that are not manner adverbs. Without this, "the backend guild's
 * weekly design review" counts toward a stack it has nothing to do with.
 */
const NOT_MANNER_ADVERBS = new Set([
  'weekly',
  'daily',
  'monthly',
  'quarterly',
  'yearly',
  'nightly',
  'hourly',
  'biweekly',
  'early',
  'only',
  'family',
  'apply',
  'supply',
  'reply',
  'likely',
  'friendly',
  'costly',
  'timely',
  'anomaly',
  'assembly',
  'ally',
  'rally',
])

/** One addressable string in the document, with the path that reaches it. */
interface TextUnit {
  path: string
  text: string
}

/**
 * Flags phrasing that pattern-matches LLM boilerplate.
 *
 * Returns `[]` for a document written in plain words — the clean `alex-chen`
 * fixture yields nothing, and that is the property the tests pin, because a
 * check that flags a good résumé is worse than no check at all.
 */
export function auditAiTell(content: ResumeContent): AiTellFlag[] {
  return textUnits(content).flatMap(scanUnit)
}

/**
 * The same instrument pointed at one loose piece of prose — the cover letter
 * calls this per paragraph, with the paragraph id as the path.
 *
 * It is the *same* pattern list on purpose. A phrase that carries no information
 * on a résumé carries none in a letter, and two drifting lists would mean hunt
 * flagged "leverage" in one artifact and not the other, which is a bug the user
 * would have to discover. Note the direction this points: the résumé is mostly
 * the user's own writing, while the letter is the one artifact hunt generates
 * end to end, so this is the surface where the check is auditing hunt's output
 * rather than offering the user an opinion about theirs. The copy constraint in
 * the module docblock still holds — the reading is "this pattern-matches LLM
 * boilerplate", never "this looks AI-generated".
 *
 * Module-scope state is why this is safe to call in a loop: `scanUnit` resets
 * every global regex before using it (see below), so callers cannot get a
 * half-consumed `lastIndex` from the previous paragraph.
 */
export function auditAiTellText(text: string, path: string): AiTellFlag[] {
  return text.trim() ? scanUnit({ path, text }) : []
}

function scanUnit(unit: TextUnit): AiTellFlag[] {
  const flags: AiTellFlag[] = []

  for (const { pattern, suggestion } of PATTERNS) {
    // These regexes are module-level and global: reset before every scan.
    pattern.lastIndex = 0
    for (const match of unit.text.matchAll(pattern)) {
      flags.push({ path: unit.path, phrase: match[0], suggestion })
    }
  }

  flags.push(...adverbStacks(unit))

  return flags
}

/** The sentences in `unit` carrying three or more manner adverbs. */
function adverbStacks(unit: TextUnit): AiTellFlag[] {
  const flags: AiTellFlag[] = []

  for (const sentence of unit.text.split(/(?<=[.!?])\s+/)) {
    const adverbs = [...sentence.matchAll(/\b[a-z]{4,}ly\b/gi)]
      .map((match) => match[0])
      .filter((word) => !NOT_MANNER_ADVERBS.has(word.toLowerCase()))

    if (adverbs.length < ADVERB_STACK_THRESHOLD) continue

    flags.push({
      path: unit.path,
      phrase: sentence.trim(),
      suggestion: `Three adverbs in one sentence (${adverbs.join(', ')}) — keep the strongest verb and drop the rest.`,
    })
  }

  return flags
}

/** Every path in the document that holds prose worth reading. */
function textUnits(content: ResumeContent): TextUnit[] {
  const units: TextUnit[] = []

  const push = (path: string, text: string | undefined | null) => {
    if (text && text.trim()) units.push({ path, text })
  }

  push('basics.label', content.basics.label)
  push('basics.summary', content.basics.summary)

  content.experience.forEach((entry: ExperienceEntry, index) => {
    push(`experience[${index}].title`, entry.title)
    entry.bullets.forEach((bullet, b) => push(`experience[${index}].bullets[${b}]`, bullet))
  })

  content.education.forEach((entry: EducationEntry, index) => {
    entry.bullets.forEach((bullet, b) => push(`education[${index}].bullets[${b}]`, bullet))
  })

  content.projects.forEach((entry: ProjectEntry, index) => {
    push(`projects[${index}].description`, entry.description)
    entry.bullets.forEach((bullet, b) => push(`projects[${index}].bullets[${b}]`, bullet))
  })

  content.custom.forEach((section: CustomSection, index) => {
    section.bullets.forEach((bullet, b) => push(`custom[${index}].bullets[${b}]`, bullet))
  })

  return units
}

/**
 * Runner slot: reports `N phrases flagged`, or `clean`.
 *
 * No key check and no `error` path for a missing model, because there is no
 * model — this one always measures. A flagged phrase is `warn`, never `fail`:
 * the check has an opinion about the wording, not authority over the document.
 */
export function runAiTell(input: CheckRunInput): Promise<CheckOutcome> {
  const flags = auditAiTell(input.version.content)
  const details: AiTellDetail = { flags }

  return Promise.resolve({
    kind: 'ai_tell',
    verdict: flags.length === 0 ? 'pass' : 'warn',
    summary: flags.length === 0 ? 'clean' : `${flags.length} ${plural(flags.length)} flagged`,
    details,
  })
}

function plural(count: number): string {
  return count === 1 ? 'phrase' : 'phrases'
}
