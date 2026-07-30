// ============================================================
// @viox/agents — runCopilot: tool-use loop on Anthropic or any
// OpenAI-compatible provider (OpenRouter, DeepSeek, Ollama Cloud),
// with a data-grounded demo fallback when no API key is configured.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { DataRepository } from '@viox/db';
import { anthropicToolSpecs, copilotTools, getToolByName, runTool, DEMO_TODAY } from './tools';
import { getAgent, type AgentDef } from './registry';
import { resolveModel, PROVIDER_CONFIG, type ModelOption, type ProviderConfig } from './models';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotResult {
  reply: string;
  /** Friendly labels of tools consulted, e.g. ["sales summary"]. */
  toolsUsed: string[];
  demo: boolean;
  /** Resolved model id the run was routed to (or would be, in demo mode). */
  model: string;
  provider: ModelOption['provider'];
}

/** Internal result before the model/provider stamp is applied. */
type CoreResult = Omit<CopilotResult, 'model' | 'provider'>;

export interface RunCopilotOptions {
  messages: ChatMessage[];
  repo: DataRepository;
  /** Active operator persona (owner | gm | chef | events | marketing | staff). */
  persona?: string;
  /** Scope the run to one AI-team agent (see registry.ts) — persona prompt + tool subset. */
  agentId?: string;
  /** Model id from the catalog (see models.ts). Unknown/missing → default model. */
  model?: string;
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

const SHARED_CONTEXT = [
  'Two locations: Hell\'s Kitchen (536 9th Ave, (212) 388-5040 — strong lunch and pre-theater dinner) and East Village (88 2nd Ave, (929) 220-0547 — late-night Friday/Saturday until 2 AM).',
  `Today is ${DEMO_TODAY}. All operating data comes from the tools — always call the relevant tool before answering a data question, and cite the actual numbers you get back.`,
  'Menu anchors: Paella Buenavista $59 (for two), Paella Negra $59, Ceviche Limeño $21, Pulpo a la Parrilla $28, Salmon Barceloneta $36, Chilean Sea Bass Mediterráneo $42, Ossobuco de Cerdo Ibérico $39, flan and churros, BV cocktails (smoked old fashioned, sangría), weekend brunch.',
  'Speak operator language: net sales, covers, avg check, food cost %, labor %, 86\'d, par, BEO. Be concise — short paragraphs or tight bullet lists, figures formatted like $12.4k / 28.4%. Never invent numbers; if a tool returns nothing, say so.',
  'When a number is off-plan (food cost over target, labor high, price spike), flag it and suggest one concrete next step.',
];

function buildSystemPrompt(persona?: string, agent?: AgentDef): string {
  const focus = persona ? PERSONA_FOCUS[persona.toLowerCase()] : undefined;
  const identity = agent
    ? [
        `You are ${agent.name} — ${agent.tagline} — a named specialist on the VioX AI team for Buena Vista Restaurant & Bar, a Latin-Mediterranean restaurant group in NYC (Google 4.7, ~1,481 reviews).`,
        agent.description,
        `Stay in your specialty and speak in first person as ${agent.name}. Your only tools are: ${agent.tools.join(', ')}. If the operator asks for something outside your lane, answer in one line and point them to the right teammate on the AI team (Mise — inventory, Ledger — food cost, Sala — sales & menu, Turno — labor, Fiesta — events, Anfitrión — guest concierge, Vega — campaigns) instead of guessing.`,
      ]
    : [
        'You are the VioX Restaurant OS copilot for Buena Vista Restaurant & Bar, a Latin-Mediterranean restaurant group in NYC (Google 4.7, ~1,481 reviews).',
      ];
  return [...identity, ...SHARED_CONTEXT, focus ?? ''].filter(Boolean).join('\n');
}

/**
 * Run the copilot on any catalog model — Anthropic direct, or any of the
 * OpenAI-compatible providers (OpenRouter, DeepSeek, Ollama Cloud).
 * Falls back to a data-grounded demo response (which still consults
 * 1–2 tools directly and formats real fixture numbers) when the chosen
 * provider's API key is missing or the API is unreachable.
 */
export async function runCopilot({ messages, repo, persona, agentId, model }: RunCopilotOptions): Promise<CopilotResult> {
  const agent = agentId ? getAgent(agentId) : undefined;
  if (agentId && !agent) throw new Error(`Unknown agent "${agentId}".`);

  // Explicit request wins; otherwise honor the COPILOT_MODEL env override; else catalog default.
  const resolved = resolveModel(model ?? process.env.COPILOT_MODEL);
  const stamp = (r: CoreResult): CopilotResult => ({ ...r, model: resolved.id, provider: resolved.provider });

  const providerConfig = resolved.provider === 'anthropic' ? undefined : PROVIDER_CONFIG[resolved.provider];
  const keyEnv = providerConfig?.envKey ?? 'ANTHROPIC_API_KEY';
  const apiKey = process.env[keyEnv];
  if (!apiKey) {
    const fallback = await demoRespond(messages, repo, agent);
    // Only surface the notice when a model was explicitly requested — the
    // key-less default deployment stays a clean demo experience.
    const notice = model
      ? `(model unavailable) ${resolved.label} (${providerLabel(resolved.provider)}) needs ${keyEnv} — falling back.\n\n`
      : '';
    return stamp({ ...fallback, reply: `${notice}${fallback.reply}` });
  }

  try {
    const result = providerConfig
      ? await runOpenAICompatible(providerConfig, messages, repo, resolved, apiKey, persona, agent)
      : await liveRespond(messages, repo, resolved, persona, agent);
    return stamp(result);
  } catch (err) {
    // Keep the sales demo alive even if the API is unreachable/misconfigured.
    console.error(`[copilot] ${resolved.provider} run failed for ${resolved.id}:`, err);
    const fallback = await demoRespond(messages, repo, agent);
    return stamp({ ...fallback, reply: `${fallback.reply}\n\n(Live copilot unreachable — served from local data.)` });
  }
}

// ---------- live mode: Anthropic ----------

async function liveRespond(
  messages: ChatMessage[],
  repo: DataRepository,
  modelOption: ModelOption,
  persona?: string,
  agent?: AgentDef,
): Promise<CoreResult> {
  const client = new Anthropic();
  const model = modelOption.id;
  const system = buildSystemPrompt(persona, agent);
  const specs = agent ? anthropicToolSpecs().filter((t) => agent.tools.includes(t.name)) : anthropicToolSpecs();
  const tools = specs as Anthropic.Messages.Tool[];

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
        // Hard-enforce the agent's tool subset even if the model asks for more.
        if (agent && !agent.tools.includes(tu.name)) {
          const denied = JSON.stringify({ error: `Tool "${tu.name}" is outside ${agent.name}'s scope.` });
          return { type: 'tool_result', tool_use_id: tu.id, content: denied };
        }
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

// ---------- live mode: OpenAI-compatible providers ----------
// One runner covers OpenRouter, DeepSeek and Ollama Cloud — same
// /chat/completions shape, base URL + key from PROVIDER_CONFIG.

const PROVIDER_LABEL: Record<ModelOption['provider'], string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  ollama: 'Ollama Cloud',
};

function providerLabel(provider: ModelOption['provider']): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIResponseMessage {
  content?: string | null;
  refusal?: string | null;
  tool_calls?: OAIToolCall[];
}

interface OAIResponse {
  choices?: Array<{
    message?: OAIResponseMessage;
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

async function runOpenAICompatible(
  providerConfig: ProviderConfig,
  messages: ChatMessage[],
  repo: DataRepository,
  modelOption: ModelOption,
  apiKey: string,
  persona?: string,
  agent?: AgentDef,
): Promise<CoreResult> {
  const provider = providerLabel(modelOption.provider);
  const system = buildSystemPrompt(persona, agent);
  const specs = agent ? anthropicToolSpecs().filter((t) => agent.tools.includes(t.name)) : anthropicToolSpecs();
  // Same tool defs, OpenAI function schema.
  const tools = specs.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  // Attribution headers are an OpenRouter convention — only send them there.
  if (modelOption.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://buena-vista-os.vercel.app';
    headers['X-Title'] = 'VioX Restaurant OS';
  }

  const chat = async (body: Record<string, unknown>): Promise<OAIResponseMessage> => {
    const res = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[copilot] ${provider} ${res.status} for ${modelOption.id}:`, detail.slice(0, 2000));
      throw new Error(`${provider} request failed (${res.status}).`);
    }
    const data = (await res.json()) as OAIResponse;
    if (data.error?.message) {
      console.error(`[copilot] ${provider} error for ${modelOption.id}:`, data.error.message);
      throw new Error(`${provider} error: ${data.error.message}`);
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error(`${provider} returned no choices.`);
    return msg;
  };

  const convo: OAIMessage[] = [
    { role: 'system', content: system },
    ...messages.map((m): OAIMessage => ({ role: m.role, content: m.content })),
  ];
  const toolsUsed: string[] = [];
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let msg: OAIResponseMessage;
    try {
      msg = await chat({ model: modelOption.id, max_tokens: 1200, messages: convo, tools });
    } catch (err) {
      // Some open models reject tool schemas outright — retry the turn without
      // tools so the operator still gets an answer instead of a dropped run.
      console.error(`[copilot] ${provider} tool-call request failed for ${modelOption.id}, retrying without tools:`, err);
      const plain = await chat({ model: modelOption.id, max_tokens: 1200, messages: convo });
      const text = typeof plain.content === 'string' ? plain.content.trim() : '';
      return {
        reply: `${text || lastText || 'I came up empty on that one — try rephrasing?'}\n\n(model answered without tools)`,
        toolsUsed,
        demo: false,
      };
    }

    if (msg.refusal) {
      return { reply: `${modelOption.label} declined to answer: ${msg.refusal}`, toolsUsed, demo: false };
    }
    if (typeof msg.content === 'string' && msg.content.trim()) lastText = msg.content.trim();

    const toolCalls = (msg.tool_calls ?? []).filter((tc) => tc.type === 'function');
    if (toolCalls.length === 0) {
      return { reply: lastText || 'I came up empty on that one — try rephrasing?', toolsUsed, demo: false };
    }

    // Echo the assistant turn, then execute against the same tool registry.
    convo.push({ role: 'assistant', content: msg.content ?? null, tool_calls: toolCalls });
    let results: OAIMessage[];
    try {
      results = await Promise.all(
        toolCalls.map(async (tc): Promise<OAIMessage> => {
          // Hard-enforce the agent's tool subset even if the model asks for more.
          if (agent && !agent.tools.includes(tc.function.name)) {
            const denied = JSON.stringify({ error: `Tool "${tc.function.name}" is outside ${agent.name}'s scope.` });
            return { role: 'tool', tool_call_id: tc.id, content: denied };
          }
          let input: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(tc.function.arguments || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
          } catch {
            // Malformed args from the model — run the tool with defaults.
          }
          const label = getToolByName(tc.function.name)?.label ?? tc.function.name;
          if (!toolsUsed.includes(label)) toolsUsed.push(label);
          const output = await runTool(repo, tc.function.name, input);
          return { role: 'tool', tool_call_id: tc.id, content: output };
        }),
      );
    } catch (err) {
      // Tool execution blew up mid-loop (open models can emit malformed or
      // unknown calls) — surface what the model already said rather than dying.
      console.error(`[copilot] ${provider} tool execution failed for ${modelOption.id}:`, err);
      if (lastText) return { reply: `${lastText}\n\n(model answered without tools)`, toolsUsed, demo: false };
      throw err;
    }
    convo.push(...results);
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

async function demoRespond(messages: ChatMessage[], repo: DataRepository, agent?: AgentDef): Promise<CoreResult> {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() ?? '';
  const used: string[] = [];
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const label = getToolByName(name)?.label ?? name;
    if (!used.includes(label)) used.push(label);
    return JSON.parse(await runTool(repo, name, input));
  };
  // With an agent active, only branches that use its tool subset are reachable.
  const allowed = agent ? new Set(agent.tools) : undefined;
  const can = (...names: string[]) => names.every((n) => !allowed || allowed.has(n));

  let reply: string;

  if (can('getFoodCostOverview') && /(food cost|cogs|plate|recipe|margin(?!.*campaign))/.test(last)) {
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
  } else if (can('getLowStockItems') && /(stock|inventory|par|reorder|86|order list)/.test(last)) {
    const ls = await call('getLowStockItems');
    const items = (ls.items ?? []).slice(0, 6) as Array<Record<string, string | number>>;
    reply =
      `${ls.lowStockCount} item${ls.lowStockCount === 1 ? ' is' : 's are'} at or below par right now.\n\n` +
      items.map((i) => `• ${i.item} — ${i.onHand} ${i.unit} on hand vs par ${i.par} (${i.vendor})`).join('\n') +
      `\n\nWorth getting orders in before the weekend push.`;
  } else if (can('getPriceAlerts') && /(price alert|price spike|vendor price|price change)/.test(last)) {
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
  } else if (can('getMenuEngineering') && /(menu engineer|star|plow|puzzle|\bdog\b|best seller|top seller)/.test(last)) {
    const me = await call('getMenuEngineering');
    const top = (me.topSellers ?? []).slice(0, 3) as Array<Record<string, string | number>>;
    const q = me.quadrants ?? {};
    reply =
      `Menu engineering for ${me.period}: ${q.star?.count ?? 0} stars, ${q.plow_horse?.count ?? 0} plow horses, ${q.puzzle?.count ?? 0} puzzles, ${q.dog?.count ?? 0} dogs across ${me.itemCount} items — ${usd(me.totalMargin)} total margin.\n\n` +
      `Top sellers:\n${top.map((t) => `• ${t.item} — ${t.qty} sold, ${usd(Number(t.netSales))} (${String(t.quadrant).replace('_', ' ')})`).join('\n')}\n\n` +
      (q.puzzle?.items?.length
        ? `Puzzles like ${q.puzzle.items[0]} carry great margin but need menu placement or a server push.`
        : `Keep the stars front and center on the menu.`);
  } else if (can('getEventPipelineSummary', 'getUpcomingEvents') && /(event|catering|beo|buyout|private|party|pipeline)/.test(last)) {
    const [pipe, up] = await Promise.all([call('getEventPipelineSummary'), call('getUpcomingEvents', { limit: 3 })]);
    const nextEvents = (up.events ?? []) as Array<Record<string, string | number | boolean>>;
    reply =
      `Events pipeline: ${usd(pipe.openPipelineValue)} open (leads/proposals/tastings) and ${usd(pipe.committedNext30d.value)} committed across ${pipe.committedNext30d.count} events in the next 30 days. ${pipe.depositsOutstanding} booked event${pipe.depositsOutstanding === 1 ? '' : 's'} still owe a deposit.\n\n` +
      (nextEvents.length
        ? `Next up:\n${nextEvents
            .map((e) => `• ${e.title} — ${String(e.date).slice(0, 10)}, ${e.partySize} guests in ${e.space}, ${usd(Number(e.quotedTotal))}${e.depositPaid ? '' : ' (deposit outstanding)'}`)
            .join('\n')}`
        : 'Nothing on the books in the next stretch.');
  } else if (can('searchGuests') && /(guest|vip|regular|crm|birthday)/.test(last)) {
    const gs = await call('searchGuests', { tag: 'vip' });
    const guests = (gs.guests ?? []).slice(0, 5) as Array<Record<string, string | number>>;
    reply =
      `Your VIP bench is ${gs.matched} strong. Top by lifetime spend:\n\n` +
      guests
        .map((g) => `• ${g.name} — ${g.visits} visits, ${usd(Number(g.lifetimeSpend))} lifetime (~${usdFull(Number(g.avgSpend))}/visit), last in ${g.lastVisit}`)
        .join('\n') +
      `\n\nAsk me about any of them by name for the full profile.`;
  } else if (can('getCampaignPerformance') && /(campaign|email|sms|whatsapp|marketing|newsletter)/.test(last)) {
    const cp = await call('getCampaignPerformance');
    const best = cp.bestPerformer;
    reply =
      `${cp.sentCount} campaigns sent, driving ${cp.totalReservationsDriven} reservations.\n\n` +
      (best
        ? `Best performer: "${best.name}" (${best.channel}, ${best.segment}) — ${pct(best.openRatePct)} open, ${pct(best.clickRatePct)} click, ${best.reservations} reservations.\n\n`
        : '') +
      `${(cp.scheduled ?? []).length} scheduled and ${cp.draftCount} in draft. The VIP segment keeps out-pulling everything else — worth another paella-night send.`;
  } else if (can('getSalesSummary') && /(labor|overtime|staffing|schedul|shift)/.test(last)) {
    const s = await call('getSalesSummary', { days: 7 });
    reply =
      `Labor ran ${pct(s.laborPct)} of net over the last 7 days — ${usd(s.laborCost)} on ${usd(s.netSales)} net across ${s.guests.toLocaleString('en-US')} covers. ` +
      `Busy Fri/Sat nights run leanest; slow Mondays are where the percentage creeps past 30. Cleanest trim: one floor shift off the Monday East Village schedule — and watch the EV 2 AM close crew for weekend overtime stacking.`;
  } else {
    // No keyword hit — the general copilot summarizes the week; an agent leads with its home tool.
    switch (agent?.id) {
      case 'mise': {
        const ls = await call('getLowStockItems');
        const items = (ls.items ?? []).slice(0, 4) as Array<Record<string, string | number>>;
        reply =
          `${ls.lowStockCount} item${ls.lowStockCount === 1 ? ' is' : 's are'} at or below par — my reorder list starts with:\n\n` +
          items.map((i) => `• ${i.item} — ${i.onHand} ${i.unit} on hand vs par ${i.par} (${i.vendor})`).join('\n') +
          `\n\nAsk me for the full list, the open price alerts, or a vendor-ready reorder draft.`;
        break;
      }
      case 'ledger': {
        const fc = await call('getFoodCostOverview');
        const top = ((fc.worstOffenders ?? []) as Array<Record<string, number | string>>)[0];
        reply =
          `The menu is running ${pct(fc.avgCostPct)} against a ${pct(fc.avgTargetPct)} blended target with ${fc.itemsOverTarget} recipes over.` +
          (top ? ` Worst gap: ${top.item} at ${pct(Number(top.costPct))} vs ${pct(Number(top.targetPct))} target.` : '') +
          ` Ask me to re-cost a dish, rank the offenders, or find the fastest margin recovery.`;
        break;
      }
      case 'sala': {
        const s = await call('getSalesSummary', { days: 7 });
        const hk = s.byLocation?.["Hell's Kitchen"];
        const ev = s.byLocation?.['East Village'];
        reply =
          `Last 7 days: ${usd(s.netSales)} net (${sign(s.vsPriorPeriodPct)} vs the prior week), ${s.guests.toLocaleString('en-US')} covers, ${usdFull(s.avgCheck)} avg check.` +
          (hk && ev ? ` Hell's Kitchen ${usd(hk)} · East Village ${usd(ev)}; best day ${s.bestDay.date} at ${usd(s.bestDay.netSales)}.` : '') +
          ` Ask me for dayparts, the location head-to-head, or the menu-engineering matrix.`;
        break;
      }
      case 'turno': {
        const s = await call('getSalesSummary', { days: 7 });
        reply =
          `Labor ran ${pct(s.laborPct)} over the last 7 days — ${usd(s.laborCost)} on ${usd(s.netSales)} net. ` +
          `Fri/Sat run leanest; slow Mondays creep past 30%, and the East Village 2 AM close crew is the overtime watch on weekends. Ask me which days broke the band.`;
        break;
      }
      case 'fiesta': {
        const [pipe, up] = await Promise.all([call('getEventPipelineSummary'), call('getUpcomingEvents', { limit: 3 })]);
        const nextEvents = (up.events ?? []) as Array<Record<string, string | number | boolean>>;
        reply =
          `Pipeline: ${usd(pipe.openPipelineValue)} open and ${usd(pipe.committedNext30d.value)} committed across ${pipe.committedNext30d.count} events in the next 30 days.` +
          (nextEvents.length
            ? `\n\nNext up:\n${nextEvents
                .map((e) => `• ${e.title} — ${String(e.date).slice(0, 10)}, ${e.partySize} guests in ${e.space}, ${usd(Number(e.quotedTotal))}${e.depositPaid ? '' : ' (deposit outstanding)'}`)
                .join('\n')}`
            : '');
        break;
      }
      case 'concierge': {
        const gs = await call('searchGuests', { tag: 'vip' });
        const top = (gs.guests ?? []).slice(0, 3) as Array<Record<string, string | number>>;
        reply =
          `I recognize ${gs.matched} VIPs on sight — ${top.map((g) => String(g.name)).join(', ')} lead the book. ` +
          `Give me a caller's name and I'll pull their profile, favorites and next reservation before you pick up.`;
        break;
      }
      case 'vega': {
        const cp = await call('getCampaignPerformance');
        const best = cp.bestPerformer;
        reply =
          `${cp.sentCount} campaigns sent, ${cp.totalReservationsDriven} reservations driven.` +
          (best ? ` Best performer: "${best.name}" (${best.channel}, ${best.segment}) — ${pct(best.openRatePct)} open, ${best.reservations} reservations.` : '') +
          ` ${(cp.scheduled ?? []).length} scheduled, ${cp.draftCount} in draft. Ask me for the segment math behind any of them or a winback draft.`;
        break;
      }
      default: {
        const [sales, pipe] = await Promise.all([call('getSalesSummary', { days: 7 }), call('getEventPipelineSummary')]);
        const hk = sales.byLocation?.["Hell's Kitchen"];
        const ev = sales.byLocation?.['East Village'];
        reply =
          `Last 7 days across Buena Vista: ${usd(sales.netSales)} net (${sign(sales.vsPriorPeriodPct)} vs the prior week), ${sales.guests.toLocaleString('en-US')} covers, ${usdFull(sales.avgCheck)} avg check, labor at ${pct(sales.laborPct)}.` +
          (hk && ev ? `\n\nHell's Kitchen ${usd(hk)} · East Village ${usd(ev)}. Best day was ${sales.bestDay.date} at ${usd(sales.bestDay.netSales)}.` : '') +
          `\n\nEvents side: ${usd(pipe.openPipelineValue)} open pipeline and ${usd(pipe.committedNext30d.value)} committed in the next 30 days. Ask about food cost, low stock, menu engineering, guests or campaigns for a deeper cut.`;
      }
    }
  }

  return { reply: `(demo mode) ${agent ? `${agent.name} — ` : ''}${reply}`, toolsUsed: used, demo: true };
}

// Re-export for convenience so apps can build their own affordances.
export { copilotTools, DEMO_TODAY };
