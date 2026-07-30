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

export interface SalesSeries {
  /** Data key on each point — the location id. */
  key: string;
  name: string;
  color: string;
}

export interface SalesPoint {
  label: string;
  [seriesKey: string]: string | number;
}

/** Daily net-sales area chart — one gradient band per location. */
export default function DailySalesChart({ data, series }: { data: SalesPoint[]; series: SalesSeries[] }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`salesGrad_${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(168,196,229,.08)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#8FA3C0', fontSize: 11, fontFamily: 'Jost' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(168,196,229,.12)' }}
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: '#8FA3C0', fontSize: 11, fontFamily: 'Jost' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(201,153,92,.35)', strokeWidth: 1 }}
              contentStyle={{
                background: '#0E1626',
                border: '1px solid rgba(168,196,229,.16)',
                borderRadius: 10,
                fontFamily: 'Jost',
                fontSize: 12,
                color: '#E8EDF7',
              }}
              labelStyle={{ color: '#8FA3C0', marginBottom: 4 }}
              formatter={(value: number | string, name: string) => [
                `$${Number(value).toLocaleString('en-US')}`,
                name,
              ]}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={1.75}
                fill={`url(#salesGrad_${s.key})`}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
