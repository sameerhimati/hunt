import { promptKindOf } from '@/lib/llm/prompts'
import { FakeLlmProvider } from '@/lib/llm/providers/fake'
import type { LlmRequest } from '@/lib/llm/types'

import { TEST_MODEL } from './env'
import { listFixtures, readJsonFixture } from './fixtures'

interface LlmScript {
  promptKind: string
  /**
   * Optional discriminator for a kind that more than one call site uses.
   * The script answers only requests whose prompt text contains this string.
   *
   * `rate` is why this exists: the application page rates one job and the
   * sourcing board rates a page of them, through the same prompt kind but with
   * different response shapes. Without a discriminator the two fixtures would
   * shadow each other by filename order, and a phase would inherit the other
   * phase's fixture as a mystery parse failure.
   */
  match?: string
  /** Object (serialised to JSON for the caller to parse) or a raw string reply. */
  response: unknown
}

export interface LoadedScript {
  file: string
  match?: string
  reply: string
}

/**
 * Loads `gates/fixtures/llm/*.json`, grouped by promptKind. Read fresh on every
 * call: a gate that writes a new fixture mid-run gets it, and there is no cache
 * to invalidate between test files.
 */
function loadScripts(): Map<string, LoadedScript[]> {
  const scripts = new Map<string, LoadedScript[]>()

  for (const file of listFixtures('llm', '.json')) {
    const script = readJsonFixture<LlmScript>('llm', file)
    if (!script?.promptKind) continue

    const loaded: LoadedScript = {
      file,
      match: script.match,
      reply:
        typeof script.response === 'string' ? script.response : JSON.stringify(script.response),
    }
    scripts.set(script.promptKind, [...(scripts.get(script.promptKind) ?? []), loaded])
  }

  return scripts
}

/** Everything the model would actually read — what a `match` is tested against. */
function requestText(request: LlmRequest): string {
  return [
    ...(request.system ?? []).map((block) => block.text),
    ...request.messages.map((message) => message.content),
  ].join('\n')
}

/**
 * Chooses which fixture answers a request. Exported because it is the dispatch
 * rule itself — the committed fixture set can't grow a second `rate` script
 * until Phase 5 records one, so this is where the rule gets tested.
 */
export function pickScript(
  kind: string,
  candidates: LoadedScript[],
  request: LlmRequest,
): string {
  const text = requestText(request)
  const matched = candidates.filter((script) => script.match && text.includes(script.match))
  if (matched.length > 0) return matched[0].reply

  const defaults = candidates.filter((script) => !script.match)
  if (defaults.length === 1) return defaults[0].reply

  if (defaults.length > 1) {
    throw new Error(
      `HUNT_TEST_MODE: promptKind '${kind}' has ${defaults.length} fixtures with no "match" ` +
        `discriminator (${defaults.map((script) => script.file).join(', ')}), so which one answers ` +
        'a call would depend on filename order. Give all but one a "match" string that appears in ' +
        'its own prompt text.',
    )
  }

  throw new Error(
    `HUNT_TEST_MODE: every fixture for promptKind '${kind}' is guarded by a "match" that this ` +
      `request does not contain (${candidates.map((script) => script.file).join(', ')}). ` +
      'Either widen a match or record an unguarded fixture for this call site.',
  )
}

function respond(request: LlmRequest): string {
  const kind = promptKindOf(request)
  const scripts = loadScripts()

  if (!kind) {
    throw new Error(
      'HUNT_TEST_MODE: an LLM request arrived without a `kind:` system block. ' +
        'Call the model through runPrompt() (src/lib/llm/prompts) so the fake can dispatch.',
    )
  }

  const candidates = scripts.get(kind)
  if (!candidates?.length) {
    throw new Error(
      `HUNT_TEST_MODE: no scripted response for promptKind '${kind}'. ` +
        `Record one at gates/fixtures/llm/<name>.json with {"promptKind":"${kind}","response":…}. ` +
        `Scripted kinds: ${[...scripts.keys()].join(', ') || 'none'}.`,
    )
  }

  return pickScript(kind, candidates, request)
}

/**
 * The scripted FakeLlmProvider: every call is answered from the fixture recorded
 * for its promptKind. An unscripted kind throws a message that says exactly
 * which file to write — silence would turn into a mystery empty response later.
 */
export function scriptedLlm(): FakeLlmProvider {
  return new FakeLlmProvider({ responder: respond, models: [TEST_MODEL] })
}

/** What `resolveLlm()` returns in test mode — same shape, no key required. */
export function testLlm(): { provider: FakeLlmProvider; model: string } {
  return { provider: scriptedLlm(), model: TEST_MODEL }
}
