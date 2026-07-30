#!/usr/bin/env node
/* ============================================================
   build-menu-page.mjs — Buena Vista NY menu page generator
   Reads  docs/migration/menus.json (popmenu scrape)
   Writes apps/site/menu/index.html (complete static page)
   Rerun any time the menu data changes:
     node scripts/build-menu-page.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'docs/migration/menus.json'), 'utf8'));
const OUT  = join(ROOT, 'apps/site/menu/index.html');

/* ---------- config ---------- */
const LOCATIONS = [
  { slug: 'hells-kitchen', name: "Hell's Kitchen", tag: 'The Original',
    address: '536 9th Avenue, New York, NY 10018', tel: '+12123885040', telText: '(212) 388-5040' },
  { slug: 'east-village', name: 'East Village', tag: 'Downtown — Late Night',
    address: '88 2nd Avenue, New York, NY 10003', tel: '+19292200547', telText: '(929) 220-0547' },
];

/* normalize per-location dinner slugs (dinner-menu-hells-kitchen → dinner-menu) */
const normSlug = s => s.replace(/^dinner-menu.*$/, 'dinner-menu');
const MENU_ORDER = ['dinner-menu','lunch-menu','brunch-menu','drinks-menu','wine','na-drinks','kids-menu'];
const MENU_LABEL = {
  'dinner-menu':'Dinner', 'lunch-menu':'Lunch', 'brunch-menu':'Brunch',
  'drinks-menu':'Drinks', 'wine':'Wine', 'na-drinks':'Zero Proof', 'kids-menu':'Kids',
};

const DIETS = [
  { re: /gluten[\s-]?free/i, label: 'Gluten Free' },
  { re: /nut[\s-]?free/i,    label: 'Nut Free' },
  { re: /vegetarian/i,       label: 'Vegetarian' },
  { re: /\bvegan\b/i,        label: 'Vegan' },
];

/* ---------- helpers ---------- */
const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const price = n => {
  if (n == null || n <= 0) return '';
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2).replace(/0$/,'')}`;
};

function cleanDesc(raw) {
  if (!raw) return { desc: '', diets: [] };
  let desc = String(raw).replace(/\r/g, '');
  const diets = [];
  for (const d of DIETS) if (d.re.test(desc)) diets.push(d.label);
  // strip standalone dietary sentences ("Gluten free.", "Vegetarian, Gluten Free")
  desc = desc
    .split('\n')
    .map(line => {
      const stripped = line.replace(
        /(?:^|[.,;]\s*)\(?\s*(?:gluten[\s-]?free|nut[\s-]?free|vegetarian|vegan)\s*\)?(?=\s*[.,;]|\s*$)/gi, m => (/^[.,;]/.test(m.trim()) ? m.trim()[0] : ''));
      return /^\s*(?:gluten[\s-]?free|nut[\s-]?free|vegetarian|vegan)[\s.,;]*$/i.test(line) ? '' : stripped;
    })
    .filter(Boolean).join(' ')
    .replace(/\s{2,}/g,' ')
    .replace(/\s+([.,;])/g,'$1')
    .replace(/([.,;])[.,;]+/g,'$1')
    .replace(/,\s*\./g,'.')
    .replace(/[.,;]\s*$/,'.')
    .trim();
  return { desc, diets };
}

/* ---------- collect + filter ---------- */
const model = LOCATIONS.map(loc => {
  const groups = DATA[loc.slug] || [];
  const items = groups.flatMap(g => g.items);

  // skip $0-price variant items where a same-named base exists
  // (popmenu placeholder variants: "margarita", "beer", "wine", "sangria", "Monfulete")
  const kept = items.filter(it => {
    if (it.price > 0) return true;
    const hasDesc = (it.desc || '').trim().length > 0;
    const base = it.name.trim().toLowerCase();
    const namedBaseExists = items.some(o =>
      o !== it && o.price > 0 &&
      o.name.toLowerCase().split(/[^a-zà-ú]+/i).includes(base));
    return hasDesc && !namedBaseExists; // keep real "market/choice-priced" dishes
  });

  // menus (deduped by menuSlug), each with ordered sections as they appear
  const menuMap = new Map();
  for (const it of kept) {
    const slug = normSlug(it.menuSlug);
    if (!menuMap.has(slug)) menuMap.set(slug, { slug, name: it.menu, sections: new Map() });
    const m = menuMap.get(slug);
    if (!m.sections.has(it.section)) m.sections.set(it.section, []);
    m.sections.get(it.section).push(it);
  }
  const menus = [...menuMap.values()].sort((a, b) => {
    const ia = MENU_ORDER.indexOf(a.slug), ib = MENU_ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { ...loc, menus, itemCount: kept.length, skipped: items.length - kept.length };
});

/* ---------- schema.org Menu JSON-LD per location ---------- */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': model.map(loc => ({
    '@type': 'Restaurant',
    '@id': `https://www.buenavistany.com/#${loc.slug}`,
    name: `Buena Vista Restaurant & Bar — ${loc.name}`,
    address: loc.address,
    telephone: loc.telText,
    servesCuisine: ['Spanish', 'Latin American'],
    hasMenu: loc.menus.map(m => ({
      '@type': 'Menu',
      name: `${MENU_LABEL[m.slug] || m.name} — ${loc.name}`,
      hasMenuSection: [...m.sections.entries()].map(([sec, items]) => ({
        '@type': 'MenuSection',
        name: sec,
        hasMenuItem: items.map(it => {
          const { desc } = cleanDesc(it.desc);
          const mi = { '@type': 'MenuItem', name: it.name.trim() };
          if (desc) mi.description = desc;
          if (it.price > 0) mi.offers = { '@type': 'Offer', price: String(it.price), priceCurrency: 'USD' };
          return mi;
        }),
      })),
    })),
  })),
};

/* ---------- item card ---------- */
function itemCard(it) {
  const { desc, diets } = cleanDesc(it.desc);
  const chips = [];
  if (it.popular) chips.push('<span class="chip chip-gold">Popular</span>');
  if (it.best)    chips.push('<span class="chip chip-navy">Best Seller</span>');
  for (const d of diets) chips.push(`<span class="chip chip-diet">${esc(d)}</span>`);
  const name = it.name.trim().replace(/\s+/g, ' ');
  const search = `${name} ${desc}`.toLowerCase();

  return `        <article class="mi${it.photo ? ' has-photo' : ''}" data-search="${esc(search)}">
${it.photo ? `          <img class="mi-photo" src="${esc(it.photo)}" alt="${esc(name)}" loading="lazy" width="640" height="640">\n` : ''}          <div class="mi-body">
            <div class="mi-row">
              <h4 class="mi-name">${esc(name)}</h4>
              <span class="mi-dots" aria-hidden="true"></span>
              ${it.price > 0 ? `<span class="mi-price">${price(it.price)}</span>` : ''}
            </div>
${desc ? `            <p class="mi-desc">${esc(desc)}</p>\n` : ''}${chips.length ? `            <div class="mi-chips">${chips.join('')}</div>\n` : ''}          </div>
        </article>`;
}

/* ---------- per-location panel ---------- */
function locPanel(loc, active) {
  const tabs = loc.menus.map((m, i) =>
    `        <button class="menu-tab${i === 0 ? ' active' : ''}" role="tab" id="tab-${loc.slug}-${m.slug}" aria-controls="panel-${loc.slug}-${m.slug}" aria-selected="${i === 0}">${esc(MENU_LABEL[m.slug] || m.name)}</button>`
  ).join('\n');

  const panels = loc.menus.map((m, i) => {
    const sections = [...m.sections.entries()].map(([sec, items]) => `      <section class="menu-section" aria-label="${esc(sec)}">
        <h3 class="menu-sec-title"><span>${esc(sec)}</span></h3>
        <div class="mi-grid">
${items.map(itemCard).join('\n')}
        </div>
      </section>`).join('\n');
    return `    <div class="menu-panel${i === 0 ? ' active' : ''}" role="tabpanel" id="panel-${loc.slug}-${m.slug}" aria-labelledby="tab-${loc.slug}-${m.slug}"${i === 0 ? '' : ' hidden'}>
${sections}
    </div>`;
  }).join('\n');

  return `  <div class="loc-panel${active ? ' active' : ''}" id="loc-${loc.slug}"${active ? '' : ' hidden'}>
    <div class="loc-strip">
      <span class="loc-tag">${esc(loc.tag)}</span>
      <p class="loc-line">${esc(loc.address)} &nbsp;&middot;&nbsp; <a href="tel:${loc.tel}">${loc.telText}</a></p>
    </div>
    <div class="menu-tabs" role="tablist" aria-label="${esc(loc.name)} menus">
${tabs}
    </div>
${panels}
  </div>`;
}

/* ---------- chrome fragments (shared contract — mirror index.html) ---------- */
const NAV_LINKS = [
  ['Home', '/'], ['Menu', '/menu/'], ['Our Story', '/our-story/'], ['Private Events', '/private-events/'],
  ['Gallery', '/gallery/'], ['Press', '/press/'], ['Blog', '/blog/'], ['Contact', '/contact/'],
];
const navLinks = ind => NAV_LINKS.map(([t, h]) =>
  `${ind}<li><a href="${h}"${h === '/menu/' ? ' aria-current="page"' : ''}>${t}</a></li>`).join('\n');
const mobileLinks = NAV_LINKS.map(([t, h]) =>
  `  <a href="${h}"${h === '/menu/' ? ' aria-current="page"' : ''}>${t}</a>`).join('\n');

const SVG_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <g id="bv-fan">
      <path d="M50 7 C43.5 16.5 43.5 26.5 50 34.5 C56.5 26.5 56.5 16.5 50 7 Z" fill="var(--logo-blue,#2E5A8F)"/>
      <path d="M34 11 C31.5 20 34.5 28 44 32 C46.8 24 43 16.4 34 11 Z" fill="var(--logo-sky,#A8C4E5)"/>
      <path d="M66 11 C68.5 20 65.5 28 56 32 C53.2 24 57 16.4 66 11 Z" fill="var(--logo-sky,#A8C4E5)"/>
      <circle cx="50" cy="13.5" r="2.2" fill="var(--logo-gold,#C9995C)"/>
    </g>
    <ellipse id="bv-rose-petal" cx="50" cy="42.6" rx="2.1" ry="4.2" fill="var(--logo-sky,#A8C4E5)"/>
    <symbol id="bv-tile" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="47.5" fill="none" stroke="var(--logo-gold,#C9995C)" stroke-width="1.4"/>
      <circle cx="50" cy="50" r="42.5" fill="none" stroke="var(--logo-blue,#2E5A8F)" stroke-width=".7" opacity=".55"/>
      <use href="#bv-fan" transform="rotate(45 50 50)"/>
      <use href="#bv-fan" transform="rotate(135 50 50)"/>
      <use href="#bv-fan" transform="rotate(225 50 50)"/>
      <use href="#bv-fan" transform="rotate(315 50 50)"/>
      <circle cx="50" cy="50" r="10.5" fill="none" stroke="var(--logo-gold,#C9995C)" stroke-width="1"/>
      <use href="#bv-rose-petal"/>
      <use href="#bv-rose-petal" transform="rotate(45 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(90 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(135 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(180 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(225 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(270 50 50)"/>
      <use href="#bv-rose-petal" transform="rotate(315 50 50)"/>
      <circle cx="50" cy="50" r="3.4" fill="var(--logo-gold,#C9995C)"/>
    </symbol>
    <symbol id="bv-wordmark" viewBox="0 0 340 82">
      <text x="4" y="44" textLength="332" lengthAdjust="spacingAndGlyphs"
            font-family="'Cormorant Garamond', Georgia, serif" font-weight="700"
            font-size="46" letter-spacing="2.7" fill="currentColor"
            style="shape-rendering:geometricPrecision">BUENAVISTA</text>
      <text x="4" y="68" textLength="332" lengthAdjust="spacingAndGlyphs"
            font-family="'Jost', sans-serif" font-weight="500"
            font-size="9" letter-spacing="3.15" fill="currentColor" opacity=".78"
            style="shape-rendering:geometricPrecision">RESTAURANT &amp; BAR &#8226; MODERN LATIN CUISINE</text>
    </symbol>
  </defs>
</svg>`;

const FOOTER = `<footer class="site-footer" aria-label="Contact and newsletter">
  <div class="container">
    <div class="contact-grid">
      <div class="contact-col">
        <span class="loc-tag">Hell's Kitchen</span>
        <h3>The Original</h3>
        <p class="contact-line">536 9th Avenue<br>New York, NY 10018</p>
        <p class="contact-line"><a href="tel:+12123885040">(212) 388-5040</a></p>
        <div class="contact-hours">
          <strong>Hours</strong>
          Sun&ndash;Thu &nbsp;11:00 AM &ndash; 11:00 PM<br>
          Fri&ndash;Sat &nbsp;11:00 AM &ndash; 12:00 AM
        </div>
      </div>
      <div class="contact-col">
        <span class="loc-tag">East Village</span>
        <h3>Late Night</h3>
        <p class="contact-line">88 2nd Avenue<br>New York, NY 10003</p>
        <p class="contact-line"><a href="tel:+19292200547">(929) 220-0547</a></p>
        <div class="contact-hours">
          <strong>Hours</strong>
          Sun&ndash;Thu &nbsp;11:00 AM &ndash; 11:00 PM<br>
          Fri&ndash;Sat &nbsp;11:00 AM &ndash; 2:00 AM
        </div>
      </div>
      <div class="contact-col newsletter">
        <h3>Join the VIP List</h3>
        <p>First pours, secret menus, and invitations to nights that never make it to social media.</p>
        <form class="newsletter-form" aria-label="Newsletter signup" onsubmit="event.preventDefault(); this.querySelector('button').textContent='&iexcl;Gracias!'; this.querySelector('input').disabled=true;">
          <label class="sr-only" for="vipEmail">Email address</label>
          <input id="vipEmail" type="email" name="email" placeholder="Your email address" required autocomplete="email">
          <button type="submit">Join the VIP List</button>
        </form>
        <div class="socials">
          <a href="https://www.instagram.com/buenavistany/" target="_blank" rel="noopener" aria-label="Buena Vista on Instagram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.6" cy="6.4" r="1.15" fill="currentColor" stroke="none"/></svg>
          </a>
          <a href="https://www.facebook.com/Buenavistany" target="_blank" rel="noopener" aria-label="Buena Vista on Facebook">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.6 21.5v-7.6h2.6l.4-3h-3V9c0-.87.24-1.46 1.5-1.46h1.6V4.85c-.28-.04-1.23-.12-2.34-.12-2.32 0-3.9 1.41-3.9 4v2.2H7.9v3h2.56v7.6h3.14z"/></svg>
          </a>
          <a href="https://www.tiktok.com/@buenavistany" target="_blank" rel="noopener" aria-label="Buena Vista on TikTok">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.9 3c.36 1.94 1.66 3.44 3.6 3.72v2.9c-1.36.04-2.62-.4-3.6-1.1v6.62c0 3.5-2.36 5.86-5.5 5.86-3 0-5.4-2.3-5.4-5.32 0-3.06 2.5-5.24 5.66-5.14v3c-.24-.06-.5-.1-.76-.1-1.42 0-2.5 1.04-2.5 2.36 0 1.36 1.1 2.32 2.44 2.32 1.5 0 2.66-1.14 2.66-3.02V3h3.4z"/></svg>
          </a>
        </div>
      </div>
    </div>
    <div class="footer-bar">
      <a class="footer-logo" href="/" aria-label="Buena Vista Restaurant &amp; Bar — home">
        <svg class="logo-tile" aria-hidden="true" focusable="false"><use href="#bv-tile"/></svg>
        <svg class="logo-word" aria-hidden="true" focusable="false"><use href="#bv-wordmark"/></svg>
      </a>
      <div class="footer-meta">
        &copy; 2026 Buena Vista Restaurant &amp; Bar. All rights reserved.<br>
        <span class="viox">Site by <a href="https://viox.ai" target="_blank" rel="noopener">VioX AI</a></span>
      </div>
    </div>
  </div>
</footer>`;

/* ---------- page ---------- */
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Menu — Buena Vista Restaurant &amp; Bar | Hell's Kitchen &amp; East Village, NYC</title>
<meta name="description" content="The full Buena Vista menu — paella, ceviche, croquetas, craft cocktails and an exclusive wine list. Dinner, lunch, brunch and late-night at Hell's Kitchen &amp; East Village, NYC.">
<link rel="canonical" href="https://www.buenavistany.com/menu/">
<meta property="og:title" content="Menu — Buena Vista Restaurant &amp; Bar">
<meta property="og:description" content="Spain meets Latin America — dinner, lunch, brunch, cocktails, wine and late-night bites across two NYC locations.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.buenavistany.com/menu/">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">

<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 0)}
</script>

<style>
/* ============================================================
   MENU PAGE — la carta, page-specific rules
   ============================================================ */
.menu-wrap{padding:56px 0 0}

/* location toggle */
.loc-toggle{
  display:flex;justify-content:center;gap:0;
  margin:-32px auto 0;
  position:relative;z-index:5;
  width:max-content;max-width:calc(100% - 40px);
  border:1px solid rgba(201,153,92,.5);
  border-radius:2px;overflow:hidden;
  background:var(--cream);
  box-shadow:0 24px 60px -28px rgba(16,24,38,.45);
}
.loc-btn{
  font-family:var(--font-body);
  font-size:12px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;
  color:var(--navy);
  background:transparent;border:0;cursor:pointer;
  padding:18px 34px;
  transition:background .35s ease,color .35s ease;
  white-space:nowrap;
}
.loc-btn.active{background:var(--navy);color:var(--cream)}
.loc-btn:not(.active):hover{background:rgba(30,58,95,.06)}

/* location strip */
.loc-strip{text-align:center;margin:44px 0 8px}
.loc-strip .loc-tag{margin-bottom:8px}
.loc-line{font-size:14px;font-weight:300;color:rgba(16,24,38,.7)}
.loc-line a{color:var(--navy);text-decoration:none;border-bottom:1px solid rgba(30,58,95,.25);transition:border-color .3s}
.loc-line a:hover{border-color:var(--gold)}

/* search */
.menu-search{
  display:flex;align-items:center;gap:12px;
  max-width:440px;margin:28px auto 0;
  border:1px solid rgba(30,58,95,.2);
  border-radius:2px;background:#fff;
  padding:0 18px;
  transition:border-color .3s ease,box-shadow .4s var(--ease-buttery);
}
.menu-search:focus-within{border-color:var(--gold);box-shadow:0 14px 34px -20px rgba(201,153,92,.55)}
.menu-search svg{width:16px;height:16px;color:rgba(30,58,95,.5);flex-shrink:0}
.menu-search input{
  flex:1;min-width:0;border:0;outline:none;background:transparent;
  font-family:var(--font-body);font-size:14px;font-weight:300;color:var(--ink);
  padding:15px 0;
}
.menu-search input::placeholder{color:rgba(16,24,38,.4)}
.search-empty{
  display:none;text-align:center;
  font-family:var(--font-display);font-style:italic;font-size:20px;
  color:rgba(16,24,38,.55);
  padding:64px 0;
}
.searching .search-empty.show{display:block}

/* menu tab bar */
.menu-tabs{
  display:flex;justify-content:center;flex-wrap:wrap;gap:6px;
  margin:36px 0 0;
  padding:0 0 20px;
  border-bottom:1px solid rgba(30,58,95,.12);
  position:sticky;top:var(--nav-h);z-index:20;
  background:linear-gradient(180deg,var(--cream) 82%,rgba(247,242,233,0));
  padding-top:16px;
}
.menu-tab{
  font-family:var(--font-body);
  font-size:11.5px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;
  color:rgba(30,58,95,.65);
  background:transparent;border:1px solid transparent;border-radius:2px;
  padding:11px 20px;cursor:pointer;
  transition:color .3s ease,border-color .3s ease,background .3s ease;
}
.menu-tab:hover{color:var(--navy)}
.menu-tab.active{
  color:var(--ink);
  background:var(--gold);
  border-color:var(--gold);
}

/* sections */
.menu-section{padding:56px 0 8px}
.menu-sec-title{
  font-family:var(--font-display);
  font-weight:600;font-size:clamp(26px,3.2vw,36px);
  color:var(--navy);
  text-align:center;
  display:flex;align-items:center;gap:24px;
  margin-bottom:40px;
}
.menu-sec-title::before,.menu-sec-title::after{
  content:"";flex:1;height:1px;
  background:linear-gradient(90deg,rgba(201,153,92,0),rgba(201,153,92,.45));
}
.menu-sec-title::after{background:linear-gradient(90deg,rgba(201,153,92,.45),rgba(201,153,92,0))}
.menu-sec-title span{flex-shrink:0}

/* item cards */
.mi-grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:18px 40px;
}
.mi{
  display:flex;gap:18px;align-items:flex-start;
  background:#fff;
  border:1px solid rgba(30,58,95,.08);
  border-radius:6px;
  padding:20px 22px;
  transition:border-color .35s ease,box-shadow .5s var(--ease-buttery),transform .5s var(--ease-buttery);
}
.mi:hover{
  border-color:rgba(201,153,92,.5);
  box-shadow:0 24px 54px -28px rgba(16,24,38,.28);
  transform:translateY(-2px);
}
.mi-photo{
  width:76px;height:76px;flex-shrink:0;
  object-fit:cover;border-radius:4px;
  background:rgba(30,58,95,.06);
}
.mi-body{flex:1;min-width:0}
.mi-row{display:flex;align-items:baseline;gap:10px}
.mi-name{
  font-family:var(--font-display);
  font-weight:600;font-size:19px;line-height:1.25;
  color:var(--ink);
}
.mi-dots{
  flex:1;min-width:16px;
  border-bottom:1px dotted rgba(30,58,95,.3);
  transform:translateY(-4px);
}
.mi-price{
  font-family:var(--font-display);
  font-weight:600;font-size:19px;
  color:var(--navy);
  text-align:right;white-space:nowrap;
}
.mi-desc{
  font-size:13.5px;font-weight:300;line-height:1.6;
  color:rgba(16,24,38,.68);
  margin-top:6px;
}
.mi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}

/* order CTA band */
.menu-cta{
  text-align:center;
  padding:72px 0 8px;
}
.menu-cta p{
  font-family:var(--font-display);font-style:italic;
  font-size:clamp(19px,2.2vw,24px);
  color:rgba(16,24,38,.65);
  margin-bottom:28px;
}
.menu-cta .btn + .btn{margin-left:14px}

@media (max-width:900px){
  .mi-grid{grid-template-columns:1fr}
}
@media (max-width:768px){
  .menu-tabs{top:var(--nav-h);gap:4px}
  .menu-tab{padding:10px 14px;letter-spacing:.14em}
  .loc-btn{padding:15px 20px;letter-spacing:.14em;font-size:11px}
  .menu-section{padding:40px 0 4px}
  .mi{padding:16px}
  .mi-photo{width:64px;height:64px}
  .menu-cta .btn{width:min(320px,84vw)}
  .menu-cta .btn + .btn{margin:14px 0 0}
}
</style>
</head>
<body>

${SVG_DEFS}

<!-- ============================================================ NAV (shared chrome) ============================================================ -->
<header class="nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-logo" href="/" aria-label="Buena Vista Restaurant &amp; Bar — home">
      <svg class="logo-tile" aria-hidden="true" focusable="false"><use href="#bv-tile"/></svg>
      <svg class="logo-word" aria-hidden="true" focusable="false"><use href="#bv-wordmark"/></svg>
    </a>
    <nav aria-label="Primary">
      <ul class="nav-links">
${navLinks('        ')}
      </ul>
    </nav>
    <a class="nav-cta" href="https://www.buenavistany.com/reservations" target="_blank" rel="noopener">Reserve</a>
    <button class="nav-burger" id="navBurger" aria-expanded="false" aria-controls="mobileMenu" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>

<nav class="mobile-menu" id="mobileMenu" aria-label="Mobile">
${mobileLinks}
  <a class="mobile-reserve" href="https://www.buenavistany.com/reservations" target="_blank" rel="noopener">Reserve a Table</a>
</nav>

<main>

<header class="page-hero">
  <svg class="page-hero-emblem" aria-hidden="true" focusable="false"><use href="#bv-tile"/></svg>
  <div class="container">
    <span class="kicker">La Carta</span>
    <h1 class="page-hero-title">Spain on the Plate, <em>Latin America in the Glass</em></h1>
    <p class="page-hero-sub">Every dish and every pour, exactly as served tonight — from slow-saffron paella to late-night croquetas. Choose your Buena Vista.</p>
  </div>
</header>

<!-- ============================================================ LOCATION TOGGLE ============================================================ -->
<div class="container menu-wrap" id="menuApp">

  <div class="loc-toggle" role="tablist" aria-label="Choose a location">
${model.map((l, i) => `    <button class="loc-btn${i === 0 ? ' active' : ''}" role="tab" id="locbtn-${l.slug}" aria-controls="loc-${l.slug}" aria-selected="${i === 0}" data-loc="${l.slug}">${esc(l.name)}</button>`).join('\n')}
  </div>

  <div class="menu-search" role="search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
    <label class="sr-only" for="menuSearch">Search the menu</label>
    <input id="menuSearch" type="search" placeholder="Search the menu &mdash; paella, ceviche, mezcal&hellip;" autocomplete="off">
  </div>

${model.map((l, i) => locPanel(l, i === 0)).join('\n')}

  <p class="search-empty" id="searchEmpty">Nothing on la carta matches that &mdash; try another craving.</p>

  <div class="menu-cta">
    <p>Hungry already? Your table &mdash; or your doorstep.</p>
    <a class="btn btn-gold" href="https://www.buenavistany.com/reservations" target="_blank" rel="noopener">Reserve a Table</a>
    <a class="btn btn-outline-navy" href="https://www.buenavistany.com/popmenu-order" target="_blank" rel="noopener">Order Online</a>
  </div>

</div>

</main>

${FOOTER}

<script>
(function(){
'use strict';

/* burger */
var burger=document.getElementById('navBurger'), mob=document.getElementById('mobileMenu');
burger.addEventListener('click',function(){
  var open=mob.classList.toggle('open');
  burger.setAttribute('aria-expanded',open);
  burger.setAttribute('aria-label',open?'Close menu':'Open menu');
  document.body.style.overflow=open?'hidden':'';
});

var app=document.getElementById('menuApp');
var search=document.getElementById('menuSearch');
var empty=document.getElementById('searchEmpty');

/* location toggle (URL hash #hells-kitchen / #east-village) */
function setLoc(slug,push){
  var found=false;
  app.querySelectorAll('.loc-btn').forEach(function(b){
    var on=b.dataset.loc===slug;
    if(on)found=true;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on);
  });
  if(!found)return;
  app.querySelectorAll('.loc-panel').forEach(function(p){
    var on=p.id==='loc-'+slug;
    p.classList.toggle('active',on);
    p.hidden=!on;
  });
  if(push&&history.replaceState)history.replaceState(null,'','#'+slug);
  applySearch();
}
app.querySelectorAll('.loc-btn').forEach(function(b){
  b.addEventListener('click',function(){setLoc(b.dataset.loc,true)});
});
window.addEventListener('hashchange',function(){setLoc(location.hash.slice(1),false)});
if(location.hash)setLoc(location.hash.slice(1),false);

/* menu tabs (per location) */
app.querySelectorAll('.loc-panel').forEach(function(panel){
  panel.querySelectorAll('.menu-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      panel.querySelectorAll('.menu-tab').forEach(function(t){
        t.classList.toggle('active',t===tab);
        t.setAttribute('aria-selected',t===tab);
      });
      panel.querySelectorAll('.menu-panel').forEach(function(mp){
        var on=mp.id===tab.getAttribute('aria-controls');
        mp.classList.toggle('active',on);
        mp.hidden=!on;
      });
      applySearch();
    });
  });
});

/* text search — filters cards in the visible location; hides empty sections */
function applySearch(){
  var q=(search.value||'').trim().toLowerCase();
  app.classList.toggle('searching',!!q);
  var loc=app.querySelector('.loc-panel.active');
  if(!loc)return;
  var any=false;
  var panels=q?loc.querySelectorAll('.menu-panel'):loc.querySelectorAll('.menu-panel.active');
  /* while searching, look across every menu of the active location */
  loc.querySelectorAll('.menu-panel').forEach(function(mp){
    var isActive=mp.classList.contains('active');
    mp.hidden=q?false:!isActive;
    var mpAny=false;
    mp.querySelectorAll('.menu-section').forEach(function(sec){
      var secAny=false;
      sec.querySelectorAll('.mi').forEach(function(card){
        var hit=!q||card.dataset.search.indexOf(q)!==-1;
        card.style.display=hit?'':'none';
        if(hit)secAny=true;
      });
      sec.style.display=secAny?'':'none';
      if(secAny)mpAny=true;
    });
    if(q)mp.style.display=mpAny?'':'none';
    else mp.style.display='';
    if(mpAny)any=true;
  });
  loc.querySelector('.menu-tabs').style.display=q?'none':'';
  empty.classList.toggle('show',!any);
}
search.addEventListener('input',applySearch);
})();
</script>

<elevenlabs-convai agent-id="agent_9001kyr4x889fzsrxn1a42vw64hx"></elevenlabs-convai><script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);

for (const loc of model) {
  console.log(`${loc.name}: ${loc.itemCount} items rendered (${loc.skipped} $0 placeholder variants skipped) across ${loc.menus.length} menus`);
  for (const m of loc.menus) {
    const n = [...m.sections.values()].reduce((a, b) => a + b.length, 0);
    console.log(`   ${MENU_LABEL[m.slug] || m.name}: ${n} items, ${m.sections.size} sections`);
  }
}
console.log('Wrote', OUT, `(${(html.length / 1024).toFixed(1)} KiB)`);
