import type { Metadata } from 'next';
import * as React from 'react';
import { Jost } from 'next/font/google';
import { cookies } from 'next/headers';
import { CopilotPanel, PersonaSwitcher, Shell, type Persona, type SidebarNavGroup } from '@viox/ui';
import './globals.css';

const jost = Jost({ subsets: ['latin'], variable: '--font-jost', display: 'swap' });

export const metadata: Metadata = {
  title: 'VioX CRM — Buena Vista',
  description:
    'Guest & growth backend for Buena Vista Restaurant & Bar — guests, reservations, segments, campaigns and event leads on the VioX Restaurant OS.',
};

const PERSONAS: Persona[] = [
  { id: 'marketing', label: 'Priya Raman', role: 'Marketing' },
  { id: 'events', label: 'Lucía Herrera', role: 'Events' },
  { id: 'owner', label: 'Christian Nuñez', role: 'Owner' },
];

const COPILOT_PROMPTS = [
  'Who should get the paella preview?',
  'Which VIPs lapsed this quarter?',
  'Draft an SMS for late night EV',
];

const NAV: SidebarNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', exact: true, icon: <GaugeIcon /> }],
  },
  {
    label: 'Guests',
    items: [
      { label: 'Guests', href: '/guests', icon: <GuestsIcon /> },
      { label: 'Reservations', href: '/reservations', icon: <CalendarIcon /> },
      { label: 'Waitlist', href: '/waitlist', icon: <HourglassIcon /> },
      { label: 'Inbox', href: '/inbox', icon: <InboxIcon /> },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Segments', href: '/segments', icon: <SegmentsIcon /> },
      { label: 'Campaigns', href: '/campaigns', icon: <MegaphoneIcon /> },
      { label: 'Event Leads', href: '/leads', icon: <FlagIcon /> },
    ],
  },
  {
    label: 'AI Team',
    items: [{ label: 'Agents', href: '/agents', icon: <BotIcon /> }],
  },
  {
    label: 'System',
    items: [
      { label: 'Integrations', href: '/integrations', icon: <PlugIcon /> },
      { label: 'Settings', href: '/settings', icon: <CogIcon /> },
    ],
  },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get('viox_persona')?.value;
  const persona = PERSONAS.some((p) => p.id === raw) ? (raw as string) : 'marketing';

  return (
    <html lang="en" className={jost.variable}>
      <body className={jost.className}>
        <Shell
          logo={<CrmMark />}
          productName="VioX CRM"
          nav={NAV}
          personaSlot={<PersonaSwitcher personas={PERSONAS} current={persona} />}
          topbarExtra={
            <CopilotPanel
              persona={persona}
              title="VioX Copilot"
              suggestedPrompts={COPILOT_PROMPTS}
            />
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}

/* ---------- brand mark ---------- */

function CrmMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(212,164,55,.45)] bg-[rgba(212,164,55,.1)] text-[var(--accent2)]">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.7-2.8 3-4.2 5.5-4.2s4.8 1.4 5.5 4.2" />
        <path d="M16.5 4.5 17.6 7.4 20.5 8.5 17.6 9.6 16.5 12.5 15.4 9.6 12.5 8.5 15.4 7.4 16.5 4.5Z" />
      </svg>
    </div>
  );
}

/* ---------- nav icons (minimal inline SVG, 1.5px strokes) ---------- */

function iconProps(extra?: string) {
  return {
    viewBox: '0 0 24 24',
    className: `h-4 w-4 ${extra ?? ''}`,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function GaugeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 14a8 8 0 1 1 16 0" />
      <path d="M12 14 15.5 9.5" />
      <path d="M3.5 18.5h17" />
    </svg>
  );
}

function GuestsIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8.5" r="2.75" />
      <path d="M4 18.5c.7-2.7 2.8-4 5-4s4.3 1.3 5 4" />
      <path d="M15.5 6.2a2.6 2.6 0 1 1 1.6 4.9M17.5 14.3c1.5.5 2.6 1.6 3 3.4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5M8.5 14h2.5" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5v2.8c0 2.6 1.9 4.2 4.5 5.7 2.6-1.5 4.5-3.1 4.5-5.7V3.5" />
      <path d="M7.5 20.5v-2.8c0-2.6 1.9-4.2 4.5-5.7 2.6 1.5 4.5 3.1 4.5 5.7v2.8" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 13.5V8a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 8v5.5" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20v3.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17v-3.5Z" />
    </svg>
  );
}

function SegmentsIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z" />
      <path d="M15.5 8.5V3.9A8.5 8.5 0 0 1 20.1 8.5h-4.6Z" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 10.5v3.5h3l6.5 4V6l-6.5 4H4Z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5.5M7.5 14.5l1 5" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6 21V4" />
      <path d="M6 5c2-1.3 4-1.3 6 0s4 1.3 6 0v8c-2 1.3-4 1.3-6 0s-4-1.3-6 0" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="5" y="8.5" width="14" height="10" rx="2.5" />
      <path d="M12 5.5v3M12 3.5a1 1 0 1 0 0 .01" />
      <path d="M9 13h.01M15 13h.01" />
      <path d="M9.5 16h5" />
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

function CogIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M19.5 12a7.5 7.5 0 0 0-.12-1.32l2-1.55-2-3.46-2.35.97a7.5 7.5 0 0 0-2.28-1.32L14.4 2.8H9.6l-.35 2.52a7.5 7.5 0 0 0-2.28 1.32l-2.35-.97-2 3.46 2 1.55a7.6 7.6 0 0 0 0 2.64l-2 1.55 2 3.46 2.35-.97a7.5 7.5 0 0 0 2.28 1.32l.35 2.52h4.8l.35-2.52a7.5 7.5 0 0 0 2.28-1.32l2.35.97 2-3.46-2-1.55c.08-.43.12-.87.12-1.32Z" />
    </svg>
  );
}
