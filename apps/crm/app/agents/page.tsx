import * as React from 'react';
import Link from 'next/link';
import { AGENTS, type AgentDef } from '@viox/agents';
import { Badge, Card, PageHeader } from '@viox/ui';

export const metadata = {
  title: 'AI Team — VioX CRM',
};

/* ---------- helpers ---------- */

function crmAgents(): AgentDef[] {
  const roster = AGENTS.filter((a) => a.app === 'crm' || a.app === 'both');
  // Concierge leads the CRM story (live capture), then events, then growth.
  const order = ['concierge', 'fiesta', 'vega'];
  return roster.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

function Monogram({ agent, size = 'md' }: { agent: AgentDef; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-10 w-10 text-base';
  return (
    <span
      className={`flex ${dims} shrink-0 items-center justify-center rounded-xl border font-semibold`}
      style={{
        color: agent.color,
        borderColor: `${agent.color}59`,
        backgroundColor: `${agent.color}14`,
      }}
      aria-hidden
    >
      {agent.monogram}
    </span>
  );
}

function FlowStep({ label, sub, accent = false }: { label: string; sub: string; accent?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3.5 py-2.5 ${
        accent
          ? 'border-[rgba(201,153,92,.45)] bg-[rgba(201,153,92,.08)]'
          : 'border-[var(--border)] bg-[var(--panel2)]'
      }`}
    >
      <div className={`truncate text-xs font-semibold ${accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
        {label}
      </div>
      <div className="truncate text-[10px] uppercase tracking-[.1em] text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-[var(--accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12h15M14 6.5 19.5 12 14 17.5" />
    </svg>
  );
}

/* ---------- page ---------- */

export default function AgentsPage() {
  const roster = crmAgents();
  const concierge = roster.find((a) => a.id === 'concierge');
  const rest = roster.filter((a) => a.id !== 'concierge');

  return (
    <>
      <PageHeader
        kicker="AI Team"
        title="Agents"
        subtitle="The guest-side AI staff for Buena Vista — the voice concierge on the phones and the widget, the events coordinator on the pipeline, and the growth analyst on the guest file."
        actions={<Badge tone="accent">{roster.length} agents on the CRM</Badge>}
      />

      {/* Voice concierge spotlight — the live capture flow */}
      {concierge && (
        <Card
          kicker="Voice Concierge · Live"
          title={
            <span className="flex items-center gap-2">
              {concierge.name}
              <span className="text-xs font-normal text-[var(--muted)]">{concierge.tagline}</span>
            </span>
          }
          action={
            concierge.voice ? <Badge tone="good">{concierge.voice.status}</Badge> : undefined
          }
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <Monogram agent={concierge} size="lg" />
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-[var(--muted)]">{concierge.description}</p>
                {concierge.voice && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--text)]">ElevenLabs</span> ·{' '}
                    <span className="tabular-nums">{concierge.voice.agentId}</span> · {concierge.voice.label}
                  </p>
                )}
                <div className="mt-3">
                  <Link
                    href={`/agents/${concierge.id}`}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Open agent profile →
                  </Link>
                </div>
              </div>
            </div>

            {/* Capture flow diagram: widget/phone → agent → webhook → CRM */}
            <div className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-4 lg:w-[440px]">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                Reservation capture flow
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FlowStep label="Web widget / phone" sub="Guest asks for a table" />
                <FlowArrow />
                <FlowStep label="Anfitrión" sub="ElevenLabs voice agent" accent />
                <FlowArrow />
                <FlowStep label="POST /api/voice/reservation" sub="Signed webhook" />
                <FlowArrow />
                <FlowStep label="This CRM" sub="Reservations · incoming inbox" accent />
              </div>
              <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
                Captured requests land in{' '}
                <Link href="/reservations" className="font-medium text-[var(--accent)] hover:underline">
                  Reservations → Incoming
                </Link>{' '}
                tagged <Badge tone="warn">New</Badge> for the host team to confirm.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Rest of the roster */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rest.map((agent) => (
          <Card key={agent.id} className="transition-colors hover:border-[rgba(201,153,92,.35)]">
            <div className="flex items-start gap-4">
              <Monogram agent={agent} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {agent.name}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{agent.tagline}</span>
                  {agent.app === 'both' && <Badge tone="info">OS + CRM</Badge>}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{agent.description}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="accent" className="tabular-nums">
                    {agent.model}
                  </Badge>
                  {agent.tools.map((t) => (
                    <Badge key={t} tone="muted" className="tabular-nums">
                      {t}
                    </Badge>
                  ))}
                </div>

                {agent.recentOutputs[0] && (
                  <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Latest output</div>
                    <div className="mt-0.5 truncate text-xs font-medium text-[var(--text)]">
                      {agent.recentOutputs[0].title}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Open agent →
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
