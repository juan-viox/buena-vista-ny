import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AGENTS, getAgent } from '@viox/agents';
import { Badge, Card, ModelPicker, PageHeader, fmtDateTime } from '@viox/ui';
import { AgentChat } from './AgentChat';

export function generateStaticParams() {
  return AGENTS.filter((a) => a.app === 'crm' || a.app === 'both').map((a) => ({ id: a.id }));
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent || agent.app === 'os') notFound();

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/agents" className="hover:text-[var(--accent)]">
            AI Team
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-base font-semibold"
              style={{
                color: agent.color,
                borderColor: `${agent.color}59`,
                backgroundColor: `${agent.color}14`,
              }}
              aria-hidden
            >
              {agent.monogram}
            </span>
            {agent.name}
            <span className="text-sm font-normal text-[var(--muted)]">{agent.tagline}</span>
          </span>
        }
        subtitle={agent.description}
        actions={
          <div className="flex items-center gap-2">
            {agent.voice && <Badge tone="good">Voice live</Badge>}
            <ModelPicker agentId={agent.id} defaultModel={agent.model} compact />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chat + recent outputs */}
        <div className="space-y-4 lg:col-span-2">
          <Card flush kicker="Ask the agent" title={`Chat with ${agent.name}`}>
            <AgentChat
              agentId={agent.id}
              agentName={agent.name}
              color={agent.color}
              monogram={agent.monogram}
              suggestedPrompts={agent.samplePrompts}
            />
          </Card>

          <Card flush kicker="Work log" title="Recent outputs">
            <ul>
              {agent.recentOutputs.map((o) => (
                <li
                  key={`${o.title}-${o.at}`}
                  className="border-b border-[var(--border)] px-5 py-4 last:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="text-sm font-medium text-[var(--text)]">{o.title}</div>
                    <div className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{fmtDateTime(o.at)}</div>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{o.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Profile rail */}
        <div className="space-y-4">
          {agent.voice && (
            <Card kicker="Voice channel" title="ElevenLabs agent">
              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Status</dt>
                  <dd className="mt-0.5">
                    <Badge tone="good">{agent.voice.status}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Agent ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-[var(--text)]">{agent.voice.agentId}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Deployment</dt>
                  <dd className="mt-0.5 text-xs text-[var(--muted)]">{agent.voice.label}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
                Captured reservation requests post to <span className="font-mono">/api/voice/reservation</span> and
                land in the{' '}
                <Link href="/reservations" className="font-medium text-[var(--accent)] hover:underline">
                  Reservations incoming inbox
                </Link>
                .
              </p>
            </Card>
          )}

          <Card kicker="Tool belt" title="Data access">
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((t) => (
                <Badge key={t} tone="muted" className="tabular-nums">
                  {t}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Every answer is grounded in these repository tools — {agent.name} never invents a number.
            </p>
          </Card>

          <Card kicker="Try asking" title="Sample prompts">
            <ul className="space-y-2">
              {agent.samplePrompts.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: agent.color }}
                    aria-hidden
                  />
                  {p}
                </li>
              ))}
            </ul>
          </Card>

          <Card kicker="Scope" title="Where this agent runs">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Badge tone={agent.app === 'both' ? 'info' : 'accent'}>
                {agent.app === 'both' ? 'OS + CRM' : agent.app.toUpperCase()}
              </Badge>
              <span>
                {agent.app === 'both'
                  ? 'Shared across the operating and guest sides.'
                  : 'Dedicated to the guest & growth side.'}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
