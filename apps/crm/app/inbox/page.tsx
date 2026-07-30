// ============================================================
// /inbox — unified guest message log. Server component merges
// sms_log + email_log via plain PostgREST (no-store), newest
// first: channel icons (SMS / EMAIL), direction badges (inbound
// highlighted), workflow-kind chips, guest phone/email and a
// preview of each message. Missing tables fail soft to an empty
// feed so the page works before the migrations land.
// ============================================================

import * as React from 'react';
import { Badge, Card, EmptyState, PageHeader, Stat, StatRow } from '@viox/ui';

export const dynamic = 'force-dynamic';

const TENANT_SLUG = 'buena-vista';
const FEED_LIMIT = 100;

// ---------- rows ----------

interface SmsLogRow {
  id: string | number;
  to_phone: string | null;
  body: string | null;
  kind: string | null;
  status: string | null;
  created_at: string | null;
}

interface EmailLogRow {
  id: string | number;
  to_email: string | null;
  subject: string | null;
  body_preview: string | null;
  kind: string | null;
  direction: string | null;
  status: string | null;
  created_at: string | null;
}

interface Message {
  id: string;
  channel: 'sms' | 'email';
  direction: 'inbound' | 'outbound';
  /** Guest phone (SMS) or email address. */
  contact: string;
  kind: string;
  subject?: string;
  preview: string;
  status: string;
  createdAt: string;
}

type InboxFeed =
  | { configured: false }
  | { configured: true; error: true }
  | { configured: true; error?: false; messages: Message[] };

// ---------- fetch + merge ----------

async function fetchTable<T>(base: string, headers: Record<string, string>, path: string): Promise<T[]> {
  try {
    const res = await fetch(`${base}/${path}`, { headers, cache: 'no-store' });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Table may not exist yet — treat as empty, not an error.
      if (res.status !== 404 && !detail.includes('42P01')) {
        console.error('[inbox] feed fetch failed', path, res.status, detail.slice(0, 200));
      }
      return [];
    }
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[inbox] feed fetch error', path, err);
    return [];
  }
}

async function fetchInbox(): Promise<InboxFeed> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { configured: false };
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const [sms, email] = await Promise.all([
      fetchTable<SmsLogRow>(
        base,
        headers,
        `sms_log?tenant_slug=eq.${TENANT_SLUG}&select=id,to_phone,body,kind,status,created_at&order=created_at.desc&limit=${FEED_LIMIT}`,
      ),
      fetchTable<EmailLogRow>(
        base,
        headers,
        `email_log?tenant_slug=eq.${TENANT_SLUG}&select=id,to_email,subject,body_preview,kind,direction,status,created_at&order=created_at.desc&limit=${FEED_LIMIT}`,
      ),
    ]);

    const messages: Message[] = [
      ...sms.map(
        (r): Message => ({
          id: `sms_${r.id}`,
          channel: 'sms',
          direction: 'outbound', // sms_log is outbound-only today
          contact: r.to_phone ?? '—',
          kind: r.kind ?? 'sms',
          preview: r.body ?? '',
          status: r.status ?? 'sent',
          createdAt: r.created_at ?? '',
        }),
      ),
      ...email.map(
        (r): Message => ({
          id: `email_${r.id}`,
          channel: 'email',
          direction: r.direction === 'inbound' ? 'inbound' : 'outbound',
          contact: r.to_email ?? '—',
          kind: r.kind ?? 'email',
          subject: r.subject ?? undefined,
          preview: r.body_preview ?? '',
          status: r.status ?? 'sent',
          createdAt: r.created_at ?? '',
        }),
      ),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    return { configured: true, messages };
  } catch (err) {
    console.error('[inbox] feed error', err);
    return { configured: true, error: true };
  }
}

// ---------- stats ----------

function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

// ---------- formatting ----------

function fmtWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function kindLabel(kind: string): string {
  const words = kind.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'muted'> = {
  sent: 'good',
  delivered: 'good',
  received: 'info',
  failed: 'bad',
  bounced: 'bad',
  complained: 'warn',
};

// ---------- page ----------

export default async function InboxPage() {
  const feed = await fetchInbox();
  const messages = feed.configured && !feed.error ? feed.messages : [];

  const sentToday = messages.filter((m) => m.direction === 'outbound' && isToday(m.createdAt)).length;
  const delivered = messages.filter(
    (m) => m.direction === 'outbound' && (m.status === 'sent' || m.status === 'delivered'),
  ).length;
  const inboundAwaiting = messages.filter((m) => m.direction === 'inbound').length;

  return (
    <>
      <PageHeader
        kicker="Guests"
        title="Inbox — Guest messages"
        subtitle="Every workflow SMS and concierge email in one stream — confirmations, waitlist texts and inbound guest replies across both locations."
        actions={
          feed.configured ? (
            <Badge tone="good">Live · SMS + Email</Badge>
          ) : (
            <Badge tone="muted">Not configured</Badge>
          )
        }
      />

      {!feed.configured ? (
        <div className="mt-6 rounded-xl border border-[rgba(126,178,245,.35)] bg-[rgba(126,178,245,.06)] px-4 py-3 text-sm text-[var(--text)]">
          <div className="font-medium text-[#7EB2F5]">Unified inbox not configured</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read the sms_log and email_log tables. Outbound
            workflow texts (Twilio) and concierge emails (Resend) log themselves here automatically; guest email
            replies arrive via the /api/email/inbound webhook.
          </p>
        </div>
      ) : feed.error ? (
        <div className="mt-6 rounded-xl border border-[rgba(251,191,36,.35)] bg-[rgba(251,191,36,.06)] px-4 py-3 text-sm text-[var(--text)]">
          <div className="font-medium text-[var(--warn)]">Inbox unreachable</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Could not reach the message log tables just now — refresh to retry.
          </p>
        </div>
      ) : (
        <>
          <StatRow cols={3} className="mt-6">
            <Stat label="Sent today" value={sentToday} hint="Outbound SMS + email in the last day" />
            <Stat label="Delivered" value={delivered} hint="Outbound messages sent or delivered" />
            <Stat
              label="Inbound awaiting reply"
              value={inboundAwaiting}
              highlight={inboundAwaiting > 0}
              hint="Guest email replies — answer from the concierge address"
            />
          </StatRow>

          <Card className="mt-4" flush title="Message stream" kicker="Newest first">
            {messages.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title="No messages yet"
                  message="Workflow texts and concierge emails will appear here the moment the first reservation request comes in."
                />
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`flex items-start gap-3 px-5 py-3.5 ${
                      m.direction === 'inbound' ? 'bg-[rgba(126,178,245,.05)]' : ''
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        m.channel === 'email'
                          ? 'border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.08)] text-[var(--accent)]'
                          : 'border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.08)] text-[var(--good)]'
                      }`}
                      title={m.channel === 'email' ? 'Email' : 'SMS'}
                    >
                      {m.channel === 'email' ? <MailIcon /> : <SmsIcon />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text)]">{m.contact}</span>
                        <Badge tone={m.direction === 'inbound' ? 'info' : 'muted'}>
                          {m.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                        </Badge>
                        <Badge tone="accent">{kindLabel(m.kind)}</Badge>
                        <Badge tone={STATUS_TONE[m.status] ?? 'muted'}>{kindLabel(m.status)}</Badge>
                      </div>
                      {m.subject && (
                        <div className="mt-1 truncate text-[13px] font-medium text-[var(--text)]">{m.subject}</div>
                      )}
                      {m.preview && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{m.preview}</p>
                      )}
                    </div>

                    <span className="mt-0.5 shrink-0 text-xs tabular-nums text-[var(--muted)]">
                      {fmtWhen(m.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}

/* ---------- channel icons ---------- */

function iconProps() {
  return {
    viewBox: '0 0 24 24',
    className: 'h-4 w-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function SmsIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V17h-1A2.5 2.5 0 0 1 4 14.5v-8Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}
