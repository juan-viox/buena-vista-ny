import * as React from 'react';
import { NavLink } from './NavLink';

// ---------- Sidebar nav config types ----------
export interface SidebarNavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  /** Match only the exact path (index routes). */
  exact?: boolean;
}

export interface SidebarNavGroup {
  /** Optional group label, e.g. "COGS & Inventory". */
  label?: string;
  items: SidebarNavItem[];
}

export interface ShellProps {
  /** Brand slot at the top of the sidebar (logo mark / wordmark). */
  logo?: React.ReactNode;
  /** Product name under/next to the logo, e.g. "Buena Vista OS". */
  productName?: string;
  nav: SidebarNavGroup[];
  /** Topbar left slot — usually <LocationFilter />. */
  locationSlot?: React.ReactNode;
  /** Topbar right slot — usually <PersonaSwitcher />. */
  personaSlot?: React.ReactNode;
  /** Extra topbar right content — usually <CopilotPanel />. */
  topbarExtra?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * App chrome for VioX Command: fixed left sidebar (logo, nav groups,
 * "Powered by VioX AI"), sticky topbar (location + persona + copilot
 * slots) and the page content container. Server component — all
 * interactivity lives in the small client children passed into slots.
 */
export function Shell({ logo, productName, nav, locationSlot, personaSlot, topbarExtra, children }: ShellProps) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--border)] bg-[var(--panel2)]">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4">
          {logo ?? <DefaultMark />}
          {productName && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight text-[var(--text)]">{productName}</div>
              <div className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Restaurant OS</div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {nav.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && (
                <div className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} exact={item.exact} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">
            <BoltIcon />
            Powered by <span className="font-semibold text-[var(--accent)]">VioX AI</span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[rgba(11,17,32,.85)] px-6 backdrop-blur">
          <div className="flex items-center gap-3">{locationSlot}</div>
          <div className="flex items-center gap-2.5">
            {topbarExtra}
            {personaSlot}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] space-y-6 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

function DefaultMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.1)] text-sm font-bold text-[var(--accent)]">
      BV
    </div>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
    </svg>
  );
}
