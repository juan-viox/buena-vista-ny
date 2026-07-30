import * as React from 'react';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getRepository } from '@viox/db';
import {
  Shell,
  LocationFilter,
  PersonaSwitcher,
  CopilotPanel,
  ThemeToggle,
  UserChip,
  THEME_INIT_SCRIPT,
  type Persona,
  type SidebarNavGroup,
} from '@viox/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'VioX AI OS — Buena Vista',
  description:
    'Operator backend for Buena Vista Restaurant & Bar — inventory, sales, labor, events, and the VioX copilot in one command center.',
};

const PERSONAS: Persona[] = [
  { id: 'owner', label: 'Christian Nuñez', role: 'Owner' },
  { id: 'gm', label: 'Marisol Guzmán', role: 'GM' },
  { id: 'chef', label: 'Rafael Ortega', role: 'Chef' },
  { id: 'events', label: 'Lucía Herrera', role: 'Events' },
];

const SUGGESTED_PROMPTS = [
  'How did we do last week vs prior?',
  "What's driving food cost up?",
  'Which events need BEOs signed?',
  'Who are our lapsed VIPs worth a win-back?',
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const repo = getRepository();
  const [locations, cookieStore] = await Promise.all([repo.getLocations(), cookies()]);

  const personaCookie = cookieStore.get('viox_persona')?.value;
  const persona = PERSONAS.some((p) => p.id === personaCookie) ? (personaCookie as string) : 'owner';

  // Session chip — only rendered when an auth/demo cookie exists, so
  // flag-off deployments (no cookies ever set) look exactly as before.
  const accessToken = cookieStore.get('sb-access')?.value;
  const isDemoSession = cookieStore.get('viox-demo')?.value === '1';
  let sessionChip: React.ReactNode = null;
  if (accessToken) {
    const email = decodeJwtEmail(accessToken);
    const users = await repo.getUsers();
    const match = email ? users.find((u) => u.email.toLowerCase() === email.toLowerCase()) : undefined;
    sessionChip = <UserChip name={match?.name ?? email ?? 'Signed in'} role={match?.role ?? 'staff'} />;
  } else if (isDemoSession) {
    sessionChip = <UserChip demo name="Demo" role="read-only" />;
  }

  const nav: SidebarNavGroup[] = [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', href: '/', icon: <DashboardIcon />, exact: true }],
    },
    {
      label: 'Inventory',
      items: [
        { label: 'Inventory', href: '/inventory', icon: <BoxIcon /> },
        { label: 'Invoices', href: '/invoices', icon: <ReceiptIcon /> },
        { label: 'Recipes & Costing', href: '/recipes', icon: <RecipeIcon /> },
        { label: 'Menus', href: '/menus', icon: <MenuBookIcon /> },
      ],
    },
    {
      label: 'Sales',
      items: [
        { label: 'Sales', href: '/sales', icon: <ChartIcon /> },
        { label: 'Menu Performance', href: '/menu-performance', icon: <QuadrantIcon /> },
        { label: 'Labor', href: '/labor', icon: <ClockIcon /> },
      ],
    },
    {
      label: 'Events',
      items: [
        { label: 'Pipeline', href: '/events', icon: <FunnelIcon /> },
        { label: 'Calendar', href: '/calendar', icon: <CalendarIcon /> },
      ],
    },
    {
      label: 'AI Team',
      items: [{ label: 'Agents', href: '/agents', icon: <AgentsIcon /> }],
    },
    {
      label: 'System',
      items: [
        { label: 'Connections', href: '/integrations', icon: <PlugIcon /> },
        { label: 'Team', href: '/team', icon: <TeamIcon /> },
        { label: 'Settings', href: '/settings', icon: <GearIcon /> },
      ],
    },
  ];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Shell
          productName="VioX AI OS"
          nav={nav}
          locationSlot={
            <Suspense fallback={<div className="h-9 w-44 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />}>
              <LocationFilter locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
            </Suspense>
          }
          personaSlot={<PersonaSwitcher personas={PERSONAS} current={persona} />}
          topbarExtra={
            <>
              {sessionChip}
              <ThemeToggle />
              <CopilotPanel
                persona={persona}
                suggestedPrompts={SUGGESTED_PROMPTS}
                title="VioX Copilot"
              />
            </>
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}

// ---------- Session helpers ----------

/** Display-only claim read from the GoTrue JWT. The middleware is the
 * actual gate (validates against /auth/v1/user); this only picks the
 * name/role chip, so an unverified decode is fine here. */
function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { email?: unknown };
    return typeof claims.email === 'string' ? claims.email : null;
  } catch {
    return null;
  }
}

// ---------- Minimal inline nav icons (1.5px stroke, 24 grid) ----------

function iconProps(extra?: string) {
  return {
    viewBox: '0 0 24 24',
    className: `h-4 w-4 ${extra ?? ''}`,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function DashboardIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6 3.5h12V21l-2-1.3-2 1.3-2-1.3L10 21l-2-1.3L6 21V3.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </svg>
  );
}

function RecipeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M8.5 8.5A3.5 3.5 0 0 1 12 5a3.5 3.5 0 0 1 3.5 3.5H19a2 2 0 0 1 0 4h-.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19v-6.5H5a2 2 0 0 1 0-4h3.5Z" />
      <path d="M9.5 16.5h5" />
    </svg>
  );
}

function MenuBookIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 6.5c-1.4-1.3-3.4-2-5.5-2-1 0-2 .15-2.5.4v13.6c.5-.25 1.5-.4 2.5-.4 2.1 0 4.1.7 5.5 2 1.4-1.3 3.4-2 5.5-2 1 0 2 .15 2.5.4V4.9c-.5-.25-1.5-.4-2.5-.4-2.1 0-4.1.7-5.5 2Z" />
      <path d="M12 6.5v13.6" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 4v16h16" />
      <path d="m7.5 14 3.5-4 3 2.5 4.5-5.5" />
    </svg>
  );
}

function QuadrantIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
      <path d="m8 8 .8.8M15.2 15.2l.8.8" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function FunnelIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6L4 5Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 4.5 13.6 9.4 18.5 11 13.6 12.6 12 17.5 10.4 12.6 5.5 11 10.4 9.4 12 4.5Z" />
      <path d="M18.5 4.5v2.5M17.25 5.75h2.5M6 17.5v2M5 18.5h2" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 3.5V8M15 3.5V8" />
      <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0V8Z" />
      <path d="M12 17v3.5" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.9a3 3 0 0 1 0 5.2M17 13.9a5.5 5.5 0 0 1 3.5 5.1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2m0 12.6v2.2m8.5-8.5h-2.2M5.7 12H3.5m14.9-6.4-1.6 1.6M7.2 16.8l-1.6 1.6m0-12.8 1.6 1.6m9.6 9.6 1.6 1.6" />
    </svg>
  );
}
