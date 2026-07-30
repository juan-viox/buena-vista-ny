'use client';

import * as React from 'react';

type Theme = 'dark' | 'light';

/**
 * Sun/moon theme toggle for the topbar. Flips `data-theme` on <html>,
 * persists to localStorage ('viox-theme') and broadcasts a
 * 'viox-theme-change' window event so chart components can re-resolve
 * concrete colors (see useThemeColor).
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  // Render dark (the SSR default) first; sync to the real value after mount.
  const [theme, setTheme] = React.useState<Theme>('dark');

  React.useEffect(() => {
    if (document.documentElement.dataset.theme === 'light') setTheme('light');
  }, []);

  const toggle = React.useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('viox-theme', next);
    } catch {
      /* storage unavailable — theme still applies for this page */
    }
    setTheme(next);
    window.dispatchEvent(new CustomEvent('viox-theme-change', { detail: { theme: next } }));
  }, []);

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-all hover:border-[rgba(201,153,92,.45)] hover:text-[var(--accent)] hover:shadow-[0_0_12px_rgba(201,153,92,.25)] ${className}`}
    >
      {theme === 'light' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}
