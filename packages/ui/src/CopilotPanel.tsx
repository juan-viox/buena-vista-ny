'use client';

import * as React from 'react';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  /** Friendly tool labels used for this reply, e.g. ["sales summary"]. */
  tools?: string[];
}

export interface CopilotPanelProps {
  /** POST endpoint. Default "/api/copilot". */
  endpoint?: string;
  title?: string;
  /** Persona id forwarded with each request. */
  persona?: string;
  suggestedPrompts?: string[];
  /** Label on the topbar trigger button. Default "Copilot". */
  buttonLabel?: string;
  /** AI-team agent id forwarded with each request — scopes persona + tools server-side. */
  agentId?: string;
  /** Agent display name; when given it replaces the header title. */
  agentName?: string;
  /** Accent color override (hex) — remaps --accent inside the trigger + panel. */
  accentColor?: string;
}

/**
 * Slide-over copilot chat. Renders its own topbar trigger button.
 * Posts { messages, persona, agentId } to the endpoint; accepts either
 * a JSON body ({ reply, toolsUsed }) or a streamed text response.
 */
export function CopilotPanel({
  endpoint = '/api/copilot',
  title = 'VioX Copilot',
  persona,
  suggestedPrompts = [],
  buttonLabel = 'Copilot',
  agentId,
  agentName,
  accentColor,
}: CopilotPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const heading = agentName ?? title;
  // Remap the accent token locally so agent-tinted UI needs no extra classes.
  const accentStyle = accentColor
    ? ({ '--accent': accentColor } as React.CSSProperties)
    : undefined;

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
          persona,
          agentId,
        }),
      });
      const ctype = res.headers.get('content-type') ?? '';
      if (ctype.includes('application/json')) {
        const data = (await res.json()) as { reply?: string; toolsUsed?: string[]; error?: string };
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply ?? data.error ?? 'Something went sideways — try again.',
            tools: data.toolsUsed,
          },
        ]);
      } else if (res.body) {
        // Streamed text — append incrementally.
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const snapshot = acc;
          setMessages((prev) => {
            const next = prev.slice(0, -1);
            return [...next, { role: 'assistant', content: snapshot }];
          });
        }
      } else {
        throw new Error(`Unexpected response (${res.status})`);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Could not reach the copilot: ${err instanceof Error ? err.message : 'unknown error'}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={accentStyle}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.08)] px-3.5 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[rgba(201,153,92,.16)]"
      >
        <SparkIcon />
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label={heading}
            style={accentStyle}
            className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-[var(--border)] bg-[var(--panel2)] shadow-2xl"
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.1)] text-[var(--accent)]">
                  <SparkIcon />
                </span>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{heading}</div>
                  <div className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Buena Vista · both locations</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close copilot"
                className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-white/[.05] hover:text-[var(--text)]"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted)]">
                    Ask about sales, food cost, low stock, the events pipeline, guests or campaigns — answers come
                    straight from your live operating data.
                  </p>
                  {suggestedPrompts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {suggestedPrompts.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => void send(p)}
                          className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] hover:text-[var(--accent)]"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[var(--navy)] text-[var(--text)]'
                        : 'border border-[var(--border)] bg-[var(--panel)] text-[var(--text)]'
                    }`}
                  >
                    {m.tools && m.tools.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {m.tools.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-full border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.08)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                          >
                            <CheckIcon />
                            Checked: {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5">
                    <span className="inline-flex gap-1" aria-label="Thinking">
                      <Dot delay="0ms" />
                      <Dot delay="150ms" />
                      <Dot delay="300ms" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              className="shrink-0 border-t border-[var(--border)] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 focus-within:border-[rgba(201,153,92,.5)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your copilot…"
                  disabled={busy}
                  className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] transition-opacity disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]"
      style={{ animationDelay: delay }}
    />
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9 12 3.5Z" />
      <path d="M18.5 3.5v3M17 5h3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
    </svg>
  );
}
