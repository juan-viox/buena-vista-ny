import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AGENTS, type AgentDef } from '@viox/agents';
import { Badge, Card, Kicker, PageHeader } from '@viox/ui';

export const metadata: Metadata = {
  title: 'AI Team — VioX AI OS',
};

/* ============================================================
   AI Team roster (OS) — every agent scoped to the operator
   backend (app: 'os' | 'both'), with the voice concierge
   surfaced alongside the analysts.
   ============================================================ */

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export default function AgentsPage() {
  const roster = AGENTS.filter((a) => a.app === 'os' || a.app === 'both');
  const toolCount = new Set(AGENTS.flatMap((a) => a.tools)).size;

  return (
    <>
      <PageHeader
        kicker="AI Team · Buena Vista"
        title="AI Team"
        subtitle="Seven specialists working your numbers around the clock — each one wired to live operating data, each one accountable for a lane."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="accent">{AGENTS.length} agents</Badge>
            <Badge tone="good">24/7</Badge>
            <Badge tone="info">{toolCount} tools wired</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {roster.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </>
  );
}

function AgentCard({ agent }: { agent: AgentDef }) {
  const latest = agent.recentOutputs[0];
  return (
    <Card flush className="flex flex-col">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <MonogramDisc color={agent.color} text={agent.monogram} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--text)]">{agent.name}</span>
              {agent.voice && (
                <Badge tone="accent" className="shrink-0">
                  <VoiceIcon />
                  Voice
                </Badge>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{agent.tagline}</div>
          </div>
        </div>
        <Badge tone="good" className="mt-0.5 shrink-0">
          Active
        </Badge>
      </div>

      {/* description */}
      <p className="px-5 pt-3 text-xs leading-relaxed text-[var(--muted)]">{agent.description}</p>

      {agent.voice && (
        <p className="mx-5 mt-3 rounded-lg border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.06)] px-3 py-2 text-xs text-[var(--accent)]">
          {agent.voice.status} · {agent.voice.label}
        </p>
      )}

      {/* tools */}
      <div className="px-5 pt-4">
        <Kicker>Tools</Kicker>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agent.tools.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--border)] bg-white/[.03] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* latest output */}
      {latest && (
        <div className="mx-5 mb-4 mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3.5 py-3">
          <Kicker>Latest output</Kicker>
          <div className="mt-1 text-xs font-medium text-[var(--text)]">{latest.title}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{latest.body}</p>
        </div>
      )}

      {/* footer */}
      <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="font-mono text-[10px] text-[var(--muted)]">{agent.model}</span>
        <Link
          href={`/agents/${agent.id}`}
          className="text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--text)]"
        >
          Open agent →
        </Link>
      </div>
    </Card>
  );
}

function MonogramDisc({ color, text }: { color: string; text: string }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
      style={{ color, borderColor: rgba(color, 0.35), backgroundColor: rgba(color, 0.08) }}
      aria-hidden
    >
      {text}
    </div>
  );
}

function VoiceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
