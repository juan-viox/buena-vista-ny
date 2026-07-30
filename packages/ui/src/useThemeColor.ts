'use client';

import * as React from 'react';

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Concrete color value for a CSS custom property (e.g. '--muted').
 * Needed where a real color string is required (recharts ticks, SVG
 * gradient stops); re-resolves when ThemeToggle dispatches
 * 'viox-theme-change'. Pass the dark value as `fallback` so SSR/first
 * paint matches the default theme.
 */
export function useThemeColor(varName: string, fallback = ''): string {
  const [color, setColor] = React.useState(fallback);

  React.useEffect(() => {
    const update = () => setColor(readVar(varName, fallback));
    update();
    window.addEventListener('viox-theme-change', update);
    return () => window.removeEventListener('viox-theme-change', update);
  }, [varName, fallback]);

  return color;
}

/**
 * Resolver for many colors at once (series arrays, quadrant maps).
 * Accepts 'var(--token)' or '--token' and returns the concrete value;
 * any other string passes through untouched. Re-renders on theme change.
 */
export function useThemeColorResolver(): (color: string) => string {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    bump(); // resolve for real after mount (SSR renders raw var() strings)
    window.addEventListener('viox-theme-change', bump);
    return () => window.removeEventListener('viox-theme-change', bump);
  }, []);

  return React.useCallback(
    (color: string) => {
      void tick; // re-create the resolver when the theme flips
      let name = color.trim();
      if (name.startsWith('var(') && name.endsWith(')')) name = name.slice(4, -1).trim();
      if (!name.startsWith('--')) return color;
      return readVar(name, color);
    },
    [tick]
  );
}
