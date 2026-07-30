import * as React from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Cell alignment. Numeric columns default to right. */
  align?: 'left' | 'right' | 'center';
  /** Right-align + tabular-nums. */
  numeric?: boolean;
  /** e.g. "160px" or "20%". */
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
  /** Extra classes for the cell (e.g. "text-[var(--muted)]"). */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable key per row; defaults to any `id` field, then index. */
  rowKey?: (row: T, index: number) => string;
  /** Return an href to make the whole row a link. */
  onRowHref?: (row: T) => string | undefined;
  /** Tighter padding for dense ops tables. Default true (compact). */
  dense?: boolean;
  zebra?: boolean;
  emptyMessage?: string;
  className?: string;
}

/** Dense, zebra-striped data table on the panel surface. Server-safe. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowHref,
  dense = true,
  zebra = true,
  emptyMessage = 'Nothing to show yet.',
  className = '',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title="No data" message={emptyMessage} />;
  }
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';

  const keyOf = (row: T, i: number): string => {
    if (rowKey) return rowKey(row, i);
    const id = (row as Record<string, unknown>)['id'];
    return typeof id === 'string' || typeof id === 'number' ? String(id) : String(i);
  };

  const alignClass = (col: Column<T>) => {
    const align = col.align ?? (col.numeric ? 'right' : 'left');
    return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  };

  const cellContent = (col: Column<T>, row: T, i: number): React.ReactNode => {
    if (col.render) return col.render(row, i);
    const v = (row as Record<string, unknown>)[col.key];
    if (v === null || v === undefined) return <span className="text-[var(--muted)]">—</span>;
    return String(v);
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`${pad} whitespace-nowrap text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)] ${alignClass(col)}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const href = onRowHref?.(row);
            return (
              <tr
                key={keyOf(row, i)}
                className={`border-b border-[var(--border)] last:border-0 ${
                  zebra && i % 2 === 1 ? 'bg-[var(--panel2)]' : ''
                } ${href ? 'transition-colors hover:bg-white/[.04]' : ''}`}
              >
                {columns.map((col) => {
                  const body = cellContent(col, row, i);
                  const base = `align-middle whitespace-nowrap ${alignClass(col)} ${
                    col.numeric ? 'tabular-nums' : ''
                  } text-[var(--text)] ${col.cellClassName ?? ''}`;
                  return href ? (
                    <td key={col.key} className={`p-0 ${base}`}>
                      <a href={href} className={`block ${pad}`}>
                        {body}
                      </a>
                    </td>
                  ) : (
                    <td key={col.key} className={`${pad} ${base}`}>
                      {body}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
