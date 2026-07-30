// ============================================================
// @viox/agents — runCopilot: Anthropic tool-use loop with a
// data-grounded demo fallback when no API key is configured.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { DataRepository } from '@viox/db';
import { anthropicToolSpecs, copilotTools, getToolByName, runTool, DEMO_TODAY } from './tools';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotResult {
  reply: string;
  /** Friendly labels of tools consulted, e.g. ["sales summary"]. */
  toolsUsed: string[];
  demo: boolean;
}

export interface RunCopilotOptions {
  messages: ChatMessage[];
  repo: DataRepository;
  /** Active operator persona (owner | gm | chef | events | marketing | staff). */
  persona?: string;
}

const MAX_TOOL_ROUNDS = 6;

const PERSONA_FOCUS: Record<string, string> = {
  owner: 'The operator is the OWNER — lead with net sales, prime cost (food + labor), and pipeline value.',
  gm: 'The operator is the GM — lead with daily sales, labor %, comps/voids and anything needing action today.',
  chef: 'The operator is the CHEF — lead with plate costs vs target, price alerts and the reorder list.',
  events: 'The operator runs EVENTS — lead with the pipeline, upcoming BEOs, deposits outstanding.',
  marketing: 'The operator runs MARKETING — lead with campaigns, segments, guest tags and reservation lift.',
  staff: 'The operator is front-line staff — keep it simple and shift-focused.',
};

function buildSystemPrompt(persona?: string): string {
  const focus = persona ? PERSONA_FOCUS[persona.toLowerCase()] : undefined;
  return [
    'You are the VioX Restaurant OS copilot for Buena Vista Restaurant & Bar, a Latin-Mediterranean restaurant group in NYC (Google 4.7, ~1,481 reviews).',
    'Two locations: Hell\'s Kitchen (536 9th Ave, (212) 388-5040 — strong lunch and pre-theater dinner) and East Village (88 2nd Ave, (929) 220-0547 — late-night Friday/Saturday until 2 AM).',
    `Today is ${DEMO_TODAY}. All operating data comes from the tools — always call the relevant tool before answering a data question, and cite the actual numbers you get back.`,
    'Menu anchors: Paella Buenavista $59 (for two), Paella Negra $59, Ceviche Limeño $21, Pulpo a la Parrilla $28, Salmon Barceloneta $36, Chilean Sea Bass Mediterráneo $42, Ossobuco de Cerdo Ibérico $39, flan and churros, BV cocktails (smoked old fashioned, sangría), weekend brunch.',
    'Speak operator language: net sales, covers, avg check, food cost %, labor %, 86\'d, par, BEO. Be concise — short paragraphs or tight bullet lists, figures formatted like $12.4k / 28.4%. Never invent numbers; if a tool returns nothing, say so.',
    'When a number is off-plan (food cost over target, labor high, price spike), flag it and suggest one concrete next step.',
    focus ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Run the copilot. Uses the Anthropic API when ANTHROPIC_API_KEY is set;
 * otherwise returns a data-grounded demo response that still consults
 * 1–2 tools directly and formats real fixture numbers.
 */
export async function runCopilot({ messages, repo, persona }: RunCopilotOptions): Promise<CopilotResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return demoRespond(messages, repo);
  }
  try {
    return await liveRespond(messages, repo, persona);
  } catch {
    // Keep the sales demo alive even if the API is unreachable/misconfigured.
    const fallback = await demoRespond(messages, repo);
    return { ...fallback, reply: `${fallback.reply}\n\n(Live copilot unreachable — served from local data.)` };
  }
}

// ---------- live mode ----------

async function liveRespond(messages: ChatMessage[], repo: DataRepository, persona?: string): Promise<CopilotResult> {
  const client = new Anthropic();
  const model = process.env.COPILOT_MODEL || 'claude-sonnet-5';
  const system = buildSystemPrompt(persona);
  const tools = anthropicToolSpecs() as Anthropic.Messages.Tool[];

  const convo: Anthropic.Messages.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolsUsed: string[] = [];
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: 1200,
      system,
      tools,
      messages: convo,
    });

    const textBlocks = res.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
    const toolUses = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
    if (textBlocks.length) lastText = textBlocks.map((b) => b.text).join('\n').trim();

    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      return { reply: lastText || 'I came up empty on that one — try rephrasing?', toolsUsed, demo: false };
    }

    // Echo the assistant turn (text + tool_use) back as params.
    const assistantBlocks: Anthropic.Messages.ContentBlockParam[] = [
      ...textBlocks.map((b): Anthropic.Messages.TextBlockParam => ({ type: 'text', text: b.text })),
      ...toolUses.map(
        (b): Anthropic.Messages.ToolUseBlockParam => ({ type: 'tool_use', id: b.id, name: b.name, input: b.input }),
      ),
    ];
    convo.push({ role: 'assistant', content: assistantBlocks });

    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.Messages.ToolResultBlockParam> => {
        const label = getToolByName(tu.name)?.label ?? tu.name;
        if (!toolsUsed.includes(label)) toolsUsed.push(label);
        const output = await runTool(repo, tu.name, (tu.input ?? {}) as Record<string, unknown>);
        return { type: 'tool_result', tool_use_id: tu.id, content: output };
      }),
    );
    convo.push({ role: 'user', content: results });
  }

  return {
    reply: lastText || 'I gathered the data but ran out of room to summarize — ask me something more specific.',
    toolsUsed,
    demo: false,
  };
}

// ---------- demo mode (no API key) ----------

const usd = (n: number) =>
  `$${Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(n).toLocaleString('en-US')}`;
const usdFull = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const sign = (n: number) => (n >= 0 ? `+${pct(n)}` : `−${pct(Math.abs(n))}`);

async function demoRespond(messages: ChatMessage[], repo: DataRepository): Promise<CopilotResult> {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() ?? '';
  const used: string[] = [];
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const label = getToolByName(name)?.label ?? name;
    if (!used.includes(label)) used.push(label);
    return JSON.parse(await runTool(repo, name, input));
  };

  let reply: string;

  if (/(food cost|cogs|plate|recipe|margin(?!.*campaign))/.test(last)) {
    const fc = await call('getFoodCostOverview');
    const worst = (fc.worstOffenders ?? []).slice(0, 3) as Array<Record<string, number | string>>;
    reply =
      `Food cost is running ${pct(fc.avgCostPct)} against a ${pct(fc.avgTargetPct)} target — ${fc.itemsOverTarget} item${fc.itemsOverTarget === 1 ? '' : 's'} over.\n\n` +
      (worst.length
        ? `Worst offenders:\n${worst
            .map((w) => `• ${w.item} — ${pct(Number(w.costPct))} vs ${pct(Number(w.targetPct))} target (plate ${usdFull(Number(w.plateCost))} on a $${w.price} menu price)`)
            .join('\n')}\n\n`
        : '') +
      `Purchasing ran ${usd(fc.purchases30d)} across ${fc.invoices30d} invoices in the last 30 days, ${fc.invoicesPendingReview} still pending review, and there are ${fc.openPriceAlerts} open price alerts. Recosting the top offender is the fastest point back.`;
  } else if (/(stock|inventory|par|reorder|86|order list)/.test(last)) {
    const ls = await call('getLowStockItems');
    const items = (ls.items ?? []).slice(0, 6) as Array<Record<string, string | number>>;
    reply =
      `${ls.lowStockCount} item${ls.lowStockCount === 1 ? ' is' : 's are'} at or below par right now.\n\n` +
      items.map((i) => `• ${i.item} — ${i.onHand} ${i.unit} on hand vs par ${i.par} (${i.vendor})`).join('\n') +
      `\n\nWorth getting orders in before the weekend push.`;
  } else if (/(price alert|price spike|vendor price|price change)/.test(last)) {
    const pa = await call('getPriceAlerts');
    const alerts = ((pa.alerts ?? []) as Array<Record<string, string | number | boolean>>)
      .filter((a) => !a.acknowledged)
      .slice(0, 5);
    reply =
      `${pa.openCount} open price alert${pa.openCount === 1 ? '' : 's'}:\n\n` +
      alerts
        .map((a) => `• ${a.item} (${a.vendor}) — $${a.oldPrice} → $${a.newPrice} (${sign(Number(a.changePct))})`)
        .join('\n') +
      `\n\nAnything double-digit deserves a call to the rep or a swap before it eats the paella margin.`;
  } else if (/(menu engineer|star|plow|puzzle|\bdog\b|best seller|top seller)/.test(last)) {
    const me = await call('getMenuEngineering');
    const top = (me.topSellers ?? []).slice(0, 3) as Array<Record<string, string | number>>;
    const q = me.quadrants ?? {};
    reply =
      `Menu engineering for ${me.period}: ${q.star?.count ?? 0} stars, ${q.plow_horse?.count ?? 0} plow horses, ${q.puzzle?.count ?? 0} puzzles, ${q.dog?.count ?? 0} dogs across ${me.itemCount} items — ${usd(me.totalMargin)} total margin.\n\n` +
      `Top sellers:\n${top.map((t) => `• ${t.item} — ${t.qty} sold, ${usd(Number(t.netSales))} (${String(t.quadrant).replace('_', ' ')})`).join('\n')}\n\n` +
      (q.puzzle?.items?.length
        ? `Puzzles like ${q.puzzle.items[0]} carry great margin but need menu placement or a server push.`
        : `Keep the stars front and center on the menu.`);
  } else if (/(event|catering|beo|buyout|private|party|pipeline)/.test(last)) {
    const [pipe, up] = await Promise.all([call('getEventPipelineSummary'), call('getUpcomingEvents', { limit: 3 })]);
    const nextEvents = (up.events ?? []) as Array<Record<string, string | number | boolean>>;
    reply =
      `Events pipeline: ${usd(pipe.openPipelineValue)} open (leads/proposals/tastings) and ${usd(pipe.committedNext30d.value)} committed across ${pipe.committedNext30d.count} events in the next 30 days. ${pipe.depositsOutstanding} booked event${pipe.depositsOutstanding === 1 ? '' : 's'} still owe a deposit.\n\n` +
      (nextEvents.length
        ? `Next up:\n${nextEvents
            .map((e) => `• ${e.title} — ${String(e.date).slice(0, 10)}, ${e.partySize} guests in ${e.space}, ${usd(Number(e.quotedTotal))}${e.depositPaid ? '' : ' (deposit outstanding)'}`)
            .join('\n')}`
        : 'Nothing on the books in the next stretch.');
  } else if (/(guest|vip|regular|crm|birthday)/.test(last)) {
    const gs = await call('searchGuests', { tag: 'vip' });
    const guests = (gs.guests ?? []).slice(0, 5) as Array<Record<string, string | number>>;
    reply =
      `Your VIP bench is ${gs.matched} strong. Top by lifetime spend:\n\n` +
      guests
        .map((g) => `• ${g.name} — ${g.visits} visits, ${usd(Number(g.lifetimeSpend))} lifetime (~${usdFull(Number(g.avgSpend))}/visit), last in ${g.lastVisit}`)
        .join('\n') +
      `\n\nAsk me about any of them by name for the full profile.`;
  } else if (/(campaign|email|sms|whatsapp|marketing|newsletter)/.test(last)) {
    const cp = await call('getCampaignPerformance');
    const best = cp.bestPerformer;
    reply =
      `${cp.sentCount} campaigns sent, driving ${cp.totalReservationsDriven} reservations.\n\n` +
      (best
        ? `Best performer: "${best.name}" (${best.channel}, ${best.segment}) — ${pct(best.openRatePct)} open, ${pct(best.clickRatePct)} click, ${best.reservations} reservations.\n\n`
        : '') +
      `${(cp.scheduled ?? []).length} scheduled and ${cp.draftCount} in draft. The VIP segment keeps out-pulling everything else — worth another paella-night send.`;
  } else {
    const [sales, pipe] = await Promise.all([call('getSalesSummary', { days: 7 }), call('getEventPipelineSummary')]);
    const hk = sales.byLocation?.["Hell's Kitchen"];
    const ev = sales.byLocation?.['East Village'];
    reply =
      `Last 7 days across Buena Vista: ${usd(sales.netSales)} net (${sign(sales.vsPriorPeriodPct)} vs the prior week), ${sales.guests.toLocaleString('en-US')} covers, ${usdFull(sales.avgCheck)} avg check, labor at ${pct(sales.laborPct)}.` +
      (hk && ev ? `\n\nHell's Kitchen ${usd(hk)} · East Village ${usd(ev)}. Best day was ${sales.bestDay.date} at ${usd(sales.bestDay.netSales)}.` : '') +
      `\n\nEvents side: ${usd(pipe.openPipelineValue)} open pipeline and ${usd(pipe.committedNext30d.value)} committed in the next 30 days. Ask about food cost, low stock, menu engineering, guests or campaigns for a deeper cut.`;
  }

  return { reply: `(demo mode) ${reply}`, toolsUsed: used, demo: true };
}

// Re-export for convenience so apps can build their own affordances.
export { copilotTools, DEMO_TODAY };
