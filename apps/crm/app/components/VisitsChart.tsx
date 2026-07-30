'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useThemeColor } from '@viox/ui';

export interface VisitPoint {
  /** ISO date, e.g. "2026-07-29". */
  date: string;
  /** Short axis label, e.g. "Jul 29". */
  label: string;
  hk: number;
  ev: number;
  total: number;
}

export interface VisitsChartProps {
  data: VisitPoint[];
  hkName?: string;
  evName?: string;
}

/** Stacked daily-covers area chart — guest visits across both locations. */
export function VisitsChart({ data, hkName = "Hell's Kitchen", evName = 'East Village' }: VisitsChartProps) {
  const HK_COLOR = useThemeColor('--accent2', '#D4A437'); // CRM gold
  const EV_COLOR = useThemeColor('--info', '#7EB2F5'); // command info blue
  const muted = useThemeColor('--muted', '#8FA3C0');
  const grid = useThemeColor('--grid', 'rgba(168,196,229,.08)');
  const axisline = useThemeColor('--axisline', 'rgba(168,196,229,.12)');
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: HK_COLOR }} />
          {hkName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EV_COLOR }} />
          {evName}
        </span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="crmHkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={HK_COLOR} stopOpacity={0.32} />
                <stop offset="100%" stopColor={HK_COLOR} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="crmEvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EV_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={EV_COLOR} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: axisline }}
              interval={13}
            />
            <YAxis
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
            />
            <Tooltip content={<VisitsTooltip hkName={hkName} evName={evName} />} cursor={{ stroke: axisline, strokeDasharray: '3 3' }} />
            <Area
              type="monotone"
              dataKey="ev"
              stackId="covers"
              name={evName}
              stroke={EV_COLOR}
              strokeWidth={1.5}
              fill="url(#crmEvFill)"
            />
            <Area
              type="monotone"
              dataKey="hk"
              stackId="covers"
              name={hkName}
              stroke={HK_COLOR}
              strokeWidth={1.5}
              fill="url(#crmHkFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  payload?: VisitPoint;
}

function VisitsTooltip({
  active,
  payload,
  hkName,
  evName,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  hkName: string;
  evName: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-[var(--text)]">{point.label}</div>
      <Row swatch="var(--accent2)" label={hkName} value={point.hk} />
      <Row swatch="var(--info)" label={evName} value={point.ev} />
      <div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
        <Row label="Total covers" value={point.total} bold />
      </div>
    </div>
  );
}

function Row({ swatch, label, value, bold = false }: { swatch?: string; label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
        {swatch && <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: swatch }} />}
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-[var(--accent2)]' : 'text-[var(--text)]'}`}>
        {value.toLocaleString('en-US')}
      </span>
    </div>
  );
}
