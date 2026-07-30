'use client';

// ============================================================
// Waitlist board — host-stand walk-in queue. Add form card +
// grouped tables by status (Waiting / Notified / Seated / Left)
// with per-state actions calling /api/waitlist. Live elapsed
// minutes tick every 30s; the StatRow at the top recomputes from
// board state so it stays honest after every action.
// ============================================================

import * as React from 'react';
import { Badge, Card, EmptyState, Kicker, Stat, StatRow } from '@viox/ui';

export interface WaitlistRow {
  id: string | number;
  guest_name: string | null;
  phone: string | null;
  party_size: number | null;
  location: string | null;
  status: string | null;
  quoted_wait_min: number | null;
  notes: string | null;
  created_at: string | null;
  notified_at: string | null;
  seated_at: string | null;
}

const LOCATION_LABELS: Record<string, string> = {
  'hells-kitchen': "Hell's Kitchen",
  'east-village': 'East Village',
};

const TH = 'px-3 py-2 whitespace-nowrap text-left text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]';
const TD = 'px-3 py-2 align-middle whitespace-nowrap text-[var(--text)]';
const INPUT =
  'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[rgba(212,164,55,.5)] focus:outline-none';
const BTN_GOLD =
  'rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_GOOD =
  'rounded-lg border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.06)] px-2.5 py-1 text-[11px] font-medium text-[var(--good)] transition-colors hover:bg-[rgba(52,211,153,.14)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_BAD =
  'rounded-lg border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.06)] px-2.5 py-1 text-[11px] font-medium text-[var(--bad)] transition-colors hover:bg-[rgba(248,113,113,.14)] disabled:cursor-not-allowed disabled:opacity-40';

function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now - then) / 60_000));
}

function clockTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function LocationBadge({ slug }: { slug: string | null }) {
  if (!slug) return <span className="text-[var(--muted)]">—</span>;
  return <Badge tone={slug in LOCATION_LABELS ? 'accent' : 'muted'}>{LOCATION_LABELS[slug] ?? slug}</Badge>;
}

type Note = { text: string; tone: 'good' | 'bad' | 'muted' };

export function WaitlistBoard({ initialRows }: { initialRows: WaitlistRow[] }) {
  const [rows, setRows] = React.useState<WaitlistRow[]>(initialRows);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, Note>>({});
  const noteTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // live elapsed-minutes tick
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  React.useEffect(() => {
    const timers = noteTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const flash = (id: string, note: Note) => {
    setNotes((n) => ({ ...n, [id]: note }));
    if (noteTimers.current[id]) clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = setTimeout(() => {
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
    }, 6000);
  };

  const applyRow = (id: string, patch: Partial<WaitlistRow>) => {
    setRows((rs) => rs.map((r) => (String(r.id) === id ? { ...r, ...patch } : r)));
  };

  const transition = async (row: WaitlistRow, action: 'table_ready' | 'seated' | 'left') => {
    const id = String(row.id);
    const prev = rows.find((r) => String(r.id) === id);
    const nowIso = new Date().toISOString();
    // optimistic move
    applyRow(
      id,
      action === 'table_ready'
        ? { status: 'notified', notified_at: nowIso }
        : action === 'seated'
          ? { status: 'seated', seated_at: nowIso }
          : { status: 'left' },
    );
    setSavingId(id);
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        row?: WaitlistRow;
        smsSent?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        if (prev) applyRow(id, prev);
        flash(id, { text: data.error ?? 'Update failed — try again.', tone: 'bad' });
        return;
      }
      if (data.row) applyRow(id, data.row);
      if (action === 'table_ready') {
        flash(
          id,
          data.smsSent
            ? { text: 'SMS sent ✓', tone: 'good' }
            : { text: row.phone ? 'Notified — SMS not sent' : 'Notified — no phone', tone: 'muted' },
        );
      }
    } catch {
      if (prev) applyRow(id, prev);
      flash(id, { text: 'Network error — try again.', tone: 'bad' });
    } finally {
      setSavingId((s) => (s === id ? null : s));
    }
  };

  // ---------- groups ----------

  const byCreatedAsc = (a: WaitlistRow, b: WaitlistRow) => (a.created_at ?? '').localeCompare(b.created_at ?? '');
  const waiting = rows.filter((r) => r.status === 'waiting').sort(byCreatedAsc);
  const notified = rows
    .filter((r) => r.status === 'notified')
    .sort((a, b) => (a.notified_at ?? '').localeCompare(b.notified_at ?? ''));
  const seated = rows
    .filter((r) => r.status === 'seated')
    .sort((a, b) => (b.seated_at ?? '').localeCompare(a.seated_at ?? ''));
  const left = rows.filter((r) => r.status === 'left').sort((a, b) => byCreatedAsc(b, a));

  // ---------- stats ----------

  const waitingGuests = waiting.reduce((sum, r) => sum + (r.party_size ?? 0), 0);
  const quoted = waiting.map((r) => r.quoted_wait_min).filter((m): m is number => typeof m === 'number' && m > 0);
  const avgQuoted = quoted.length > 0 ? Math.round(quoted.reduce((a, b) => a + b, 0) / quoted.length) : null;
  const todayStr = new Date(now).toDateString();
  const seatedTonight = seated.filter((r) => r.seated_at && new Date(r.seated_at).toDateString() === todayStr).length;

  return (
    <>
      <StatRow cols={4}>
        <Stat
          label="Waiting now"
          value={waiting.length}
          highlight
          hint={`${waitingGuests} guest${waitingGuests === 1 ? '' : 's'} in the queue`}
        />
        <Stat label="Avg quoted wait" value={avgQuoted !== null ? `${avgQuoted}m` : '—'} hint="Across the current queue" />
        <Stat label="Notified" value={notified.length} hint="Table-ready texts out" />
        <Stat label="Seated tonight" value={seatedTonight} hint="Walk-ins converted today" />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AddWalkInForm
          onAdded={(row, smsSent) => {
            setRows((rs) => [row, ...rs]);
            if (row.phone) flash(String(row.id), smsSent ? { text: 'SMS sent ✓', tone: 'good' } : { text: 'Added — SMS not sent', tone: 'muted' });
          }}
        />

        <Card
          className="lg:col-span-2"
          flush
          kicker="In the queue"
          title="Waiting"
          action={<Badge tone="warn">{waiting.length} waiting</Badge>}
        >
          {waiting.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="No one waiting" message="Walk-ins you add on the left land here with a live wait clock." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Guest</th>
                    <th className={`${TH} text-right`}>Party</th>
                    <th className={TH}>Location</th>
                    <th className={TH}>Waiting</th>
                    <th className={TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((row, i) => {
                    const id = String(row.id);
                    const elapsed = minutesSince(row.created_at, now);
                    const overQuote =
                      elapsed !== null && row.quoted_wait_min !== null && row.quoted_wait_min > 0 && elapsed > row.quoted_wait_min;
                    const nearQuote =
                      !overQuote &&
                      elapsed !== null &&
                      row.quoted_wait_min !== null &&
                      row.quoted_wait_min > 0 &&
                      elapsed >= row.quoted_wait_min * 0.8;
                    const note = notes[id];
                    return (
                      <tr key={id} className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''}`}>
                        <td className={TD}>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.guest_name ?? 'Guest'}</div>
                            <div className="truncate text-xs text-[var(--muted)]">
                              {row.phone ?? 'no phone'}
                              {row.notes ? ` · ${row.notes}` : ''}
                            </div>
                          </div>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{row.party_size ?? '—'}</td>
                        <td className={TD}>
                          <LocationBadge slug={row.location} />
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          <span
                            className={
                              overQuote ? 'font-semibold text-[var(--bad)]' : nearQuote ? 'font-medium text-[var(--warn)]' : ''
                            }
                          >
                            {elapsed !== null ? `${elapsed}m` : '—'}
                          </span>
                          {row.quoted_wait_min !== null && row.quoted_wait_min > 0 && (
                            <span className="ml-1 text-xs text-[var(--muted)]">/ {row.quoted_wait_min}m quoted</span>
                          )}
                        </td>
                        <td className={TD}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className={BTN_GOLD}
                              disabled={savingId === id}
                              onClick={() => void transition(row, 'table_ready')}
                            >
                              Table ready
                            </button>
                            <button
                              type="button"
                              className={BTN_GOOD}
                              disabled={savingId === id}
                              onClick={() => void transition(row, 'seated')}
                            >
                              Seat
                            </button>
                            <button
                              type="button"
                              className={BTN_BAD}
                              disabled={savingId === id}
                              onClick={() => void transition(row, 'left')}
                            >
                              Left
                            </button>
                            {note && (
                              <span
                                aria-live="polite"
                                className={`ml-1 text-[11px] font-medium ${
                                  note.tone === 'good' ? 'text-[var(--good)]' : note.tone === 'bad' ? 'text-[var(--bad)]' : 'text-[var(--muted)]'
                                }`}
                              >
                                {note.text}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card flush kicker="Texted — table ready" title="Notified" action={<Badge tone="info">{notified.length}</Badge>}>
          {notified.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="No one notified" message='Hit "Table ready" on a waiting guest to text them and move them here.' />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Guest</th>
                    <th className={`${TH} text-right`}>Party</th>
                    <th className={TH}>Location</th>
                    <th className={TH}>Notified</th>
                    <th className={TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notified.map((row, i) => {
                    const id = String(row.id);
                    const since = minutesSince(row.notified_at, now);
                    const note = notes[id];
                    return (
                      <tr key={id} className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''}`}>
                        <td className={TD}>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.guest_name ?? 'Guest'}</div>
                            <div className="truncate text-xs text-[var(--muted)]">{row.phone ?? 'no phone'}</div>
                          </div>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{row.party_size ?? '—'}</td>
                        <td className={TD}>
                          <LocationBadge slug={row.location} />
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          <span className={since !== null && since >= 10 ? 'font-medium text-[var(--warn)]' : ''}>
                            {since !== null ? `${since}m ago` : '—'}
                          </span>
                        </td>
                        <td className={TD}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className={BTN_GOLD}
                              disabled={savingId === id}
                              onClick={() => void transition(row, 'seated')}
                            >
                              Seated
                            </button>
                            <button
                              type="button"
                              className={BTN_BAD}
                              disabled={savingId === id}
                              onClick={() => void transition(row, 'left')}
                            >
                              Left
                            </button>
                            {note && (
                              <span
                                aria-live="polite"
                                className={`ml-1 text-[11px] font-medium ${
                                  note.tone === 'good' ? 'text-[var(--good)]' : note.tone === 'bad' ? 'text-[var(--bad)]' : 'text-[var(--muted)]'
                                }`}
                              >
                                {note.text}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          flush
          kicker="Done for the night"
          title="Seated & left"
          action={
            <span className="inline-flex items-center gap-1.5">
              <Badge tone="good">{seated.length} seated</Badge>
              <Badge tone="muted">{left.length} left</Badge>
            </span>
          }
        >
          {seated.length === 0 && left.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="Nothing closed out yet" message="Seated parties and walk-aways collect here through the night." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Guest</th>
                    <th className={`${TH} text-right`}>Party</th>
                    <th className={TH}>Location</th>
                    <th className={TH}>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {[...seated, ...left].map((row, i) => (
                    <tr
                      key={String(row.id)}
                      className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''}`}
                    >
                      <td className={TD}>
                        <div className="truncate font-medium">{row.guest_name ?? 'Guest'}</div>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{row.party_size ?? '—'}</td>
                      <td className={TD}>
                        <LocationBadge slug={row.location} />
                      </td>
                      <td className={TD}>
                        {row.status === 'seated' ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge tone="good">Seated</Badge>
                            <span className="text-xs tabular-nums text-[var(--muted)]">{clockTime(row.seated_at)}</span>
                          </span>
                        ) : (
                          <Badge tone="bad">Left</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/* ---------- add walk-in form ---------- */

function AddWalkInForm({ onAdded }: { onAdded: (row: WaitlistRow, smsSent: boolean) => void }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [party, setParty] = React.useState('2');
  const [location, setLocation] = React.useState('hells-kitchen');
  const [quotedWait, setQuotedWait] = React.useState('15');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          guest_name: name,
          phone: phone || undefined,
          party_size: party,
          location,
          quoted_wait_min: quotedWait || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        row?: WaitlistRow;
        smsSent?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.row) {
        setError(data.error ?? 'Could not add the guest — try again.');
        return;
      }
      onAdded(data.row, Boolean(data.smsSent));
      setName('');
      setPhone('');
      setParty('2');
      setQuotedWait('15');
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card kicker="Host stand" title="Add walk-in">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <Kicker>Guest name</Kicker>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="María Delgado"
            className={INPUT}
          />
        </label>
        <label className="block">
          <Kicker>Phone (for the table-ready text)</Kicker>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(212) 555-0134"
            className={INPUT}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Kicker>Party</Kicker>
            <input
              type="number"
              min={1}
              required
              value={party}
              onChange={(e) => setParty(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </label>
          <label className="block">
            <Kicker>Quoted wait (min)</Kicker>
            <input
              type="number"
              min={0}
              value={quotedWait}
              onChange={(e) => setQuotedWait(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </label>
        </div>
        <label className="block">
          <Kicker>Location</Kicker>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT}>
            <option value="hells-kitchen">Hell&apos;s Kitchen</option>
            <option value="east-village">East Village</option>
          </select>
        </label>
        {error && <p className="text-xs font-medium text-[var(--bad)]">{error}</p>}
        <button
          type="submit"
          disabled={submitting || name.trim().length === 0}
          className="w-full rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-4 py-2 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add to waitlist'}
        </button>
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Guests with a phone get a welcome text with their quoted wait, and a table-ready text when you call them up.
        </p>
      </form>
    </Card>
  );
}
