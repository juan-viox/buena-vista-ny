'use client';

// ============================================================
// Live reservation inbox table with host-stand actions.
// Confirm (gold) / Modify (inline editor row) / Decline call
// PATCH /api/reservations/[id]; status badges update
// optimistically and a small "SMS sent" note appears when the
// guest was texted. Table classes mirror @viox/ui DataTable.
// ============================================================

import * as React from 'react';
import { Badge } from '@viox/ui';

export interface LiveRequestRow {
  id: string | number;
  guest_name: string | null;
  phone: string | null;
  email?: string | null;
  party_size: number | null;
  requested_date: string | null;
  requested_time: string | null;
  location: string | null;
  occasion: string | null;
  status: string | null;
  channel?: string | null;
  created_at: string | null;
}

const LOCATION_LABELS: Record<string, string> = {
  'hells-kitchen': "Hell's Kitchen",
  'east-village': 'East Village',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'new':
      return <Badge tone="warn">New</Badge>;
    case 'confirmed':
      return <Badge tone="good">Confirmed</Badge>;
    case 'declined':
      return <Badge tone="bad">Declined</Badge>;
    case 'modified':
      return <Badge tone="info">Modified</Badge>;
    default:
      return <Badge tone="muted">{status ?? '—'}</Badge>;
  }
}

type Note = { text: string; tone: 'good' | 'bad' | 'muted' };

const TH = 'px-3 py-2 whitespace-nowrap text-left text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]';
const TD = 'px-3 py-2 align-middle whitespace-nowrap text-[var(--text)]';
const INPUT =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[rgba(212,164,55,.5)] focus:outline-none';
const BTN_GOLD =
  'rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_GHOST =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40';
const BTN_BAD =
  'rounded-lg border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.06)] px-2.5 py-1 text-[11px] font-medium text-[var(--bad)] transition-colors hover:bg-[rgba(248,113,113,.14)] disabled:cursor-not-allowed disabled:opacity-40';

interface EditFields {
  date: string;
  time: string;
  party: string;
  location: string;
}

export function LiveRequestsTable({ rows: initialRows }: { rows: LiveRequestRow[] }) {
  const [rows, setRows] = React.useState<LiveRequestRow[]>(initialRows);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<EditFields>({ date: '', time: '', party: '', location: '' });
  const [notes, setNotes] = React.useState<Record<string, Note>>({});
  const noteTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const applyRow = (id: string, patch: Partial<LiveRequestRow>) => {
    setRows((rs) => rs.map((r) => (String(r.id) === id ? { ...r, ...patch } : r)));
  };

  const callAction = async (
    row: LiveRequestRow,
    action: 'confirm' | 'decline' | 'modify',
    fields?: { party_size?: number; requested_date?: string; requested_time?: string; location?: string },
  ) => {
    const id = String(row.id);
    const prev = rows.find((r) => String(r.id) === id);
    const optimisticStatus = action === 'confirm' ? 'confirmed' : action === 'decline' ? 'declined' : 'modified';

    // optimistic badge (+ fields for modify)
    applyRow(id, { status: optimisticStatus, ...(fields ?? {}) });
    setSavingId(id);
    try {
      const res = await fetch(`/api/reservations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'modify' ? { action, fields } : { action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        row?: LiveRequestRow;
        smsSent?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        if (prev) applyRow(id, prev); // revert
        flash(id, { text: data.error ?? 'Update failed — try again.', tone: 'bad' });
        return;
      }
      if (data.row) applyRow(id, data.row);
      setEditingId((e) => (e === id ? null : e));
      if (data.smsSent) {
        flash(id, { text: 'SMS sent ✓', tone: 'good' });
      } else if (row.phone) {
        flash(id, { text: 'Saved — SMS not sent', tone: 'muted' });
      } else {
        flash(id, { text: 'Saved — no phone on file', tone: 'muted' });
      }
    } catch {
      if (prev) applyRow(id, prev);
      flash(id, { text: 'Network error — try again.', tone: 'bad' });
    } finally {
      setSavingId((s) => (s === id ? null : s));
    }
  };

  const openEditor = (row: LiveRequestRow) => {
    const iso = row.requested_date ?? '';
    setEdit({
      date: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '',
      time: row.requested_time ?? '',
      party: row.party_size ? String(row.party_size) : '',
      location: row.location ?? 'hells-kitchen',
    });
    setEditingId(String(row.id));
  };

  const saveEditor = (row: LiveRequestRow) => {
    const fields: { party_size?: number; requested_date?: string; requested_time?: string; location?: string } = {};
    const party = Number.parseInt(edit.party, 10);
    if (Number.isFinite(party) && party > 0) fields.party_size = party;
    if (edit.date.trim()) fields.requested_date = edit.date.trim();
    if (edit.time.trim()) fields.requested_time = edit.time.trim();
    if (edit.location.trim()) fields.location = edit.location.trim();
    void callAction(row, 'modify', fields);
  };

  const colCount = 9;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className={TH}>Guest</th>
            <th className={TH}>Phone</th>
            <th className={`${TH} text-right`}>Party</th>
            <th className={TH}>Requested</th>
            <th className={TH}>Location</th>
            <th className={TH}>Occasion</th>
            <th className={TH}>Status</th>
            <th className={TH}>Received</th>
            <th className={TH}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const id = String(row.id);
            const saving = savingId === id;
            const editing = editingId === id;
            const note = notes[id];
            return (
              <React.Fragment key={id}>
                <tr
                  className={`border-b border-[var(--border)] last:border-0 ${
                    !editing && i % 2 === 1 ? 'bg-[var(--panel2)]' : ''
                  }`}
                >
                  <td className={TD}>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text)]">{row.guest_name ?? 'Guest'}</div>
                      {row.email && <div className="truncate text-xs text-[var(--muted)]">{row.email}</div>}
                    </div>
                  </td>
                  <td className={`${TD} tabular-nums text-[var(--muted)]`}>{row.phone ?? '—'}</td>
                  <td className={`${TD} text-right tabular-nums`}>{row.party_size ?? '—'}</td>
                  <td className={`${TD} tabular-nums`}>
                    {[row.requested_date, row.requested_time].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className={TD}>
                    {row.location ? (
                      <Badge tone={row.location in LOCATION_LABELS ? 'accent' : 'muted'}>
                        {LOCATION_LABELS[row.location] ?? row.location}
                      </Badge>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className={`${TD} text-[var(--muted)]`}>{row.occasion ?? '—'}</td>
                  <td className={TD}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={`${TD} text-[var(--muted)]`}>{relativeTime(row.created_at)}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className={BTN_GOLD}
                        disabled={saving || row.status === 'confirmed'}
                        onClick={() => void callAction(row, 'confirm')}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className={BTN_GHOST}
                        disabled={saving}
                        onClick={() => (editing ? setEditingId(null) : openEditor(row))}
                      >
                        Modify
                      </button>
                      <button
                        type="button"
                        className={BTN_BAD}
                        disabled={saving || row.status === 'declined'}
                        onClick={() => void callAction(row, 'decline')}
                      >
                        Decline
                      </button>
                      {note && (
                        <span
                          aria-live="polite"
                          className={`ml-1 text-[11px] font-medium ${
                            note.tone === 'good'
                              ? 'text-[var(--good)]'
                              : note.tone === 'bad'
                                ? 'text-[var(--bad)]'
                                : 'text-[var(--muted)]'
                          }`}
                        >
                          {note.text}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>

                {editing && (
                  <tr className="border-b border-[var(--border)] bg-[rgba(212,164,55,.04)] last:border-0">
                    <td colSpan={colCount} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-end gap-2.5">
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                            Date
                          </span>
                          <input
                            type="date"
                            value={edit.date}
                            onChange={(e) => setEdit((f) => ({ ...f, date: e.target.value }))}
                            className={`${INPUT} w-36`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                            Time
                          </span>
                          <input
                            type="text"
                            value={edit.time}
                            onChange={(e) => setEdit((f) => ({ ...f, time: e.target.value }))}
                            placeholder="7:30 PM"
                            className={`${INPUT} w-24`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                            Party
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={edit.party}
                            onChange={(e) => setEdit((f) => ({ ...f, party: e.target.value }))}
                            className={`${INPUT} w-20 tabular-nums`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                            Location
                          </span>
                          <select
                            value={edit.location}
                            onChange={(e) => setEdit((f) => ({ ...f, location: e.target.value }))}
                            className={`${INPUT} w-40`}
                          >
                            <option value="hells-kitchen">Hell&apos;s Kitchen</option>
                            <option value="east-village">East Village</option>
                          </select>
                        </label>
                        <div className="flex items-center gap-1.5 pb-0.5">
                          <button
                            type="button"
                            className={BTN_GOLD}
                            disabled={saving}
                            onClick={() => saveEditor(row)}
                          >
                            {saving ? 'Saving…' : 'Save & text guest'}
                          </button>
                          <button type="button" className={BTN_GHOST} onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
