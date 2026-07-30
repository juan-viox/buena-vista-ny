'use client';

import * as React from 'react';
import type { LiveMenuLocation, LiveMenuItem } from '@viox/db';
import { Badge, Card, EmptyState, PageHeader, Stat, StatRow, fmtNumber, fmtPct, fmtUSD } from '@viox/ui';

// ============================================================
// MenuManager — Popmenu-parity menu editor (client, local state).
// Inline price edits, 86 toggles, featured stars, search, and a
// publish flow that explains the site-publishing pipeline.
// ============================================================

export interface RecipeMatch {
  recipeId: string;
  recipeName: string;
  plateCost: number;
  recipePrice: number;
  targetCostPct: number;
}

interface Props {
  locations: LiveMenuLocation[];
  /** Costed-recipe match per `${loc}:${slug}` menu item. */
  recipeBySlug: Record<string, RecipeMatch>;
}

const LOC_LABELS: Record<string, string> = {
  'hells-kitchen': "Hell's Kitchen",
  'east-village': 'East Village',
};

function locLabel(loc: string): string {
  return LOC_LABELS[loc] ?? loc.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

type FlatItem = LiveMenuItem & { uid: string };

export function MenuManager({ locations, recipeBySlug }: Props) {
  const [loc, setLoc] = React.useState(locations[0]?.loc ?? '');
  const [q, setQ] = React.useState('');
  const [priceEdits, setPriceEdits] = React.useState<Record<string, number>>({});
  const [eightySix, setEightySix] = React.useState<Record<string, boolean>>({});
  const [featured, setFeatured] = React.useState<Record<string, boolean>>({});
  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const l of locations) if (l.menus[0]) init[`${l.loc}:${l.menus[0].menuSlug}`] = true;
    return init;
  });
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishedKeys, setPublishedKeys] = React.useState<Record<string, true>>({});
  const [lastPublished, setLastPublished] = React.useState<string | null>(null);

  const active = locations.find((l) => l.loc === loc) ?? locations[0];

  // ---------- flat items with stable uids ----------
  const flatByLoc = React.useMemo(() => {
    const map = new Map<string, FlatItem[]>();
    for (const l of locations) {
      const flat: FlatItem[] = [];
      l.menus.forEach((m, mi) =>
        m.sections.forEach((s, si) =>
          s.items.forEach((it, ii) => flat.push({ ...it, uid: `${l.loc}:${mi}:${si}:${ii}` })),
        ),
      );
      map.set(l.loc, flat);
    }
    return map;
  }, [locations]);

  const activeItems = flatByLoc.get(active?.loc ?? '') ?? [];
  const effectivePrice = (it: FlatItem) => priceEdits[it.uid] ?? it.price;

  // ---------- stats (active location, edits applied) ----------
  const priced = activeItems.filter((it) => effectivePrice(it) > 0);
  const avgPrice = priced.length ? priced.reduce((s, it) => s + effectivePrice(it), 0) / priced.length : 0;
  const withPhoto = activeItems.filter((it) => it.photo).length;
  const photoPct = activeItems.length ? (withPhoto / activeItems.length) * 100 : 0;
  const outCount = activeItems.filter((it) => eightySix[it.uid]).length;
  const sectionCount = active?.menus.reduce((s, m) => s + m.sections.length, 0) ?? 0;

  const avgByMenu = (active?.menus ?? [])
    .map((m) => {
      const items = (flatByLoc.get(active!.loc) ?? []).filter((it) => it.menuSlug === m.menuSlug && effectivePrice(it) > 0);
      const avg = items.length ? items.reduce((s, it) => s + effectivePrice(it), 0) / items.length : 0;
      return { menu: m.menu.replace(/ Menu$/, ''), avg, n: items.length };
    })
    .filter((m) => m.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  // ---------- pending changes vs last publish ----------
  const changeKeys = [
    ...Object.keys(priceEdits).map((k) => `price:${k}`),
    ...Object.keys(eightySix).filter((k) => eightySix[k]).map((k) => `86:${k}`),
    ...Object.keys(featured).filter((k) => featured[k]).map((k) => `star:${k}`),
  ];
  const pending = changeKeys.filter((k) => !publishedKeys[k]);
  const changeCounts = {
    price: Object.keys(priceEdits).length,
    out: Object.keys(eightySix).filter((k) => eightySix[k]).length,
    star: Object.keys(featured).filter((k) => featured[k]).length,
  };

  // ---------- search ----------
  const query = norm(q.trim());
  const matches = (it: FlatItem) =>
    query.length === 0 ||
    norm(`${it.name} ${it.desc} ${it.section} ${it.menu}`).includes(query);

  const publish = () => {
    setPublishedKeys(Object.fromEntries(changeKeys.map((k) => [k, true as const])));
    setLastPublished(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    setPublishOpen(false);
  };

  return (
    <>
      <PageHeader
        kicker="Inventory · Menus"
        title="Menu Manager"
        subtitle="The OS is the menu source of truth — every price change, 86, and feature flag here publishes out to the live site, not the other way around."
        actions={
          <div className="flex items-center gap-2">
            {lastPublished && pending.length === 0 && <Badge tone="good">Published {lastPublished}</Badge>}
            {pending.length > 0 && <Badge tone="warn">{pending.length} unpublished</Badge>}
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
            >
              Publish to site
            </button>
          </div>
        }
      />

      {/* ---------- location tabs + search ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-1" role="tablist" aria-label="Location">
          {locations.map((l) => {
            const isActive = l.loc === active?.loc;
            return (
              <button
                key={l.loc}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setLoc(l.loc)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-[var(--accent)] text-[var(--text)]'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {locLabel(l.loc)}
                <span className="ml-1.5 rounded-full bg-white/[.06] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
                  {l.itemCount}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative pb-2">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes, sections, descriptions…"
            className="w-64 rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      </div>

      {/* ---------- stats row ---------- */}
      <StatRow cols={4}>
        <Stat
          label="Menu items"
          value={fmtNumber(activeItems.length)}
          hint={`${active?.menus.length ?? 0} menus · ${sectionCount} sections at ${locLabel(active?.loc ?? '')}`}
          highlight
        />
        <Stat
          label="Avg item price"
          value={fmtUSD(avgPrice)}
          hint={avgByMenu.map((m) => `${m.menu} ${fmtUSD(m.avg)}`).join(' · ') || 'no priced items'}
        />
        <Stat
          label="Photo coverage"
          value={fmtPct(photoPct, 0)}
          hint={`${fmtNumber(withPhoto)} of ${fmtNumber(activeItems.length)} items photographed`}
        />
        <Stat
          label="86'd right now"
          value={fmtNumber(outCount)}
          hint={outCount > 0 ? 'hidden from the live site at next publish' : 'full menu available'}
        />
      </StatRow>

      {/* ---------- menu accordion ---------- */}
      <div className="space-y-3">
        {(active?.menus ?? []).map((menu) => {
          const menuItems = activeItems.filter((it) => it.menuSlug === menu.menuSlug && matches(it));
          if (query && menuItems.length === 0) return null;
          const key = `${active!.loc}:${menu.menuSlug}`;
          const isOpen = query.length > 0 || Boolean(openMenus[key]);
          const menuOut = activeItems.filter((it) => it.menuSlug === menu.menuSlug && eightySix[it.uid]).length;
          return (
            <Card key={key} flush>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenMenus((prev) => ({ ...prev, [key]: !isOpen }))}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Chevron open={isOpen} />
                  <span className="truncate text-sm font-semibold text-[var(--text)]">{menu.menu}</span>
                  <span className="text-xs tabular-nums text-[var(--muted)]">
                    {query ? `${menuItems.length} of ${menu.itemCount}` : menu.itemCount} items · {menu.sections.length}{' '}
                    {menu.sections.length === 1 ? 'section' : 'sections'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {menuOut > 0 && <Badge tone="bad">{menuOut} 86&apos;d</Badge>}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border)]">
                  {menu.sections.map((section) => {
                    const sectionItems = menuItems.filter((it) => it.section === section.section);
                    if (sectionItems.length === 0) return null;
                    return (
                      <div key={section.section}>
                        <div className="bg-[var(--panel2)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {section.section}
                          <span className="ml-2 normal-case tracking-normal">{sectionItems.length}</span>
                        </div>
                        <div className="divide-y divide-[var(--border)]">
                          {sectionItems.map((it) => (
                            <ItemRow
                              key={it.uid}
                              item={it}
                              match={recipeBySlug[`${it.loc}:${it.slug}`]}
                              editedPrice={priceEdits[it.uid]}
                              isOut={Boolean(eightySix[it.uid])}
                              isFeatured={Boolean(featured[it.uid])}
                              onPrice={(value) =>
                                setPriceEdits((prev) => {
                                  const next = { ...prev };
                                  if (value === null || value === it.price) delete next[it.uid];
                                  else next[it.uid] = value;
                                  return next;
                                })
                              }
                              onToggleOut={() =>
                                setEightySix((prev) => ({ ...prev, [it.uid]: !prev[it.uid] }))
                              }
                              onToggleFeatured={() =>
                                setFeatured((prev) => ({ ...prev, [it.uid]: !prev[it.uid] }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {query && activeItems.filter(matches).length === 0 && (
          <EmptyState
            title={`No items match "${q.trim()}"`}
            message={`Nothing on the ${locLabel(active?.loc ?? '')} menus matches — try a dish name, section, or ingredient.`}
            action={
              <button
                type="button"
                onClick={() => setQ('')}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[.04]"
              >
                Clear search
              </button>
            }
          />
        )}
      </div>

      <div className="text-xs text-[var(--muted)]">
        Live menu scraped from the current site · plate-cost chips appear where a dish is costed in Recipes &amp;
        Costing · edits are local until published.
      </div>

      {/* ---------- publish modal ---------- */}
      {publishOpen && (
        <PublishModal
          pendingCount={pending.length}
          counts={changeCounts}
          onClose={() => setPublishOpen(false)}
          onPublish={publish}
        />
      )}
    </>
  );
}

// ============================================================
// Item row
// ============================================================

function ItemRow({
  item,
  match,
  editedPrice,
  isOut,
  isFeatured,
  onPrice,
  onToggleOut,
  onToggleFeatured,
}: {
  item: FlatItem;
  match?: RecipeMatch;
  editedPrice?: number;
  isOut: boolean;
  isFeatured: boolean;
  onPrice: (value: number | null) => void;
  onToggleOut: () => void;
  onToggleFeatured: () => void;
}) {
  const price = editedPrice ?? item.price;

  return (
    <div className={`flex items-center gap-4 px-5 py-3 ${isOut ? 'opacity-55' : ''}`}>
      {/* photo thumb */}
      {item.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photo}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border)] object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]">
          <PlateIcon />
        </div>
      )}

      {/* name / desc / chips */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-sm font-medium text-[var(--text)] ${isOut ? 'line-through' : ''}`}>{item.name}</span>
          {isFeatured && <Badge tone="accent">Featured</Badge>}
          {item.popular && <Badge tone="info">Popular</Badge>}
          {item.best && <Badge tone="good">Best seller</Badge>}
          {isOut && <Badge tone="bad">86&apos;d</Badge>}
        </div>
        {item.desc && <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{item.desc}</div>}
        {match && <MarginChip match={match} price={price} />}
      </div>

      {/* price (inline edit) */}
      <PriceCell price={price} original={item.price} edited={editedPrice !== undefined} onCommit={onPrice} />

      {/* actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleOut}
          aria-pressed={isOut}
          title={isOut ? 'Restore item' : "86 this item (out of stock)"}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            isOut
              ? 'border-[rgba(52,211,153,.35)] text-[var(--good)] hover:bg-[rgba(52,211,153,.08)]'
              : 'border-[var(--border)] text-[var(--muted)] hover:border-[rgba(248,113,113,.4)] hover:text-[var(--bad)]'
          }`}
        >
          {isOut ? 'Restore' : '86'}
        </button>
        <button
          type="button"
          onClick={onToggleFeatured}
          aria-pressed={isFeatured}
          title={isFeatured ? 'Remove from featured' : 'Feature on the site'}
          className={`rounded-lg border p-1.5 transition-colors ${
            isFeatured
              ? 'border-[rgba(201,153,92,.4)] text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)]'
          }`}
        >
          <StarIcon filled={isFeatured} />
        </button>
      </div>
    </div>
  );
}

function MarginChip({ match, price }: { match: RecipeMatch; price: number }) {
  const sell = price > 0 ? price : match.recipePrice;
  if (sell <= 0) return null;
  const costPct = (match.plateCost / sell) * 100;
  const margin = sell - match.plateCost;
  const tone = costPct <= match.targetCostPct ? 'good' : costPct <= match.targetCostPct + 3 ? 'warn' : 'bad';
  return (
    <div className="mt-1">
      <Badge tone={tone} className="tabular-nums" >
        <span title={`Costed as “${match.recipeName}” · target ${fmtPct(match.targetCostPct, 0)} plate cost`}>
          Plate {fmtUSD(match.plateCost)} · {fmtPct(costPct)} cost · {fmtUSD(margin)} margin
        </span>
      </Badge>
    </div>
  );
}

function PriceCell({
  price,
  original,
  edited,
  onCommit,
}: {
  price: number;
  original: number;
  edited: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const commit = () => {
    setEditing(false);
    const value = Number.parseFloat(draft);
    if (!Number.isFinite(value) || value < 0) return;
    onCommit(Math.round(value * 100) / 100);
  };

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        defaultValue={price > 0 ? String(price) : ''}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(e.target.value);
          e.target.select();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label="Edit price"
        className="w-20 shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--panel2)] px-2 py-1 text-right text-sm tabular-nums text-[var(--text)] focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit price"
      className="shrink-0 rounded-lg border border-transparent px-2 py-1 text-right transition-colors hover:border-[var(--border)] hover:bg-white/[.03]"
    >
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
        {price > 0 ? fmtUSD(price) : '—'}
      </span>
      {edited && (
        <span className="ml-1.5 text-[10px] tabular-nums text-[var(--muted)] line-through">
          {original > 0 ? fmtUSD(original) : '—'}
        </span>
      )}
      {edited && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-label="edited" />}
    </button>
  );
}

// ============================================================
// Publish modal — explains the OS → site publishing pipeline.
// ============================================================

function PublishModal({
  pendingCount,
  counts,
  onClose,
  onPublish,
}: {
  pendingCount: number;
  counts: { price: number; out: number; star: number };
  onClose: () => void;
  onPublish: () => void;
}) {
  const steps: Array<{ title: string; body: string }> = [
    {
      title: 'Write the menu fixture',
      body: 'Your edits — price changes, 86’d items, featured flags — are written to menus-live.json in @viox/db, the single menu source of truth.',
    },
    {
      title: 'Rebuild the marketing site',
      body: 'The commit triggers the site build; the public menus render from the same fixture, so the site can never drift from the OS.',
    },
    {
      title: 'Go live',
      body: 'The CDN revalidates and the updated menus are live at both locations, typically within two minutes.',
    },
  ];

  const summary = [
    counts.price > 0 ? `${counts.price} price ${counts.price === 1 ? 'change' : 'changes'}` : null,
    counts.out > 0 ? `${counts.out} 86’d` : null,
    counts.star > 0 ? `${counts.star} featured` : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Publish menus">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-pop)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Publish menus to the live site</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {summary.length > 0 ? `${summary.join(' · ')} ready to ship.` : 'No pending edits — publishing re-syncs the site with the current menu.'}
          </p>
        </div>

        <ol className="space-y-3 px-5 py-4">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--accent-ink)]">
                {i + 1}
              </span>
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">{step.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mx-5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-[11px] text-[var(--muted)]">
          Demo environment — the pipeline is wired for walkthrough. Publishing stages your changes without touching the production site.
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onPublish}
            className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            {pendingCount > 0 ? `Publish ${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'}` : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- icons ----------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-[var(--muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.7-5.1-2.8-5.1 2.8 1.1-5.7-4.3-4 5.8-.7L12 3.5Z" />
    </svg>
  );
}
