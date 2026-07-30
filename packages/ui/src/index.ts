// ============================================================
// @viox/ui — VioX Command design kit (dark command-center)
// Server components by default; 'use client' only where marked.
// ============================================================

// formatting
export { fmtUSD, fmtUSDk, fmtPct, fmtSignedPct, fmtNumber, fmtDate, fmtDateTime, trendPct } from './format';

// primitives
export { Card, type CardProps } from './Card';
export { Kicker } from './Kicker';
export { Stat, type StatProps } from './Stat';
export { StatRow, type StatRowProps } from './StatRow';
export { DataTable, type DataTableProps, type Column } from './DataTable';
export { Badge, statusTone, statusLabel, type BadgeProps, type BadgeTone } from './Badge';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export { Sparkline, type SparklineProps } from './Sparkline'; // 'use client'
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { Tabs, type TabsProps, type TabDef } from './Tabs'; // 'use client'

// app chrome
export { Shell, type ShellProps, type SidebarNavGroup, type SidebarNavItem } from './Shell';
export { NavLink, type NavLinkProps } from './NavLink'; // 'use client'
export { PersonaSwitcher, type PersonaSwitcherProps, type Persona } from './PersonaSwitcher'; // 'use client'
export { LocationFilter, type LocationFilterProps, type LocationOption } from './LocationFilter'; // 'use client'

// copilot
export { CopilotPanel, type CopilotPanelProps } from './CopilotPanel'; // 'use client'
