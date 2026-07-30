'use client';

import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendSeries {
  /** Data key on each point, e.g. the location id. */
  key: string;
  name: string;
  color: string;
}

export interface TrendPoint {
  label: string;
  [seriesKey: string]: string | number;
}

export interface SalesTrendProps {
  data: TrendPoint[];
  series: TrendSeries[];
}

/** 30-day net-sales trend — one line per location, dark command style. */
export default function SalesTrend({ data, series }: SalesTrendProps) {
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
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
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
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
