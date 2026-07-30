'use client';

import * as React from 'react';
import { Badge, fmtNumber, fmtPct, fmtUSD } from '@viox/ui';

export interface MenuTableRow {
  id: string;
  name: string;
  category: string;
  quadrant: 'star' | 'plow_horse' | 'puzzle' | 'dog';
  qtySold: number;
  netSales: number;
  plateCost: number;
  unitMargin: number;
  margin: number;
  costPct: number;
}

type SortKey = 'name' | 'category' | 'qtySold' | 'netSales' | 'plateCost' | 'unitMargin' | 'margin' | 'costPct';

interface ColDef {
  key: SortKey;
  header: string;
  numeric?: boolean;
  render: (r: MenuTableRow) => React.ReactNode;
}

const COLS: ColDef[] = [
  {
    key: 'name',
    header: 'Item',
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        <Badge status={r.quadrant} />
      </span>
    ),
  },
  { key: 'category', header: 'Category', render: (r) => <span className="text-[var(--muted)]">{r.category}</span> },
  { key: 'qtySold', header: 'Qty', numeric: true, render: (r) => fmtNumber(r.qtySold) },
  { key: 'netSales', header: 'Net sales', numeric: true, render: (r) => fmtUSD(Math.round(r.netSales)) },
  { key: 'plateCost', header: 'Plate cost', numeric: true, render: (r) => `$${r.plateCost.toFixed(2)}` },
  { key: 'unitMargin', header: 'Margin / plate', numeric: true, render: (r) => `$${r.unitMargin.toFixed(2)}` },
  { key: 'margin', header: 'Total margin', numeric: true, render: (r) => fmtUSD(Math.round(r.margin)) },
  {
    key: 'costPct',
    header: 'Cost %',
    numeric: true,
    render: (r) => (
      <span className={r.costPct > 32 ? 'text-[var(--bad)]' : r.costPct > 28 ? 'text-[var(--warn)]' : 'text-[var(--good)]'}>
        {fmtPct(r.costPct)}
      </span>
    ),
  },
];

/** Sortable menu-item table — click a header to sort, click again to flip. */
export default function MenuTable({ rows }: { rows: MenuTableRow[] }) {
  const [sortKey, setSortKey] = React.useState<SortKey>('margin');
  const [dir, setDir] = React.useState<'asc' | 'desc'>('desc');

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setDir(key === 'name' || key === 'category' ? 'asc' : 'desc');
    }
  };

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {COLS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th key={col.key} className={`px-3 py-2 whitespace-nowrap ${col.numeric ? 'text-right' : 'text-left'}`}>
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[.12em] transition-colors ${
                      active ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {col.header}
                    <svg
                      viewBox="0 0 10 10"
                      className={`h-2.5 w-2.5 transition-opacity ${active ? 'opacity-100' : 'opacity-0'} ${
                        active && dir === 'asc' ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M2 3.5 5 6.5l3-3" />
                    </svg>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id}
              className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''}`}
            >
              {COLS.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 align-middle whitespace-nowrap text-[var(--text)] ${
                    col.numeric ? 'text-right tabular-nums' : 'text-left'
                  }`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
