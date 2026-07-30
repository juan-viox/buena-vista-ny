// ============================================================
// @viox/agents — the model catalog. Any AI-team agent can run
// on any of these: Anthropic direct, or via one of the
// OpenAI-compatible providers (OpenRouter, DeepSeek, Ollama Cloud).
// Keep the UI copy in packages/ui/src/ModelPicker.tsx in sync.
// ============================================================

export interface ModelOption {
  id: string;
  label: string;
  provider: 'anthropic' | 'openrouter' | 'deepseek' | 'ollama';
  tier: 'flagship' | 'balanced' | 'fast' | 'frontier';
  note: string;
}

/** OpenAI-compatible provider endpoints + the env var holding each key. */
export type OpenAICompatProvider = Exclude<ModelOption['provider'], 'anthropic'>;

export interface ProviderConfig {
  baseUrl: string;
  envKey: string;
}

export const PROVIDER_CONFIG: Record<OpenAICompatProvider, ProviderConfig> = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', envKey: 'DEEPSEEK_API_KEY' },
  ollama: { baseUrl: 'https://ollama.com/v1', envKey: 'OLLAMA_API_KEY' },
};

export const MODEL_CATALOG: ModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic', tier: 'balanced', note: 'Default — sharp operator judgment' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic', tier: 'flagship', note: 'Deepest reasoning for costing & strategy' },
  { id: 'anthropic/claude-fable-5', label: 'Claude Fable 5', provider: 'openrouter', tier: 'flagship', note: 'Anthropic frontier via OpenRouter' },
  { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'openrouter', tier: 'balanced', note: 'OpenAI all-rounder' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openrouter', tier: 'fast', note: 'Quick drafts & summaries' },
  { id: 'google/gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'openrouter', tier: 'fast', note: 'Cheapest sweeps — inventory checks, digests' },
  { id: 'x-ai/grok-4.5', label: 'Grok 4.5', provider: 'openrouter', tier: 'frontier', note: 'xAI frontier' },
  { id: 'moonshotai/kimi-k3', label: 'Kimi K3', provider: 'openrouter', tier: 'frontier', note: 'Long-context analysis' },
  { id: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max', provider: 'openrouter', tier: 'balanced', note: 'Strong multilingual (ES) support' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'deepseek', tier: 'fast', note: 'Ultra-cheap rapid analysis' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', provider: 'deepseek', tier: 'frontier', note: 'Deep reasoning at low cost' },
  { id: 'gpt-oss:120b', label: 'GPT-OSS 120B', provider: 'ollama', tier: 'balanced', note: 'Open-source flagship on Ollama Cloud' },
  { id: 'glm-5.2', label: 'GLM-5.2', provider: 'ollama', tier: 'balanced', note: 'Zhipu frontier open model' },
  { id: 'minimax-m3', label: 'MiniMax M3', provider: 'ollama', tier: 'fast', note: 'Fast open model for drafts' },
];

/** Resolve a model id to a catalog entry. Unknown/missing ids fall back to the default (catalog[0]). */
export function resolveModel(id?: string): ModelOption {
  if (!id) return MODEL_CATALOG[0];
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG[0];
}
