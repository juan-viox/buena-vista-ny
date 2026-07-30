// ============================================================
// @viox/agents — copilot tools bound to a DataRepository.
// Each tool returns a compact JSON string ready for the model.
// ============================================================

import type { DataRepository, DateRange, CateringEvent, Guest } from '@viox/db';

/** Demo "today" anchor — fixtures span the 90 days before this date. */
export const DEMO_TODAY = '2026-07-29';

type ToolInput = Record<string, unknown>;

export interface CopilotToolDef {
  name: string;
  /** Friendly label for UI chips, e.g. "sales summary". */
  label: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  run(repo: DataRepository, input: ToolInput): Promise<string>;
}

// ---------- small helpers ----------

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return r1(((current - previous) / Math.abs(previous)) * 100);
}

async function resolveLocationId(repo: DataRepository, name?: unknown): Promise<{ id?: string; name?: string }> {
  if (typeof name !== 'string' || !name.trim()) return {};
  const q = name.toLowerCase();
  const locations = await repo.getLocations();
  const hit = locations.find((l) => l.name.toLowerCase().includes(q) || q.includes(l.name.toLowerCase()));
  return hit ? { id: hit.id, name: hit.name } : {};
}

function sumRecord(into: Record<string, number>, from: Record<string, number>) {
  for (const [k, v] of Object.entries(from)) into[k] = r0((into[k] ?? 0) + v);
}

// ---------- tools ----------

const getSalesSummary: CopilotToolDef = {
  name: 'getSalesSummary',
  label: 'sales summary',
  description:
    'Aggregate POS sales for a date range (defaults to the last 7 days ending today, 2026-07-29): net sales, guests, checks, average check, labor %, comps/voids, category and daypart mix, best day, and % change vs the prior period. Optionally scope to one location by name ("Hell\'s Kitchen" or "East Village").',
  input_schema: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Trailing window length in days (default 7, max 90).' },
      from: { type: 'string', description: 'ISO start date (overrides days).' },
      to: { type: 'string', description: 'ISO end date (default 2026-07-29).' },
      locationName: { type: 'string', description: 'Location name filter, e.g. "Hell\'s Kitchen".' },
    },
  },
  async run(repo, input) {
    const to = typeof input.to === 'string' ? input.to.slice(0, 10) : DEMO_TODAY;
    const days = Math.min(Math.max(Number(input.days) || 7, 1), 90);
    const from = typeof input.from === 'string' ? input.from.slice(0, 10) : addDays(to, -(days - 1));
    const span = Math.max(
      1,
      Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1,
    );
    const prevRange: DateRange = { from: addDays(from, -span), to: addDays(from, -1) };

    const loc = await resolveLocationId(repo, input.locationName);
    const filter = (rows: Awaited<ReturnType<DataRepository['getDailySales']>>) =>
      loc.id ? rows.filter((d) => d.locationId === loc.id) : rows;

    const [current, previous, locations] = await Promise.all([
      repo.getDailySales({ from, to }).then(filter),
      repo.getDailySales(prevRange).then(filter),
      repo.getLocations(),
    ]);

    const total = (rows: typeof current) => rows.reduce((a, d) => a + d.netSales, 0);
    const netSales = total(current);
    const prevNet = total(previous);
    const guests = current.reduce((a, d) => a + d.guestCount, 0);
    const checks = current.reduce((a, d) => a + d.checkCount, 0);
    const laborCost = current.reduce((a, d) => a + d.laborCost, 0);
    const comps = current.reduce((a, d) => a + d.comps, 0);
    const voids = current.reduce((a, d) => a + d.voids, 0);

    const categories: Record<string, number> = {};
    const dayparts: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    let best = { date: '', netSales: 0 };
    for (const d of current) {
      sumRecord(categories, d.categorySales);
      sumRecord(dayparts, d.dayparts);
      const locName = locations.find((l) => l.id === d.locationId)?.name ?? d.locationId;
      byLocation[locName] = r0((byLocation[locName] ?? 0) + d.netSales);
      if (d.netSales > best.netSales) best = { date: d.date.slice(0, 10), netSales: r0(d.netSales) };
    }

    return JSON.stringify({
      range: { from, to },
      location: loc.name ?? 'all',
      netSales: r0(netSales),
      vsPriorPeriodPct: pctChange(netSales, prevNet),
      guests,
      checks,
      avgCheck: checks ? r2(netSales / checks) : 0,
      laborCost: r0(laborCost),
      laborPct: netSales ? r1((laborCost / netSales) * 100) : 0,
      comps: r0(comps),
      voids: r0(voids),
      byLocation,
      categoryMix: categories,
      daypartMix: dayparts,
      bestDay: best,
    });
  },
};

const getFoodCostOverview: CopilotToolDef = {
  name: 'getFoodCostOverview',
  label: 'food cost overview',
  description:
    'Plate-cost health across the menu: average cost % vs target, worst offenders over target, best margins, purchasing totals from the last 30 days of invoices, and open price alerts.',
  input_schema: { type: 'object', properties: {} },
  async run(repo) {
    const [recipes, invoices, alerts] = await Promise.all([
      repo.getRecipes(),
      repo.getInvoices(),
      repo.getPriceAlerts(),
    ]);

    const avgCostPct = recipes.length ? r1(recipes.reduce((a, x) => a + x.costPct, 0) / recipes.length) : 0;
    const avgTarget = recipes.length ? r1(recipes.reduce((a, x) => a + x.targetCostPct, 0) / recipes.length) : 0;

    const over = recipes
      .filter((x) => x.costPct > x.targetCostPct)
      .sort((a, b) => b.costPct - b.targetCostPct - (a.costPct - a.targetCostPct))
      .slice(0, 6)
      .map((x) => ({
        item: x.menuItemName,
        price: x.menuPrice,
        plateCost: r2(x.plateCost),
        costPct: r1(x.costPct),
        targetPct: x.targetCostPct,
        overByPts: r1(x.costPct - x.targetCostPct),
      }));

    const best = [...recipes]
      .sort((a, b) => a.costPct - b.costPct)
      .slice(0, 3)
      .map((x) => ({ item: x.menuItemName, costPct: r1(x.costPct) }));

    const cutoff = addDays(DEMO_TODAY, -30);
    const recent = invoices.filter((i) => i.date.slice(0, 10) >= cutoff);
    const purchases30d = r0(recent.reduce((a, i) => a + i.total, 0));
    const pendingReview = recent.filter((i) => i.status === 'pending_review').length;

    return JSON.stringify({
      recipeCount: recipes.length,
      avgCostPct,
      avgTargetPct: avgTarget,
      itemsOverTarget: recipes.filter((x) => x.costPct > x.targetCostPct).length,
      worstOffenders: over,
      bestMargins: best,
      purchases30d,
      invoices30d: recent.length,
      invoicesPendingReview: pendingReview,
      openPriceAlerts: alerts.filter((a) => !a.acknowledged).length,
    });
  },
};

const getLowStockItems: CopilotToolDef = {
  name: 'getLowStockItems',
  label: 'low stock',
  description: 'Inventory items at or below their par level, with on-hand counts, units and primary vendor — the reorder list.',
  input_schema: { type: 'object', properties: {} },
  async run(repo) {
    const [items, vendors] = await Promise.all([repo.getInventoryItems(), repo.getVendors()]);
    const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';
    const low = items
      .filter((i) => i.onHand <= i.parLevel)
      .sort((a, b) => a.onHand / (a.parLevel || 1) - b.onHand / (b.parLevel || 1))
      .slice(0, 12)
      .map((i) => ({
        item: i.name,
        category: i.category,
        onHand: r1(i.onHand),
        par: i.parLevel,
        unit: i.unit,
        lastPrice: r2(i.lastPrice),
        vendor: vendorName(i.primaryVendorId),
      }));
    return JSON.stringify({ lowStockCount: low.length, items: low });
  },
};

const getPriceAlerts: CopilotToolDef = {
  name: 'getPriceAlerts',
  label: 'price alerts',
  description: 'Vendor price spikes/drops vs trailing average, biggest moves first. Unacknowledged alerts are the ones needing action.',
  input_schema: { type: 'object', properties: {} },
  async run(repo) {
    const alerts = await repo.getPriceAlerts();
    const sorted = [...alerts].sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || Math.abs(b.changePct) - Math.abs(a.changePct));
    return JSON.stringify({
      openCount: alerts.filter((a) => !a.acknowledged).length,
      alerts: sorted.slice(0, 10).map((a) => ({
        item: a.itemName,
        vendor: a.vendorName,
        oldPrice: r2(a.oldPrice),
        newPrice: r2(a.newPrice),
        changePct: r1(a.changePct),
        date: a.date.slice(0, 10),
        acknowledged: a.acknowledged,
      })),
    });
  },
};

const getMenuEngineering: CopilotToolDef = {
  name: 'getMenuEngineering',
  label: 'menu engineering',
  description:
    'Menu-engineering matrix for a month (default "2026-07"): stars / plow horses / puzzles / dogs, top sellers, margin leaders and total margin.',
  input_schema: {
    type: 'object',
    properties: { period: { type: 'string', description: 'Month key like "2026-07".' } },
  },
  async run(repo, input) {
    const period = typeof input.period === 'string' && /^\d{4}-\d{2}$/.test(input.period) ? input.period : '2026-07';
    const raw = await repo.getMenuItemSales(period);

    // Aggregate per-location rows into one row per menu item.
    const byItem = new Map<string, (typeof raw)[number]>();
    for (const row of raw) {
      const existing = byItem.get(row.menuItemName);
      if (!existing) {
        byItem.set(row.menuItemName, { ...row });
      } else {
        // Keep the quadrant of the higher-volume location.
        if (row.netSales > existing.netSales) existing.quadrant = row.quadrant;
        existing.qtySold += row.qtySold;
        existing.netSales += row.netSales;
        existing.margin += row.margin;
      }
    }
    const rows = [...byItem.values()];

    const byQuadrant: Record<string, { count: number; items: string[] }> = {};
    for (const row of rows) {
      byQuadrant[row.quadrant] ??= { count: 0, items: [] };
      byQuadrant[row.quadrant].count++;
      if (byQuadrant[row.quadrant].items.length < 5) byQuadrant[row.quadrant].items.push(row.menuItemName);
    }

    const topSellers = [...rows]
      .sort((a, b) => b.qtySold - a.qtySold)
      .slice(0, 5)
      .map((x) => ({ item: x.menuItemName, qty: x.qtySold, netSales: r0(x.netSales), quadrant: x.quadrant }));

    const marginLeaders = [...rows]
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
      .map((x) => ({ item: x.menuItemName, margin: r0(x.margin), quadrant: x.quadrant }));

    return JSON.stringify({
      period,
      itemCount: rows.length,
      quadrants: byQuadrant,
      topSellers,
      marginLeaders,
      totalMargin: r0(rows.reduce((a, x) => a + x.margin, 0)),
      totalNetSales: r0(rows.reduce((a, x) => a + x.netSales, 0)),
    });
  },
};

const OPEN_STAGES = ['lead', 'proposal', 'tasting'] as const;
const COMMITTED_STAGES = ['booked', 'beo_final'] as const;

const getEventPipelineSummary: CopilotToolDef = {
  name: 'getEventPipelineSummary',
  label: 'event pipeline',
  description:
    'Catering & private-events pipeline: count and value by stage, open pipeline value, committed value in the next 30 days, completed and lost totals.',
  input_schema: { type: 'object', properties: {} },
  async run(repo) {
    const events = await repo.getCateringEvents();
    const value = (e: CateringEvent) => e.quotedTotal || e.budget || 0;

    const byStage: Record<string, { count: number; value: number }> = {};
    for (const e of events) {
      byStage[e.stage] ??= { count: 0, value: 0 };
      byStage[e.stage].count++;
      byStage[e.stage].value = r0(byStage[e.stage].value + value(e));
    }

    const in30 = addDays(DEMO_TODAY, 30);
    const committedNext30d = events.filter(
      (e) =>
        (COMMITTED_STAGES as readonly string[]).includes(e.stage) &&
        e.eventDate.slice(0, 10) >= DEMO_TODAY &&
        e.eventDate.slice(0, 10) <= in30,
    );

    return JSON.stringify({
      totalEvents: events.length,
      byStage,
      openPipelineValue: r0(
        events.filter((e) => (OPEN_STAGES as readonly string[]).includes(e.stage)).reduce((a, e) => a + value(e), 0),
      ),
      committedNext30d: {
        count: committedNext30d.length,
        value: r0(committedNext30d.reduce((a, e) => a + value(e), 0)),
      },
      depositsOutstanding: events.filter(
        (e) => (COMMITTED_STAGES as readonly string[]).includes(e.stage) && !e.depositPaid,
      ).length,
      completedValue: r0(events.filter((e) => e.stage === 'completed').reduce((a, e) => a + value(e), 0)),
      lostCount: events.filter((e) => e.stage === 'lost').length,
    });
  },
};

const getUpcomingEvents: CopilotToolDef = {
  name: 'getUpcomingEvents',
  label: 'upcoming events',
  description: 'Next confirmed or in-progress events (booked, BEO final, tasting, proposal) from today forward, soonest first.',
  input_schema: {
    type: 'object',
    properties: { limit: { type: 'number', description: 'Max events to return (default 8).' } },
  },
  async run(repo, input) {
    const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 20);
    const [events, locations] = await Promise.all([repo.getCateringEvents(), repo.getLocations()]);
    const active = ['booked', 'beo_final', 'tasting', 'proposal'];
    const upcoming = events
      .filter((e) => active.includes(e.stage) && e.eventDate.slice(0, 10) >= DEMO_TODAY)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .slice(0, limit)
      .map((e) => ({
        title: e.title,
        date: e.eventDate,
        stage: e.stage,
        type: e.type,
        partySize: e.partySize,
        space: e.space,
        quotedTotal: r0(e.quotedTotal || e.budget),
        depositPaid: e.depositPaid,
        menuPackage: e.menuPackage,
        contact: e.contactName,
        location: locations.find((l) => l.id === e.locationId)?.name ?? '',
      }));
    return JSON.stringify({ count: upcoming.length, events: upcoming });
  },
};

const searchGuests: CopilotToolDef = {
  name: 'searchGuests',
  label: 'guest search',
  description:
    'Search the guest book by free-text query (name, email, notes, favorite items) and/or tag (vip, regular, big_spender, event_host, brunch, wine_club, birthday_month, lapsed, new). Returns top guests by lifetime spend.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text match on name/email/notes/favorites.' },
      tag: { type: 'string', description: 'Guest tag filter, e.g. "vip".' },
    },
  },
  async run(repo, input) {
    const guests = await repo.getGuests();
    const q = typeof input.query === 'string' ? input.query.toLowerCase().trim() : '';
    const tag = typeof input.tag === 'string' ? input.tag.toLowerCase().trim().replace(/[\s-]+/g, '_') : '';

    let hits = guests;
    if (tag) hits = hits.filter((g) => (g.tags as string[]).includes(tag));
    if (q) {
      hits = hits.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.email.toLowerCase().includes(q) ||
          g.notes.toLowerCase().includes(q) ||
          g.favoriteItems.some((f) => f.toLowerCase().includes(q)),
      );
    }

    const top = [...hits]
      .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
      .slice(0, 10)
      .map((g) => ({
        name: g.name,
        tags: g.tags,
        visits: g.visits,
        lifetimeSpend: r0(g.lifetimeSpend),
        avgSpend: r0(g.avgSpend),
        lastVisit: g.lastVisit.slice(0, 10),
        optedIn: g.marketingOptIn,
      }));

    return JSON.stringify({ matched: hits.length, guests: top });
  },
};

const getGuestProfile: CopilotToolDef = {
  name: 'getGuestProfile',
  label: 'guest profile',
  description: 'Full profile for one guest by name: spend history, tags, favorites, birthday, notes and their reservations.',
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Guest name (partial match ok).' } },
    required: ['name'],
  },
  async run(repo, input) {
    const q = String(input.name ?? '').toLowerCase().trim();
    const [guests, reservations, locations] = await Promise.all([
      repo.getGuests(),
      repo.getReservations(),
      repo.getLocations(),
    ]);
    const guest: Guest | undefined =
      guests.find((g) => g.name.toLowerCase() === q) ?? guests.find((g) => g.name.toLowerCase().includes(q));
    if (!guest) return JSON.stringify({ error: `No guest found matching "${input.name}".` });

    const theirs = reservations.filter((res) => res.guestId === guest.id);
    const upcoming = theirs
      .filter((res) => res.status === 'upcoming')
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    return JSON.stringify({
      name: guest.name,
      email: guest.email,
      phone: guest.phone ?? null,
      tags: guest.tags,
      visits: guest.visits,
      lifetimeSpend: r0(guest.lifetimeSpend),
      avgSpend: r0(guest.avgSpend),
      lastVisit: guest.lastVisit.slice(0, 10),
      favoriteLocation: locations.find((l) => l.id === guest.favoriteLocationId)?.name ?? null,
      favoriteItems: guest.favoriteItems,
      birthday: guest.birthday ?? null,
      marketingOptIn: guest.marketingOptIn,
      notes: guest.notes,
      reservationCount: theirs.length,
      nextReservation: upcoming ? { date: upcoming.date, partySize: upcoming.partySize, occasion: upcoming.occasion ?? null } : null,
    });
  },
};

const getCampaignPerformance: CopilotToolDef = {
  name: 'getCampaignPerformance',
  label: 'campaign performance',
  description: 'Marketing campaign results: sends, open/click rates, reservations driven, best performer, plus anything scheduled next.',
  input_schema: { type: 'object', properties: {} },
  async run(repo) {
    const [campaigns, segments] = await Promise.all([repo.getCampaigns(), repo.getSegments()]);
    const segName = (id: string) => segments.find((s) => s.id === id)?.name ?? '';

    const sent = campaigns
      .filter((c) => c.status === 'sent' && c.stats)
      .map((c) => {
        const s = c.stats!;
        return {
          name: c.name,
          channel: c.channel,
          segment: segName(c.segmentId),
          sent: s.sent,
          openRatePct: s.sent ? r1((s.opened / s.sent) * 100) : 0,
          clickRatePct: s.sent ? r1((s.clicked / s.sent) * 100) : 0,
          reservations: s.reservations,
          sentAt: c.sentAt?.slice(0, 10) ?? null,
        };
      })
      .sort((a, b) => b.reservations - a.reservations);

    const scheduled = campaigns
      .filter((c) => c.status === 'scheduled')
      .map((c) => ({ name: c.name, channel: c.channel, segment: segName(c.segmentId), scheduledFor: c.scheduledFor ?? null }));

    return JSON.stringify({
      sentCount: sent.length,
      totalReservationsDriven: sent.reduce((a, c) => a + c.reservations, 0),
      bestPerformer: sent[0] ?? null,
      campaigns: sent.slice(0, 8),
      scheduled,
      draftCount: campaigns.filter((c) => c.status === 'draft').length,
    });
  },
};

// ---------- registry ----------

export const copilotTools: CopilotToolDef[] = [
  getSalesSummary,
  getFoodCostOverview,
  getLowStockItems,
  getPriceAlerts,
  getMenuEngineering,
  getEventPipelineSummary,
  getUpcomingEvents,
  searchGuests,
  getGuestProfile,
  getCampaignPerformance,
];

export function getToolByName(name: string): CopilotToolDef | undefined {
  return copilotTools.find((t) => t.name === name);
}

/** Anthropic Messages API `tools` payload. */
export function anthropicToolSpecs() {
  return copilotTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

/** Run a tool by name; returns a JSON string (never throws — errors are JSON). */
export async function runTool(repo: DataRepository, name: string, input: ToolInput): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
  try {
    return await tool.run(repo, input ?? {});
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
  }
}
