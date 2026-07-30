// ============================================================
// Live menus — the real scraped Buena Vista menu (536 items,
// photos + prices, both locations). fixtures/menus-live.json is
// the OS's menu source of truth: the marketing site publishes
// FROM this file, not the other way around.
// ============================================================

import menusJson from './fixtures/menus-live.json';

export interface LiveMenuItem {
  /** Location slug: 'hells-kitchen' | 'east-village' */
  loc: string;
  /** Menu display name, e.g. "Dinner Menu" */
  menu: string;
  /** Menu slug, e.g. "dinner-menu" */
  menuSlug: string;
  /** Section within the menu, e.g. "To Share & Sides" */
  section: string;
  name: string;
  slug: string;
  desc: string;
  /** Whole-dollar price; 0 when the source lists no price. */
  price: number;
  photo: string | null;
  popular: boolean;
  best: boolean;
  alcohol: boolean;
}

export interface LiveMenuSection {
  section: string;
  items: LiveMenuItem[];
}

export interface LiveMenu {
  menu: string;
  menuSlug: string;
  itemCount: number;
  sections: LiveMenuSection[];
}

export interface LiveMenuLocation {
  loc: string;
  itemCount: number;
  menus: LiveMenu[];
}

// ---------- raw shape of fixtures/menus-live.json ----------

interface RawItem {
  loc: string;
  menu: string;
  menuSlug: string;
  section: string;
  name: string;
  slug: string;
  desc: string | null;
  price: number | null;
  priceText: string | null;
  photo: string | null;
  popular: boolean;
  best: boolean;
  chef: boolean;
  alcohol: boolean;
  sizes: unknown[];
}

interface RawGroup {
  count: number;
  sectionId?: unknown;
  items: RawItem[];
}

const RAW = menusJson as unknown as Record<string, RawGroup[]>;

// ---------- loaders ----------

let flatCache: LiveMenuItem[] | null = null;
let groupedCache: LiveMenuLocation[] | null = null;

/** Every menu item across both locations, flat, in source order. */
export function getLiveMenuItems(): LiveMenuItem[] {
  if (flatCache) return flatCache;
  const out: LiveMenuItem[] = [];
  for (const loc of Object.keys(RAW)) {
    for (const group of RAW[loc]) {
      for (const raw of group.items) {
        out.push({
          loc: raw.loc || loc,
          menu: raw.menu,
          menuSlug: raw.menuSlug,
          section: raw.section,
          name: raw.name,
          slug: raw.slug,
          desc: (raw.desc ?? '').trim(),
          price: typeof raw.price === 'number' ? raw.price : 0,
          photo: raw.photo || null,
          popular: Boolean(raw.popular),
          best: Boolean(raw.best),
          alcohol: Boolean(raw.alcohol),
        });
      }
    }
  }
  flatCache = out;
  return out;
}

/**
 * Menus grouped location → menu → section, preserving the order
 * menus and sections appear on the live site.
 */
export function getLiveMenus(): LiveMenuLocation[] {
  if (groupedCache) return groupedCache;
  const locations: LiveMenuLocation[] = [];
  const locIndex = new Map<string, LiveMenuLocation>();

  for (const item of getLiveMenuItems()) {
    let location = locIndex.get(item.loc);
    if (!location) {
      location = { loc: item.loc, itemCount: 0, menus: [] };
      locIndex.set(item.loc, location);
      locations.push(location);
    }
    let menu = location.menus.find((m) => m.menuSlug === item.menuSlug);
    if (!menu) {
      menu = { menu: item.menu, menuSlug: item.menuSlug, itemCount: 0, sections: [] };
      location.menus.push(menu);
    }
    let section = menu.sections.find((s) => s.section === item.section);
    if (!section) {
      section = { section: item.section, items: [] };
      menu.sections.push(section);
    }
    section.items.push(item);
    menu.itemCount += 1;
    location.itemCount += 1;
  }

  groupedCache = locations;
  return locations;
}
