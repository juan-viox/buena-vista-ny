'use client';

import * as React from 'react';
import { getSelectedModel } from '@viox/ui';

/* ============================================================
   Inline agent chat — same wire contract as CopilotPanel
   ({ messages, persona } → { reply, toolsUsed }) plus the
   agentId and the operator's model pick (ModelPicker in the
   header), rendered in-page instead of as a slide-over.
   ============================================================ */

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  /** Model id the reply was served on (assistant messages). */
  model?: string;
}

/** Agent id → copilot persona focus (owner | gm | chef | events | marketing | staff). */
const AGENT_PERSONA: Record<string, string> = {
  mise: 'chef',
  ledger: 'owner',
  sala: 'gm',
  turno: 'gm',
  fiesta: 'events',
  concierge: 'staff',
  vega: 'marketing',
};

export interface AgentChatProps {
  agentId: string;
  agentName: string;
  /** Accent hex for the agent, used on the send button + chips. */
  color: string;
  samplePrompts: string[];
  endpoint?: string;
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export default function AgentChat({
  agentId,
  agentName,
  color,
  samplePrompts,
  endpoint = '/api/copilot',
}: AgentChatProps) {
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(history);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          agentId,
          persona: AGENT_PERSONA[agentId],
          model: getSelectedModel(agentId),
        }),
      });
      const data = (await res.json()) as { reply?: string; toolsUsed?: string[]; model?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply ?? data.error ?? 'Something went sideways — try again.',
          tools: data.toolsUsed,
          model: data.model,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Could not reach ${agentName}: ${err instanceof Error ? err.message : 'unknown error'}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* transcript */}
      <div ref={scrollRef} className="max-h-[420px] min-h-[220px] space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            You&apos;re talking to {agentName} directly — answers come straight from live operating data. Try one of
            the prompts below or ask your own.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[var(--navy)] text-[var(--text)]'
                  : 'border border-[var(--border)] bg-[var(--panel2)] text-[var(--text)]'
              }`}
            >
              {m.tools && m.tools.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {m.tools.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                      style={{ color, borderColor: rgba(color, 0.35), backgroundColor: rgba(color, 0.08) }}
                    >
                      Checked: {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === 'assistant' && m.model && (
                <div className="mt-1.5 font-mono text-[10px] text-[var(--muted)]">via {m.model}</div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3.5 py-2.5">
              <span className="inline-flex gap-1" aria-label={`${agentName} is thinking`}>
                {['0ms', '150ms', '300ms'].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: color, animationDelay: delay }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* sample prompts */}
      {samplePrompts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
          {samplePrompts.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => void send(p)}
              className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 focus-within:border-[rgba(201,153,92,.5)]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${agentName}…`}
            disabled={busy}
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#0B1120] transition-opacity disabled:opacity-40"
            style={{ backgroundColor: color }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
