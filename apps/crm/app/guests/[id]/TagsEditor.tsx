'use client';

import * as React from 'react';
import type { GuestTag } from '@viox/db';
import { Badge, statusLabel } from '@viox/ui';

const ALL_TAGS: GuestTag[] = [
  'vip', 'regular', 'big_spender', 'event_host', 'brunch', 'wine_club', 'birthday_month', 'lapsed', 'new',
];

/** Local (demo) tag editor — add/remove chips, state lives in the browser only. */
export function TagsEditor({ initialTags }: { initialTags: GuestTag[] }) {
  const [tags, setTags] = React.useState<GuestTag[]>(initialTags);
  const [adding, setAdding] = React.useState(false);

  const available = ALL_TAGS.filter((t) => !tags.includes(t));
  const remove = (tag: GuestTag) => setTags((prev) => prev.filter((t) => t !== tag));
  const add = (tag: GuestTag) => {
    setTags((prev) => [...prev, tag]);
    setAdding(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center">
            <Badge status={tag} className="pr-1">
              {statusLabel(tag)}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove tag ${statusLabel(tag)}`}
                className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors hover:bg-white/[.12]"
              >
                <XIcon />
              </button>
            </Badge>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-[var(--muted)]">No tags yet.</span>}
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors ${
              adding
                ? 'border-[rgba(212,164,55,.5)] text-[var(--accent2)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <PlusIcon /> Add tag
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="inline-flex items-center rounded-full border border-[var(--border)] bg-white/[.03] px-2 py-0.5 text-[11px] font-medium leading-4 text-[var(--muted)] transition-colors hover:border-[rgba(212,164,55,.45)] hover:text-[var(--accent2)]"
            >
              {statusLabel(tag)}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-[11px] text-[var(--muted)]">
        Edits stay in this browser — the demo dataset resets on reload.
      </p>
    </div>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="m3 3 6 6M9 3l-6 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M6 2.5v7M2.5 6h7" />
    </svg>
  );
}
