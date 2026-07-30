'use client';

// ============================================================
// AutomationCards — client card grid for /automations. Enabled
// toggles + last-run overrides are demo state persisted in this
// browser's localStorage; "Run now" (Birthday + Winback) calls
// the runAutomationNow server action, which runs the same engine
// as the secret-gated /api/automations/run route. Live sends are
// allowlist-fenced server-side — a click here never contacts a
// fixture guest.
// ============================================================

import * as React from 'react';
import { Badge, Card, Kicker, fmtDateTime, fmtNumber } from '@viox/ui';
import { runAutomationNow } from './actions';

export interface AutomationCardData {
  id: string;
  name: string;
  trigger: string;
  cadence: string;
  channels: ('sms' | 'email')[];
  audience: number;
  runnable: boolean;
  /** Deterministic demo "last run" (ISO) — overridden after a real run. */
  seededLastRun: string;
  /** Audience guest the preview is rendered for (null when audience is empty). */
  sampleGuest: string | null;
  /** Exact rendered SMS body from the workflow template lane. */
  preview: string | null;
}

const STORAGE_KEY = 'bv-crm-automations-v1';

/** waitlist follow-up ships toggled off — no live waitlist in demo mode. */
const DEFAULT_ENABLED: Record<string, boolean> = { waitlist_followup: false };

interface StoredState {
  enabled?: Record<string, boolean>;
  lastRun?: Record<string, string>;
}

function loadStored(): StoredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStored(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode — demo state just won't persist */
  }
}

interface RunFeedback {
  tone: 'good' | 'warn' | 'bad';
  message: string;
}

export function AutomationCards({ cards }: { cards: AutomationCardData[] }) {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = React.useState<Record<string, string>>({});
  const [hydrated, setHydrated] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Record<string, RunFeedback>>({});
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    const stored = loadStored();
    setEnabled(stored.enabled ?? {});
    setLastRun(stored.lastRun ?? {});
    setHydrated(true);
  }, []);

  const isEnabled = (id: string) => enabled[id] ?? DEFAULT_ENABLED[id] ?? true;

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !isEnabled(id) };
      saveStored({ enabled: next, lastRun });
      return next;
    });
  };

  const runNow = (id: string) => {
    setRunningId(id);
    setFeedback((f) => ({ ...f, [id]: { tone: 'warn', message: 'Running…' } }));
    startTransition(async () => {
      try {
        const res = await runAutomationNow(id, false);
        if (!res.ok || !res.result) {
          setFeedback((f) => ({ ...f, [id]: { tone: 'bad', message: res.error ?? 'Run failed.' } }));
        } else {
          const r = res.result;
          const bits = [
            `audience ${fmtNumber(r.audience)}`,
            `sent ${fmtNumber(r.sent)}`,
            `${fmtNumber(r.skippedByAllowlist)} fenced by test-user allowlist`,
          ];
          if (r.failed > 0) bits.push(`${fmtNumber(r.failed)} failed`);
          setFeedback((f) => ({
            ...f,
            [id]: { tone: r.failed > 0 ? 'warn' : 'good', message: `Run complete — ${bits.join(' · ')}.` },
          }));
          const now = new Date().toISOString();
          setLastRun((prev) => {
            const next = { ...prev, [id]: now };
            saveStored({ enabled, lastRun: next });
            return next;
          });
        }
      } catch {
        setFeedback((f) => ({ ...f, [id]: { tone: 'bad', message: 'Run failed — check server logs.' } }));
      } finally {
        setRunningId(null);
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {cards.map((card) => {
        const on = isEnabled(card.id);
        const fb = feedback[card.id];
        const lastRunAt = lastRun[card.id] ?? card.seededLastRun;
        return (
          <Card
            key={card.id}
            kicker={card.cadence}
            title={card.name}
            action={
              <label className="flex cursor-pointer items-center gap-2" onClick={() => toggle(card.id)}>
                <span className={`text-[11px] font-medium ${on ? 'text-[var(--good)]' : 'text-[var(--muted)]'}`}>
                  {hydrated ? (on ? 'On' : 'Paused') : '…'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${card.name} ${on ? 'enabled' : 'paused'}`}
                  className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                    on
                      ? 'border-[rgba(212,164,55,.6)] bg-[rgba(212,164,55,.85)]'
                      : 'border-[var(--border)] bg-[rgba(143,163,192,.25)]'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow transition-transform ${
                      on ? 'translate-x-[19px]' : 'translate-x-[3px]'
                    }`}
                    aria-hidden
                  />
                </button>
              </label>
            }
          >
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">{card.trigger}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {card.channels.includes('sms') && <Badge tone="info">SMS</Badge>}
              {card.channels.includes('email') && <Badge tone="accent">Email</Badge>}
              <Badge tone="muted">
                {fmtNumber(card.audience)} guest{card.audience === 1 ? '' : 's'} in audience
              </Badge>
            </div>

            {card.preview && (
              <div className="mt-3.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3.5 py-3">
                <Kicker>
                  Rendered message · SMS{card.sampleGuest ? ` · to ${card.sampleGuest}` : ''}
                </Kicker>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text)]">
                  {card.preview}
                </p>
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <span className="text-[11px] text-[var(--muted)]">
                Last run <span className="tabular-nums">{fmtDateTime(lastRunAt)}</span>
              </span>
              {card.runnable && (
                <button
                  type="button"
                  disabled={runningId !== null}
                  onClick={() => runNow(card.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-3 py-1.5 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PlayIcon />
                  {runningId === card.id ? 'Running…' : 'Run now'}
                </button>
              )}
            </div>

            {fb && (
              <p
                className={`mt-2 text-[11px] leading-relaxed ${
                  fb.tone === 'good'
                    ? 'text-[var(--good)]'
                    : fb.tone === 'warn'
                      ? 'text-[var(--warn)]'
                      : 'text-[var(--bad)]'
                }`}
                role="status"
              >
                {fb.message}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M3.2 1.8v8.4l6.6-4.2-6.6-4.2Z" />
    </svg>
  );
}
