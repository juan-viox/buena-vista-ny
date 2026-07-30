'use client';

import * as React from 'react';
import {
  CartesianGrid,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useThemeColor, useThemeColorResolver } from '@viox/ui';

export type Quadrant = 'star' | 'plow_horse' | 'puzzle' | 'dog';

export interface MatrixPoint {
  name: string;
  category: string;
  qty: number;
  /** Contribution margin per plate, USD. */
  unitMargin: number;
  netSales: number;
  costPct: number;
  quadrant: Quadrant;
}

const QUADRANT_META: Record<Quadrant, { label: string; color: string; fill: string }> = {
  star: { label: 'Stars', color: 'var(--good)', fill: 'rgba(52,211,153,.055)' },
  plow_horse: { label: 'Plow horses', color: 'var(--warn)', fill: 'rgba(251,191,36,.05)' },
  puzzle: { label: 'Puzzles', color: 'var(--info)', fill: 'rgba(126,178,245,.05)' },
  dog: { label: 'Dogs', color: 'var(--bad)', fill: 'rgba(248,113,113,.05)' },
};

function MatrixTooltip(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: Array<{ payload: MatrixPoint }> };
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const meta = QUADRANT_META[p.quadrant];
  return (
    <div
      style={{
        background: 'var(--panel2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontFamily: 'Jost',
        fontSize: 12,
        color: 'var(--text)',
        padding: '10px 12px',
        maxWidth: 240,
      }}
    >
      <div style={{ fontWeight: 600 }}>{p.name}</div>
      <div style={{ color: 'var(--muted)', marginTop: 2 }}>
        {p.category} · <span style={{ color: meta.color }}>{meta.label.replace(/s$/, '')}</span>
      </div>
      <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px' }}>
        <span style={{ color: 'var(--muted)' }}>Qty sold</span>
        <span style={{ textAlign: 'right' }}>{p.qty.toLocaleString('en-US')}</span>
        <span style={{ color: 'var(--muted)' }}>Unit margin</span>
        <span style={{ textAlign: 'right' }}>${p.unitMargin.toFixed(2)}</span>
        <span style={{ color: 'var(--muted)' }}>Net sales</span>
        <span style={{ textAlign: 'right' }}>${Math.round(p.netSales).toLocaleString('en-US')}</span>
        <span style={{ color: 'var(--muted)' }}>Cost %</span>
        <span style={{ textAlign: 'right' }}>{p.costPct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/**
 * Menu-engineering matrix — popularity (qty sold) vs profitability
 * (contribution margin per plate), quadrant-shaded with the classic
 * Kasavana–Smith thresholds passed in from the server page.
 */
export default function MenuMatrix({
  points,
  xThreshold,
  yThreshold,
}: {
  points: MatrixPoint[];
  xThreshold: number;
  yThreshold: number;
}) {
  const resolve = useThemeColorResolver();
  const muted = useThemeColor('--muted', '#8FA3C0');
  const grid = useThemeColor('--grid', 'rgba(168,196,229,.08)');
  const axisline = useThemeColor('--axisline', 'rgba(168,196,229,.12)');
  const AXIS_TICK = { fill: muted, fontSize: 11, fontFamily: 'Jost' };
  const cornerLabel = (value: string) => ({
    value,
    fill: muted,
    opacity: 0.6,
    fontSize: 10,
    fontFamily: 'Jost',
    letterSpacing: '.12em',
  });
  const xMax = Math.ceil((Math.max(...points.map((p) => p.qty), xThreshold) * 1.18) / 50) * 50;
  const yMax = Math.ceil(Math.max(...points.map((p) => p.unitMargin), yThreshold) * 1.2);

  const byQuadrant = (q: Quadrant) => points.filter((p) => p.quadrant === q);
  const quadrants = Object.keys(QUADRANT_META) as Quadrant[];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {quadrants.map((q) => (
          <span key={q} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: QUADRANT_META[q].color }} />
            {QUADRANT_META[q].label} · {byQuadrant(q).length}
          </span>
        ))}
      </div>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 24, bottom: 8, left: 0 }}>
            {/* quadrant shading */}
            <ReferenceArea x1={xThreshold} x2={xMax} y1={yThreshold} y2={yMax} fill={QUADRANT_META.star.fill} stroke="none" label={{ ...cornerLabel('STARS'), position: 'insideTopRight' }} />
            <ReferenceArea x1={xThreshold} x2={xMax} y1={0} y2={yThreshold} fill={QUADRANT_META.plow_horse.fill} stroke="none" label={{ ...cornerLabel('PLOW HORSES'), position: 'insideBottomRight' }} />
            <ReferenceArea x1={0} x2={xThreshold} y1={yThreshold} y2={yMax} fill={QUADRANT_META.puzzle.fill} stroke="none" label={{ ...cornerLabel('PUZZLES'), position: 'insideTopLeft' }} />
            <ReferenceArea x1={0} x2={xThreshold} y1={0} y2={yThreshold} fill={QUADRANT_META.dog.fill} stroke="none" label={{ ...cornerLabel('DOGS'), position: 'insideBottomLeft' }} />

            <CartesianGrid stroke={grid} />
            <XAxis
              type="number"
              dataKey="qty"
              name="Qty sold"
              domain={[0, xMax]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: axisline }}
              label={{ value: 'Qty sold (period)', position: 'insideBottomRight', offset: -2, fill: muted, fontSize: 10, fontFamily: 'Jost' }}
            />
            <YAxis
              type="number"
              dataKey="unitMargin"
              name="Unit margin"
              domain={[0, yMax]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
              width={44}
              label={{ value: 'Margin / plate', angle: -90, position: 'insideLeft', offset: 12, fill: muted, fontSize: 10, fontFamily: 'Jost' }}
            />
            <ZAxis range={[110, 110]} />

            {/* thresholds */}
            <ReferenceLine x={xThreshold} stroke={muted} strokeOpacity={0.4} strokeDasharray="4 4" />
            <ReferenceLine y={yThreshold} stroke={muted} strokeOpacity={0.4} strokeDasharray="4 4" />

            <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'rgba(201,153,92,.35)' }} content={MatrixTooltip} />

            {quadrants.map((q) => (
              <Scatter key={q} name={QUADRANT_META[q].label} data={byQuadrant(q)} fill={resolve(QUADRANT_META[q].color)} fillOpacity={0.9} isAnimationActive={false}>
                <LabelList
                  dataKey="name"
                  position="top"
                  offset={7}
                  style={{ fill: muted, fontSize: 10, fontFamily: 'Jost' }}
                />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-[var(--muted)]">
        Thresholds — popularity {Math.round(xThreshold).toLocaleString('en-US')} plates (70% rule) · avg margin $
        {yThreshold.toFixed(2)}/plate
      </div>
    </div>
  );
}
