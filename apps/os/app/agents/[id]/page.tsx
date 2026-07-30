import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGENTS, getAgent } from '@viox/agents';
import { Badge, Card, Kicker, ModelPicker, PageHeader, fmtDateTime } from '@viox/ui';
import AgentChat from './AgentChat';

/* ============================================================
   Agent detail (OS) — profile header, recent-output timeline,
   and an inline chat wired to /api/copilot. The voice
   concierge additionally shows its ElevenLabs deployment.
   ============================================================ */

export function generateStaticParams() {
  return AGENTS.filter((a) => a.app === 'os' || a.app === 'both').map((a) => ({ id: a.id }));
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/** Relative time vs the demo anchor evening (2026-07-29, 6 PM ET). */
const DEMO_NOW = Date.parse('2026-07-29T18:00:00-04:00');
function relTime(at: string): string {
  const mins = Math.max(1, Math.round((DEMO_NOW - Date.parse(at)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent || agent.app === 'crm') notFound();

  return (
    <>
      <PageHeader
        kicker={
          <span>
            <Link href="/agents" className="transition-colors hover:text-[var(--accent)]">
              AI Team
            </Link>
            {' · '}
            {agent.tagline}
          </span>
        }
        title={
          <span className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base font-bold"
              style={{
                color: agent.color,
                borderColor: rgba(agent.color, 0.35),
                backgroundColor: rgba(agent.color, 0.08),
              }}
              aria-hidden
            >
              {agent.monogram}
            </span>
            {agent.name}
            {agent.voice && <Badge tone="accent">Voice</Badge>}
          </span>
        }
        subtitle={agent.description}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone="good">Active</Badge>
            <ModelPicker agentId={agent.id} defaultModel={agent.model} compact />
            {agent.tools.map((t) => (
              <Badge key={t} tone="muted" className="font-mono !text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        {/* ---------- left: voice deployment + output timeline ---------- */}
        <div className="space-y-4 xl:col-span-2">
          {agent.voice && (
            <Card kicker="Voice deployment" title="Live on the phone & web">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[var(--muted)]">Provider</span>
                  <Badge tone="accent">ElevenLabs Conversational AI</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[var(--muted)]">Agent ID</span>
                  <span className="truncate font-mono text-xs text-[var(--text)]">{agent.voice.agentId}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[var(--muted)]">Web widget</span>
                  <a
                    href="https://buena-vista-ny.vercel.app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--text)]"
                  >
                    buena-vista-ny.vercel.app →
                  </a>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[var(--muted)]">Phone line</span>
                  <Badge tone="warn">Pending Twilio</Badge>
                </div>
                <div className="border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
                  Status: {agent.voice.status}. Captured reservation requests land in VioX CRM → Reservations with
                  guest name, party size and occasion attached.
                </div>
              </div>
            </Card>
          )}

          <Card kicker="Work log" title="Recent outputs" action={<span>last 48h</span>} flush>
            <div className="divide-y divide-[var(--border)]">
              {agent.recentOutputs.map((out) => (
                <div key={out.title} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-[var(--text)]">{out.title}</div>
                    <span
                      className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]"
                      title={fmtDateTime(out.at)}
                    >
                      {relTime(out.at)}
                    </span>
                  </div>
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[var(--muted)]">
                    {out.body}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ---------- right: inline chat ---------- */}
        <Card
          kicker="Direct line"
          title={`Chat with ${agent.name}`}
          action={<span>grounded in live data</span>}
          className="xl:col-span-3"
        >
          <AgentChat
            agentId={agent.id}
            agentName={agent.name}
            color={agent.color}
            samplePrompts={agent.samplePrompts}
          />
        </Card>
      </div>
    </>
  );
}
