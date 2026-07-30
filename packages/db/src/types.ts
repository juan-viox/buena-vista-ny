// ============================================================
// VioX Restaurant OS — Domain Model (multi-tenant)
// Contract file: all apps/packages build against these types.
// Supabase schema mirrors this 1:1 (see schema.sql).
// ============================================================

export type ID = string;

// ---------- Tenancy ----------
export interface Tenant {
  id: ID;
  slug: string;            // "buena-vista"
  name: string;            // "Buena Vista Restaurant & Bar"
  theme: TenantTheme;
  createdAt: string;       // ISO
}

export interface TenantTheme {
  accent: string;          // hex — Buena Vista: #C9995C
  primary: string;         // hex — Buena Vista: #1E3A5F
  logoText: string;        // wordmark fallback
}

export interface Location {
  id: ID;
  tenantId: ID;
  name: string;            // "Hell's Kitchen"
  address: string;
  phone: string;
  timezone: string;        // "America/New_York"
}

export type Role = 'owner' | 'gm' | 'chef' | 'events' | 'marketing' | 'staff';

export interface User {
  id: ID;
  tenantId: ID;
  name: string;
  email: string;
  role: Role;
  locationIds: ID[];       // empty = all locations
}

// ---------- Inventory & COGS (MarginEdge parity) ----------
export interface Vendor {
  id: ID;
  tenantId: ID;
  name: string;            // "Baldor Specialty Foods"
  category: string;        // "Produce" | "Seafood" | "Meat" | "Dry Goods" | "Beverage" | "Wine & Spirits"
  accountNumber?: string;
  terms?: string;          // "Net 30"
}

export type Unit = 'lb' | 'oz' | 'kg' | 'g' | 'each' | 'case' | 'bottle' | 'liter' | 'gal' | 'qt' | 'dozen';

export interface InventoryItem {
  id: ID;
  tenantId: ID;
  name: string;            // "Bomba Rice"
  category: string;        // "Dry Goods" | "Seafood" | "Produce" | "Dairy" | "Meat" | "Beverage" | "Wine" | "Spirits" | "Beer"
  unit: Unit;
  lastPrice: number;       // per unit, USD
  avgPrice30d: number;
  parLevel: number;        // reorder threshold in units
  onHand: number;          // current count in units
  primaryVendorId: ID;
}

export type InvoiceStatus = 'pending_review' | 'approved' | 'exported' | 'disputed';

export interface Invoice {
  id: ID;
  tenantId: ID;
  locationId: ID;
  vendorId: ID;
  invoiceNumber: string;
  date: string;            // ISO date
  total: number;
  status: InvoiceStatus;
  lineCount: number;
  /** true when captured via photo/PDF upload (MarginEdge-style ingest) */
  scanned: boolean;
}

export interface InvoiceLine {
  id: ID;
  invoiceId: ID;
  itemId: ID;
  description: string;     // raw vendor description
  qty: number;
  unit: Unit;
  unitPrice: number;
  total: number;
  /** % change vs the item's trailing average price; drives price alerts */
  priceChangePct: number;
}

export interface Recipe {
  id: ID;
  tenantId: ID;
  menuItemName: string;    // "Paella Buenavista"
  menuPrice: number;       // 59
  category: string;        // "Mains" | "Starters" | "Cocktails" | "Desserts" | "Brunch"
  ingredients: RecipeIngredient[];
  plateCost: number;       // computed sum
  costPct: number;         // plateCost / menuPrice * 100
  targetCostPct: number;   // e.g. 28
}

export interface RecipeIngredient {
  itemId: ID;
  itemName: string;
  qty: number;
  unit: Unit;
  cost: number;            // qty * current unit price (normalized)
}

export interface InventoryCount {
  id: ID;
  tenantId: ID;
  locationId: ID;
  date: string;
  countedBy: string;
  totalValue: number;
  status: 'in_progress' | 'finalized';
  itemsCounted: number;
}

export interface PriceAlert {
  id: ID;
  tenantId: ID;
  itemId: ID;
  itemName: string;
  vendorName: string;
  oldPrice: number;
  newPrice: number;
  changePct: number;
  date: string;
  acknowledged: boolean;
}

// ---------- POS Ops & Sales (Toast parity) ----------
export interface DailySales {
  id: ID;
  tenantId: ID;
  locationId: ID;
  date: string;            // ISO date
  netSales: number;
  grossSales: number;
  guestCount: number;
  checkCount: number;
  avgCheck: number;
  comps: number;
  voids: number;
  laborCost: number;
  laborPct: number;        // laborCost / netSales * 100
  categorySales: Record<string, number>; // {"Food": 8200, "Cocktails": 3100, "Wine": 1400, "Beer": 500, "NA Bev": 300}
  dayparts: Record<string, number>;      // {"Lunch": 2800, "Dinner": 9400, "Late Night": 1300}
}

export interface MenuItemSales {
  id: ID;
  tenantId: ID;
  locationId: ID;
  period: string;          // "2026-07" month key
  menuItemName: string;
  category: string;
  qtySold: number;
  netSales: number;
  plateCost: number;       // unit cost at period
  margin: number;          // netSales - qtySold*plateCost
  /** menu-engineering quadrant */
  quadrant: 'star' | 'plow_horse' | 'puzzle' | 'dog';
}

export interface LaborShift {
  id: ID;
  tenantId: ID;
  locationId: ID;
  date: string;
  role: string;            // "Server" | "Bartender" | "Line Cook" | "Host" | "Manager"
  employee: string;
  hours: number;
  wage: number;            // hourly
  cost: number;
}

// ---------- Catering & Events (Caterease parity) ----------
export type EventStage = 'lead' | 'proposal' | 'tasting' | 'booked' | 'beo_final' | 'completed' | 'lost';
export type EventType = 'private_dinner' | 'corporate' | 'birthday' | 'wedding_rehearsal' | 'buyout' | 'offsite_catering';

export interface CateringEvent {
  id: ID;
  tenantId: ID;
  locationId: ID;
  guestId?: ID;            // link to CRM guest
  title: string;           // "Vega Corporate Holiday Dinner"
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  type: EventType;
  stage: EventStage;
  eventDate: string;       // ISO datetime
  partySize: number;
  space: string;           // "Main Dining" | "Private Room" | "Full Buyout" | "Offsite"
  budget: number;          // estimated value
  quotedTotal: number;
  depositPaid: boolean;
  depositAmount: number;
  menuPackage: string;     // "Paella Feast" | "Tapas Reception" | "Plated Dinner" | "Brunch Social"
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BEO {
  id: ID;
  eventId: ID;
  version: number;
  timeline: { time: string; item: string }[];   // service timeline
  menu: { course: string; items: string[] }[];
  staffing: { role: string; count: number }[];
  rentals: string[];
  av: string[];
  dietaryNotes: string;
  status: 'draft' | 'sent' | 'signed';
}

export interface EventPayment {
  id: ID;
  eventId: ID;
  date: string;
  amount: number;
  method: 'card' | 'ach' | 'check' | 'cash';
  kind: 'deposit' | 'balance' | 'refund';
}

// ---------- CRM & Guest Marketing ----------
export type GuestTag = 'vip' | 'regular' | 'big_spender' | 'event_host' | 'brunch' | 'wine_club' | 'birthday_month' | 'lapsed' | 'new';

export interface Guest {
  id: ID;
  tenantId: ID;
  name: string;
  email: string;
  phone?: string;
  tags: GuestTag[];
  visits: number;
  lifetimeSpend: number;
  avgSpend: number;
  lastVisit: string;       // ISO date
  favoriteLocationId: ID;
  favoriteItems: string[];
  birthday?: string;       // "07-14" MM-DD
  notes: string;
  source: 'pos' | 'reservation' | 'newsletter' | 'event' | 'walk_in';
  marketingOptIn: boolean;
  createdAt: string;
}

export interface Reservation {
  id: ID;
  tenantId: ID;
  locationId: ID;
  guestId: ID;
  date: string;            // ISO datetime
  partySize: number;
  status: 'upcoming' | 'seated' | 'completed' | 'no_show' | 'cancelled';
  occasion?: string;
  source: 'opentable' | 'phone' | 'walk_in' | 'website';
}

export interface Segment {
  id: ID;
  tenantId: ID;
  name: string;            // "VIP — 10+ visits"
  description: string;
  guestCount: number;
  rules: string;           // human-readable rule summary (demo)
}

export type CampaignChannel = 'email' | 'sms' | 'whatsapp';
export type CampaignStatus = 'draft' | 'scheduled' | 'sent';

export interface Campaign {
  id: ID;
  tenantId: ID;
  name: string;            // "Paella Wednesdays — VIP preview"
  channel: CampaignChannel;
  segmentId: ID;
  status: CampaignStatus;
  scheduledFor?: string;
  sentAt?: string;
  stats?: { sent: number; opened: number; clicked: number; reservations: number };
  subject?: string;
  body: string;
}

export interface ActivityEvent {
  id: ID;
  tenantId: ID;
  at: string;              // ISO datetime
  actor: string;           // user or system name
  module: 'inventory' | 'sales' | 'events' | 'crm' | 'system';
  message: string;         // "Invoice #BS-2214 from Baldor approved — $1,842.10"
}

// ---------- Integrations ----------
export type IntegrationProvider = 'toast' | 'marginedge' | 'caterease';
export type IntegrationStatus = 'connected_demo' | 'awaiting_credentials' | 'connected_live' | 'error';

export interface IntegrationState {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  lastSyncAt?: string;
  detail: string;          // human summary of what syncs
}
