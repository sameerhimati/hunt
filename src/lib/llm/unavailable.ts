/**
 * The one sentence hunt says when a feature needs a model and there isn't one.
 *
 * Five modules used to write their own version of it — "No LLM key configured",
 * "needs a language model", "needs an LLM key", "needs a model key" — and a
 * component matched one of them with `/llm key/i`, which made the wording a
 * contract no test enforced. Wording is not a contract; a function is.
 *
 * The feature name is the only part that legitimately varies: the user is owed
 * "which of my features just stopped", and the same remedy either way. So the
 * shape is fixed here and the two variable clauses are arguments.
 *
 * Deliberately import-free so it can be read from a route handler, a server
 * action, an engine, or a client component without dragging anything with it.
 */

/** How the user fixes it. Named once so a provider rename is one edit. */
export const MODEL_REMEDY = 'Add an Anthropic (or OpenAI-compatible) key in Settings'

/**
 * @param feature what stopped, in the user's words — "Tailoring".
 * @param stillWorks the keyless floor, without a trailing period.
 */
export function modelRequired(feature: string, stillWorks: string): string {
  return `${feature} needs a language model. ${MODEL_REMEDY} — ${stillWorks}.`
}
