'use client';

import * as React from 'react';

/* ============================================================
   ModelPicker — per-agent LLM selector. Persists the choice to
   localStorage ('viox-model:<agentId>'), mirrors it onto a data
   attribute, and broadcasts a 'viox-model-change' CustomEvent.
   Chat components read the current pick per send via
   getSelectedModel(agentId).
   NOTE: catalog data mirrors packages/agents/src/models.ts —
   keep the two lists in sync.
   ============================================================ */

interface PickerModel {
  id: string;
  label: string;
  provider: 'anthropic' | 'openrouter' | 'deepseek' | 'ollama';
  tier: 'flagship' | 'balanced' | 'fast' | 'frontier';
  note: string;
}

const MODELS: PickerModel[] = [
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

const TIERS = ['flagship', 'balanced', 'fast', 'frontier'] as const;
const TIER_LABEL: Record<(typeof TIERS)[number], string> = {
  flagship: 'Flagship',
  balanced: 'Balanced',
  fast: 'Fast',
  frontier: 'Frontier',
};

/** Options group by provider in this order. */
const PROVIDERS = ['anthropic', 'openrouter', 'deepseek', 'ollama'] as const;
const PROVIDER_GROUP_LABEL: Record<PickerModel['provider'], string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  ollama: 'Ollama Cloud',
};

/** ANTHROPIC gold / OPENROUTER sky / DEEPSEEK --good green / OLLAMA --muted slate. */
const PROVIDER_STYLE: Record<PickerModel['provider'], { label: string; color: string }> = {
  anthropic: { label: 'ANTHROPIC', color: '#C9995C' },
  openrouter: { label: 'OPENROUTER', color: '#7EB2F5' },
  deepseek: { label: 'DEEPSEEK', color: '#34D399' },
  ollama: { label: 'OLLAMA', color: '#8FA3C0' },
};

const storageKey = (agentId: string) => `viox-model:${agentId}`;

/**
 * Current model selection for an agent (SSR-safe). Chat components call this
 * per send; returns undefined on the server or when nothing was picked yet.
 */
export function getSelectedModel(agentId: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(storageKey(agentId)) ?? undefined;
  } catch {
    return undefined;
  }
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export interface ModelPickerProps {
  agentId: string;
  /** Agent's default model id (AgentDef.model). */
  defaultModel: string;
  /** Tighter layout for page-header placement (hides the note line). */
  compact?: boolean;
}

export function ModelPicker({ agentId, defaultModel, compact = false }: ModelPickerProps) {
  const fallback = MODELS.some((m) => m.id === defaultModel) ? defaultModel : MODELS[0].id;
  const [selected, setSelected] = React.useState(fallback);

  // Hydrate the persisted pick after mount (SSR-safe).
  React.useEffect(() => {
    const stored = getSelectedModel(agentId);
    if (stored && MODELS.some((m) => m.id === stored)) setSelected(stored);
  }, [agentId]);

  const apply = (id: string) => {
    setSelected(id);
    try {
      window.localStorage.setItem(storageKey(agentId), id);
    } catch {
      // Private mode / storage full — the in-memory pick still applies this session.
    }
    window.dispatchEvent(new CustomEvent('viox-model-change', { detail: { agentId, model: id } }));
  };

  const current = MODELS.find((m) => m.id === selected) ?? MODELS[0];
  const provider = PROVIDER_STYLE[current.provider];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? '' : 'flex-wrap'}`}
      data-agent-id={agentId}
      data-selected-model={selected}
    >
      <span
        className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-[.08em]"
        style={{ color: provider.color, borderColor: rgba(provider.color, 0.4), backgroundColor: rgba(provider.color, 0.08) }}
      >
        {provider.label}
      </span>
      <select
        value={selected}
        onChange={(e) => apply(e.target.value)}
        aria-label="Model"
        className={`max-w-[180px] cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--panel2)] font-mono text-[var(--text)] outline-none transition-colors focus:border-[rgba(201,153,92,.5)] ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        }`}
      >
        {PROVIDERS.map((p) => (
          <optgroup key={p} label={PROVIDER_GROUP_LABEL[p]}>
            {MODELS.filter((m) => m.provider === p).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {TIER_LABEL[m.tier]} — {m.note}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {!compact && <span className="text-[10px] text-[var(--muted)]">{current.note}</span>}
    </span>
  );
}
