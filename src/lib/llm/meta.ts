import type { ProviderMeta } from '@/lib/providers/types'

/**
 * hunt's prompts, caching layout, and no-fabrication validator are tuned against
 * Claude. Sonnet is the default because it's the best speed/intelligence balance
 * for the tailoring workload; the model dropdown is populated from the API, so
 * this is a starting point rather than a hardcoded list.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'

export const anthropicMeta: ProviderMeta = {
  id: 'anthropic',
  name: 'Anthropic',
  category: 'llm',
  ship: 'live',
  badge: 'tuned default',
  powers: 'Powers tailoring, checks, cover letters, and fit rating.',
  getKeyUrl: 'https://console.anthropic.com/settings/keys',
  steps: [
    'Create an account at console.anthropic.com and add billing credit.',
    'Open Settings → API keys and create a key.',
    'Paste the `sk-ant-…` key here and pick a model.',
  ],
  freeTier:
    'No free tier — usage is pay-as-you-go. A full job hunt typically costs a few dollars, and hunt caches your résumé prefix to keep it there.',
  degradation:
    'Without an LLM key nothing can be tailored, scored, or drafted. Everything else — the pipeline, job import, contacts — still works.',
  fields: [
    {
      key: 'apiKey',
      label: 'API key',
      kind: 'secret',
      secret: true,
      placeholder: 'sk-ant-…',
    },
    {
      key: 'model',
      label: 'Model',
      kind: 'model',
      defaultValue: DEFAULT_ANTHROPIC_MODEL,
      help: 'Discovered from the API — never a hardcoded list.',
    },
  ],
  envFallback: 'ANTHROPIC_API_KEY',
}

export const openAiCompatMeta: ProviderMeta = {
  id: 'openai_compat',
  name: 'OpenAI-compatible',
  category: 'llm',
  ship: 'live',
  powers:
    'Alternative to Anthropic — OpenAI, OpenRouter, Groq, Together, Fireworks, DeepSeek, or a local Ollama.',
  getKeyUrl: 'https://platform.openai.com/api-keys',
  steps: [
    'Pick any provider that speaks the OpenAI API format.',
    'Copy its base URL (OpenAI: https://api.openai.com/v1, Ollama: http://localhost:11434/v1).',
    'Paste the base URL and key here — hunt reads the model list from the provider itself.',
  ],
  freeTier:
    'Depends entirely on the provider. A local Ollama is free and never leaves your machine; hosted providers are metered.',
  degradation:
    'Optional if Anthropic is configured. With neither, tailoring, checks, and drafting are unavailable.',
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      kind: 'url',
      placeholder: 'https://api.openai.com/v1',
      help: 'Must include the /v1 path segment.',
    },
    { key: 'apiKey', label: 'API key', kind: 'secret', secret: true },
    {
      key: 'model',
      label: 'Model',
      kind: 'model',
      help: 'Fetched from this provider’s /v1/models endpoint.',
    },
  ],
  envFallback: 'OPENAI_API_KEY',
}
