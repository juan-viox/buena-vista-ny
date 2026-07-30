'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

export interface Persona {
  id: string;
  label: string;
  /** e.g. "Owner", "Chef", "Events" — shown as secondary text. */
  role?: string;
}

export interface PersonaSwitcherProps {
  personas: Persona[];
  /** Currently active persona id (read server-side from the cookie). */
  current?: string;
  /** Cookie the server reads to scope the experience. Default "viox_persona". */
  cookieName?: string;
  className?: string;
}

/** Topbar persona selector — writes a cookie and refreshes the server tree. */
export function PersonaSwitcher({
  personas,
  current,
  cookieName = 'viox_persona',
  className = '',
}: PersonaSwitcherProps) {
  const router = useRouter();
  const [value, setValue] = React.useState(current ?? personas[0]?.id ?? '');

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setValue(id);
    document.cookie = `${cookieName}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="pointer-events-none absolute left-3 text-[var(--muted)]">
        <PersonaIcon />
      </span>
      <select
        value={value}
        onChange={onChange}
        aria-label="Switch persona"
        className="h-9 cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--panel)] pl-9 pr-8 text-sm text-[var(--text)] outline-none transition-colors hover:border-[rgba(201,153,92,.4)] focus:border-[var(--accent)]"
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id} className="bg-[#111A2E] text-[#E8EDF7]">
            {p.label}
            {p.role ? ` — ${p.role}` : ''}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[var(--muted)]">
        <Chevron />
      </span>
    </label>
  );
}

function PersonaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
