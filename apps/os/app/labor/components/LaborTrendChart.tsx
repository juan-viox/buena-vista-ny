'use client';

import * as React from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface LaborTrendPoint {
  label: string;
  netSales: number;
  laborPct: number;
}

const AXIS_TICK = { fill: '#8FA3C0', fontSize: 11, fontFamily: 'Jost' };

/**
 * Labor % vs net sales, daily — sales as bars (left axis), labor %
 * as a gold line (right axis) with a dashed target reference line.
 */
export default function LaborTrendChart({ data, target }: { data: LaborTrendPoint[]; target: number }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: 'rgba(126,178,245,.55)' }} />
          Net sales
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: '#C9995C' }} />
          Labor %
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="h-0 w-3.5 border-t border-dashed" style={{ borderColor: 'rgba(251,191,36,.7)' }} />
          Target {target}%
        </span>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(168,196,229,.08)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: 'rgba(168,196,229,.12)' }}
              minTickGap={28}
            />
            <YAxis
              yAxisId="sales"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              width={48}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[(dataMin: number) => Math.floor(dataMin - 2), (dataMax: number) => Math.ceil(dataMax + 2)]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'rgba(201,153,92,.06)' }}
              contentStyle={{
                background: '#0E1626',
                border: '1px solid rgba(168,196,229,.16)',
                borderRadius: 10,
                fontFamily: 'Jost',
                fontSize: 12,
                color: '#E8EDF7',
              }}
              labelStyle={{ color: '#8FA3C0', marginBottom: 4 }}
              formatter={(value: number | string, name: string) =>
                name === 'Labor %'
                  ? [`${Number(value).toFixed(1)}%`, name]
                  : [`$${Number(value).toLocaleString('en-US')}`, name]
              }
            />
            <Bar
              yAxisId="sales"
              dataKey="netSales"
              name="Net sales"
              fill="rgba(126,178,245,.30)"
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              isAnimationActive={false}
            />
            <ReferenceLine
              yAxisId="pct"
              y={target}
              stroke="rgba(251,191,36,.55)"
              strokeDasharray="5 4"
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="laborPct"
              name="Labor %"
              stroke="#C9995C"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: '#C9995C' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
