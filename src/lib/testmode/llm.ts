import { promptKindOf } from '@/lib/llm/prompts'
import { FakeLlmProvider } from '@/lib/llm/providers/fake'
import type { LlmRequest } from '@/lib/llm/types'

import { TEST_MODEL } from './env'
import { listFixtures, readJsonFixture } from './fixtures'

interface LlmScript {
  promptKind: string
  /** Object (serialised to JSON for the caller to parse) or a raw string reply. */
  response: unknown
}

/**
 * Loads `gates/fixtures/llm/*.json` into a promptKind → reply map. Read fresh on
 * every call: a gate that writes a new fixture mid-run gets it, and there is no
 * cache to invalidate between test files.
 */
function loadScripts(): Map<string, string> {
  const scripts = new Map<string, string>()

  for (const file of listFixtures('llm', '.json')) {
    const script = readJsonFixture<LlmScript>('llm', file)
    if (!script?.promptKind) continue
    scripts.set(
      script.promptKind,
      typeof script.response === 'string' ? script.response : JSON.stringify(script.response),
    )
  }

  return scripts
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

  const reply = scripts.get(kind)
  if (reply === undefined) {
    throw new Error(
      `HUNT_TEST_MODE: no scripted response for promptKind '${kind}'. ` +
        `Record one at gates/fixtures/llm/<name>.json with {"promptKind":"${kind}","response":…}. ` +
        `Scripted kinds: ${[...scripts.keys()].join(', ') || 'none'}.`,
    )
  }

  return reply
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
