'use client';

// ============================================================
// Inline agent chat — same wire contract as the shared copilot
// route ({ messages } in, { reply, toolsUsed } out) plus the
// agentId so the backend can scope tools per agent.
// ============================================================

import * as React from 'react';
import { getSelectedModel } from '@viox/ui';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  /** Model id the reply was served on (assistant messages). */
  model?: string;
}

export interface AgentChatProps {
  agentId: string;
  agentName: string;
  /** Agent accent color (hex) for the avatar + send button. */
  color: string;
  monogram: string;
  suggestedPrompts?: string[];
  /** POST endpoint. Default "/api/copilot". */
  endpoint?: string;
}

export function AgentChat({
  agentId,
  agentName,
  color,
  monogram,
  suggestedPrompts = [],
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
      {/* Messages */}
      <div ref={scrollRef} className="max-h-[420px] min-h-[220px] space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Chat with {agentName} — answers come straight from the live operating data through the agent&apos;s
              tool belt.
            </p>
            {suggestedPrompts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestedPrompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void send(p)}
                    className="rounded-full border border-[var(--border)] bg-[var(--panel2)] px-3 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] hover:text-[var(--accent)]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2.5'}>
            {m.role === 'assistant' && (
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] font-semibold"
                style={{ color, borderColor: `${color}59`, backgroundColor: `${color}14` }}
                aria-hidden
              >
                {monogram}
              </span>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
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
                      className="inline-flex items-center gap-1 rounded-full border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.08)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
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
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] font-semibold"
              style={{ color, borderColor: `${color}59`, backgroundColor: `${color}14` }}
              aria-hidden
            >
              {monogram}
            </span>
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

      {/* Composer */}
      <form
        className="border-t border-[var(--border)] p-3"
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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--accent-ink)] transition-opacity disabled:opacity-40"
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
