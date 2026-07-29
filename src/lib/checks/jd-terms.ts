/**
 * Deterministic JD term extraction — the input side of `keyword_coverage`.
 *
 * Reading the terms out of a posting with a model would make the check depend
 * on a key, a prompt kind and a round trip, and would make the same JD produce
 * a slightly different term list every run. It also can't be checked: a user
 * who disagrees with a term has nothing to point at. So this is rules only —
 * capitalised tech tokens, a small list of known multi-word skill phrases, and
 * the noun phrase after an explicit requirement trigger ("experience with …").
 * Same JD in, same terms out, and every term is a string the user can find in
 * the posting with ⌘F.
 *
 * It is deliberately conservative. A term this misses is a term we never claim
 * to have measured — the check reports `N / M JD terms` against the M it
 * actually looked at and never a percentage of an invented whole (DESIGN §7).
 */

/**
 * The tokenizer both halves of this check share.
 *
 * Everything that isn't a letter or a digit is a separator, which is what makes
 * `on-call` and `on call` the same two tokens — a hyphen is punctuation, not
 * meaning (`gates/fixtures/checks/keyword-coverage-3.json`).
 */
export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)
}

/**
 * Collapses a token to the form singular and plural share, and *only* that.
 *
 * Plural equivalence is the entire morphology this check is allowed: `webhooks`
 * matching `webhook` is the same word, but `idempotency` matching `idempotent`
 * would be stemming, and stemming is the first step onto the slope that ends in
 * telling someone they cover "latency" because they wrote "p99".
 */
export function stem(token: string): string {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(?:ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 2 && /s$/.test(token) && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1)
  return token
}

/** The comparison key for a whole term or phrase. Empty when there is nothing to match. */
export function termKey(text: string): string {
  return tokenize(text).map(stem).join(' ')
}

/**
 * Multi-word skills that read as one term. Single words don't need a list —
 * the tech-token and requirement-line rules find those — but "incident
 * response" would otherwise arrive as two words nobody asked about.
 */
const KNOWN_SKILL_PHRASES = [
  'distributed systems',
  'distributed tracing',
  'event bus',
  'message broker',
  'incident response',
  'on call',
  'code review',
  'design review',
  'api design',
  'system design',
  'data pipelines',
  'unit tests',
  'integration tests',
  'test coverage',
  'machine learning',
  'deep learning',
  'natural language processing',
  'infrastructure as code',
  'continuous integration',
  'continuous delivery',
  'load testing',
  'performance tuning',
  'technical writing',
  'product sense',
  'cross-functional collaboration',
  'double-entry ledger',
  'payment orchestration',
  'fraud detection',
  'data modeling',
  'schema design',
]

/**
 * Tech whose casing gives it away only sometimes — `Go` at the start of a line
 * is indistinguishable from an English verb by shape alone, so the shape rules
 * get this list as a floor.
 */
const KNOWN_TECH = new Set([
  'go',
  'golang',
  'rust',
  'python',
  'java',
  'kotlin',
  'swift',
  'ruby',
  'scala',
  'elixir',
  'typescript',
  'javascript',
  'node',
  'react',
  'next.js',
  'django',
  'rails',
  'spring',
  'postgres',
  'postgresql',
  'mysql',
  'sqlite',
  'redis',
  'mongodb',
  'dynamodb',
  'snowflake',
  'kafka',
  'rabbitmq',
  'grpc',
  'graphql',
  'rest',
  'kubernetes',
  'docker',
  'terraform',
  'ansible',
  'aws',
  'gcp',
  'azure',
  'linux',
  'bash',
  'git',
  'airflow',
  'spark',
  'hadoop',
  'prometheus',
  'grafana',
  'datadog',
  'observability',
  'microservices',
  'latency',
  'throughput',
  'sharding',
  'caching',
  'payments',
  'ledger',
  'webhooks',
  'idempotency',
  'oauth',
  'saml',
])

/** Words that are never a term on their own, however they are capitalised. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'without',
  'from',
  'by',
  'as',
  'is',
  'are',
  'be',
  'been',
  'being',
  'was',
  'were',
  'has',
  'have',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'must',
  'may',
  'we',
  'you',
  'your',
  'our',
  'us',
  'they',
  'their',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'who',
  'what',
  'which',
  'work',
  'working',
  'team',
  'teams',
  'role',
  'job',
  'company',
  'position',
  'candidate',
  'candidates',
  'engineer',
  'engineers',
  'engineering',
  'years',
  'year',
  'plus',
  'nice',
  'strong',
  'deep',
  'solid',
  'excellent',
  'good',
  'great',
  'proven',
  'hands',
  'experience',
  'experiences',
  'knowledge',
  'familiarity',
  'proficiency',
  'expertise',
  'background',
  'skill',
  'skills',
  'requirements',
  'responsibilities',
  'qualifications',
  'about',
  'more',
  'other',
  'others',
  'such',
  'like',
  'across',
  'within',
  'into',
  'over',
  'per',
  'via',
  'using',
  'help',
  'build',
  'building',
  'own',
  'ownership',
  'monday',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
])

/** Capitalised words that are grammar, not technology. */
const COMMON_CAPITALISED = new Set([
  'i',
  'we',
  'you',
  'our',
  'your',
  'the',
  'this',
  'that',
  'they',
  'it',
  'if',
  'as',
  'at',
  'in',
  'on',
  'for',
  'and',
  'or',
  'but',
  'so',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
])

const REQUIREMENT_TRIGGER =
  /\b(?:experience|expertise|proficiency|proficient|familiarity|familiar|knowledge|background|skilled|fluent)\s+(?:with|in|of|using|across)\b/gi

/** A token as it sits in the JD, with enough context to judge sentence position. */
interface Token {
  text: string
  index: number
}

/**
 * Every candidate term in the posting, in the order it first appears, deduped
 * on the same key the scorer matches with (so `Kafka` and `kafka` are one term,
 * and the JD's first casing is the one reported back).
 */
export function extractJdTerms(jdText: string): string[] {
  const terms = new Map<string, string>()

  const add = (raw: string): void => {
    const text = raw.trim().replace(/\s+/g, ' ')
    const key = termKey(text)
    if (!key) return
    if (tokenize(text).every((token) => STOPWORDS.has(token))) return
    if (!/[a-z]/i.test(text)) return
    if (!terms.has(key)) terms.set(key, text)
  }

  for (const line of jdText.split(/\r?\n/)) {
    for (const found of [...knownPhrasesIn(line), ...techTokensIn(line), ...requirementPhrasesIn(line)]
      .sort((a, b) => a.index - b.index)) {
      add(found.text)
    }
  }

  return [...terms.values()]
}

/** Known multi-word skills, matched space/hyphen-insensitively, echoed in the JD's casing. */
function knownPhrasesIn(line: string): Token[] {
  const found: Token[] = []

  for (const phrase of KNOWN_SKILL_PHRASES) {
    const pattern = new RegExp(
      `(?<![A-Za-z0-9])${tokenize(phrase).map(escapeRegExp).join('[\\s-]+')}(?![A-Za-z0-9])`,
      'gi',
    )
    for (const match of line.matchAll(pattern)) {
      found.push({ text: match[0], index: match.index })
    }
  }

  return found
}

/**
 * Tokens that are technology by shape: internal capitals or symbols (`gRPC`,
 * `CI/CD`, `Node.js`), short all-caps acronyms (`SLO`, `API`), a known name, or
 * a capitalised word that isn't merely starting a sentence.
 */
function techTokensIn(line: string): Token[] {
  const found: Token[] = []
  const pattern = /[A-Za-z][A-Za-z0-9+#]*(?:[./][A-Za-z0-9+#]+)*/g

  let sentenceStart = true
  let cursor = 0

  for (const match of line.matchAll(pattern)) {
    const gap = line.slice(cursor, match.index)
    if (/[.!?;:•\-–—()[\]]/.test(gap)) sentenceStart = true
    cursor = match.index + match[0].length

    const text = match[0].replace(/\.+$/, '')
    const lower = text.toLowerCase()
    const isStart = sentenceStart
    sentenceStart = false

    if (STOPWORDS.has(lower) || COMMON_CAPITALISED.has(lower)) continue

    const hasInnerCaps = /[A-Z]/.test(text.slice(1))
    const hasSymbol = /[0-9+#./]/.test(text)
    const isAcronym = text.length >= 2 && text.length <= 6 && text === text.toUpperCase()
    const isCapitalised = /^[A-Z][a-z]/.test(text)

    if (KNOWN_TECH.has(lower) || hasInnerCaps || hasSymbol || isAcronym || (isCapitalised && !isStart)) {
      found.push({ text, index: match.index })
    }
  }

  return found
}

/** The noun phrase after "experience with …", up to the first clause boundary. */
function requirementPhrasesIn(line: string): Token[] {
  const found: Token[] = []

  for (const trigger of line.matchAll(REQUIREMENT_TRIGGER)) {
    const start = trigger.index + trigger[0].length
    const clause = line.slice(start).split(/[,;:.!?()]|\s(?:and|or|plus|to|for|at|is|as)\s/i)[0] ?? ''

    const words = clause.split(/\s+/).filter(Boolean)
    while (words.length && STOPWORDS.has(words[0].toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      words.shift()
    }
    const phrase = words.slice(0, 3).join(' ').replace(/[^A-Za-z0-9+#./\s-]+$/, '')
    if (phrase) found.push({ text: phrase, index: start })
  }

  return found
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
