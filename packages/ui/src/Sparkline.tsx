'use client';

import * as React from 'react';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Soft area fill under the line. */
  fill?: boolean;
  className?: string;
}

/** Tiny inline SVG trend line — no charting lib, safe anywhere. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = 'var(--accent)',
  strokeWidth = 1.5,
  fill = false,
  className = '',
}: SparklineProps) {
  if (data.length < 2) return null;

  const pad = strokeWidth + 1;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${points[points.length - 1][0]},${height - pad} L${points[0][0]},${height - pad} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden
    >
      {fill && <path d={area} fill={stroke} opacity={0.12} />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={strokeWidth + 0.5} fill={stroke} />
    </svg>
  );
}
