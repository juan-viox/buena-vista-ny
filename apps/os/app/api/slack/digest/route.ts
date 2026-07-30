// ============================================================
// /api/slack/digest — per-agent morning brief, cron-ready.
//
//   GET|POST /api/slack/digest?agent=mise&secret=<VIOX_CRON_SECRET>[&channel=C…]
//
// Builds the agent's digest by invoking 1–2 of its tools directly
// (same tool belt the copilot uses — fixtures in demo, live data
// later) and posts a tight mrkdwn brief to SLACK_CHANNEL_ID (or
// ?channel=). Posting is the only env-gated part: without Slack
// env the route still returns { ok, posted: false, preview } so
// the digest is testable today.
// ============================================================

import { getRepository } from '@viox/db';
import type { DataRepository } from '@viox/db';
import { runTool, DEMO_TODAY } from '@viox/agents';
import { isSlackConfigured, postSlackMessage } from '@viox/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIGEST_AGENTS = ['mise', 'ledger', 'sala', 'turno', 'fiesta', 'vega'] as const;
type DigestAgentId = (typeof DIGEST_AGENTS)[number];

const AGENT_NAMES: Record<DigestAgentId, string> = {
  mise: 'Mise',
  ledger: 'Ledger',
  sala: 'Sala',
  turno: 'Turno',
  fiesta: 'Fiesta',
  vega: 'Vega',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// ---------- formatting ----------

const usd = (n: number) =>
  `$${Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(n).toLocaleString('en-US')}`;
const usdFull = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const sign = (n: number) => (n >= 0 ? `+${pct(n)}` : `-${pct(Math.abs(n))}`);

type ToolRow = Record<string, unknown>;

// ---------- digest builders (1–2 direct tool calls each) ----------

async function buildDigest(repo: DataRepository, agentId: DigestAgentId): Promise<string> {
  const call = async (name: string, input: Record<string, unknown> = {}): Promise<ToolRow> =>
    JSON.parse(await runTool(repo, name, input)) as ToolRow;

  const head = `*${AGENT_NAMES[agentId]}* — ${DEMO_TODAY} digest`;
  const lines: string[] = [head];

  switch (agentId) {
    case 'mise': {
      const [ls, pa] = await Promise.all([call('getLowStockItems'), call('getPriceAlerts')]);
      const items = ((ls.items ?? []) as ToolRow[]).slice(0, 6);
      const count = Number(ls.lowStockCount ?? 0);
      lines.push(`${count} item${count === 1 ? '' : 's'} at or below par:`);
      for (const i of items) lines.push(`• ${i.item} — ${i.onHand} ${i.unit} on hand vs par ${i.par} (${i.vendor})`);
      const open = ((pa.alerts ?? []) as ToolRow[]).filter((a) => !a.acknowledged);
      if (open.length) {
        const top = open[0];
        lines.push(
          `${pa.openCount} open price alert${Number(pa.openCount) === 1 ? '' : 's'} — biggest: ${top.item} (${top.vendor}) $${top.oldPrice} → $${top.newPrice} (${sign(Number(top.changePct))}).`,
        );
      }
      break;
    }
    case 'ledger': {
      const fc = await call('getFoodCostOverview');
      lines.push(
        `Menu running ${pct(Number(fc.avgCostPct))} vs ${pct(Number(fc.avgTargetPct))} target — ${fc.itemsOverTarget} recipe${Number(fc.itemsOverTarget) === 1 ? '' : 's'} over.`,
      );
      for (const w of ((fc.worstOffenders ?? []) as ToolRow[]).slice(0, 3)) {
        lines.push(
          `• ${w.item} — ${pct(Number(w.costPct))} vs ${pct(Number(w.targetPct))} (${sign(Number(w.overByPts))} pts, plate ${usdFull(Number(w.plateCost))} on $${w.price})`,
        );
      }
      lines.push(
        `Purchasing ${usd(Number(fc.purchases30d))} across ${fc.invoices30d} invoices (30d), ${fc.invoicesPendingReview} pending review, ${fc.openPriceAlerts} open price alerts.`,
      );
      break;
    }
    case 'sala': {
      const [s, me] = await Promise.all([call('getSalesSummary', { days: 7 }), call('getMenuEngineering')]);
      const byLoc = (s.byLocation ?? {}) as Record<string, number>;
      const best = (s.bestDay ?? {}) as ToolRow;
      lines.push(
        `Last 7 days: ${usd(Number(s.netSales))} net (${sign(Number(s.vsPriorPeriodPct))} vs prior), ${Number(s.guests).toLocaleString('en-US')} covers, ${usdFull(Number(s.avgCheck))} avg check.`,
      );
      const locLine = Object.entries(byLoc)
        .map(([name, v]) => `${name} ${usd(v)}`)
        .join(' · ');
      if (locLine) lines.push(`${locLine} — best day ${best.date} at ${usd(Number(best.netSales))}.`);
      const top = ((me.topSellers ?? []) as ToolRow[]).slice(0, 3);
      if (top.length) lines.push(`Top sellers (${me.period}): ${top.map((t) => `${t.item} (${t.qty})`).join(', ')}.`);
      break;
    }
    case 'turno': {
      const s = await call('getSalesSummary', { days: 7 });
      lines.push(
        `Labor ran ${pct(Number(s.laborPct))} of net over the last 7 days — ${usd(Number(s.laborCost))} on ${usd(Number(s.netSales))} across ${Number(s.guests).toLocaleString('en-US')} covers.`,
      );
      lines.push(
        'Fri/Sat run leanest; slow Mondays creep past 30% — and watch the EV 2 AM close crew for weekend overtime stacking.',
      );
      break;
    }
    case 'fiesta': {
      const [pipe, up] = await Promise.all([call('getEventPipelineSummary'), call('getUpcomingEvents', { limit: 3 })]);
      const committed = (pipe.committedNext30d ?? {}) as ToolRow;
      lines.push(
        `Pipeline: ${usd(Number(pipe.openPipelineValue))} open · ${usd(Number(committed.value))} committed across ${committed.count} event${Number(committed.count) === 1 ? '' : 's'} (next 30d) · ${pipe.depositsOutstanding} deposit${Number(pipe.depositsOutstanding) === 1 ? '' : 's'} outstanding.`,
      );
      const events = (up.events ?? []) as ToolRow[];
      if (events.length) {
        lines.push('Next up:');
        for (const e of events) {
          lines.push(
            `• ${e.title} — ${String(e.date).slice(0, 10)}, ${e.partySize} guests in ${e.space}, ${usd(Number(e.quotedTotal))}${e.depositPaid ? '' : ' (deposit outstanding)'}`,
          );
        }
      }
      break;
    }
    case 'vega': {
      const cp = await call('getCampaignPerformance');
      lines.push(
        `${cp.sentCount} campaign${Number(cp.sentCount) === 1 ? '' : 's'} sent · ${cp.totalReservationsDriven} reservations driven.`,
      );
      const best = cp.bestPerformer as ToolRow | null;
      if (best) {
        lines.push(
          `Best: "${best.name}" (${best.channel}, ${best.segment}) — ${pct(Number(best.openRatePct))} open, ${pct(Number(best.clickRatePct))} click, ${best.reservations} reservations.`,
        );
      }
      lines.push(`${((cp.scheduled ?? []) as ToolRow[]).length} scheduled · ${cp.draftCount} in draft.`);
      break;
    }
  }

  return lines.join('\n');
}

// ---------- handler (GET + POST share it — cron services differ) ----------

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const cronSecret = process.env.VIOX_CRON_SECRET;
  if (cronSecret && url.searchParams.get('secret') !== cronSecret) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const agentParam = (url.searchParams.get('agent') ?? '').toLowerCase().trim();
  if (!(DIGEST_AGENTS as readonly string[]).includes(agentParam)) {
    return json(
      { ok: false, reason: `Pass ?agent= one of: ${DIGEST_AGENTS.join(', ')}.` },
      400,
    );
  }
  const agentId = agentParam as DigestAgentId;

  let preview: string;
  try {
    preview = await buildDigest(getRepository(), agentId);
  } catch (err) {
    return json({ ok: false, reason: err instanceof Error ? err.message : 'digest build failed' }, 500);
  }

  const channel = url.searchParams.get('channel') || process.env.SLACK_CHANNEL_ID || '';
  if (!isSlackConfigured() || !channel) {
    // Demo-testable today: digest builds from fixtures, posting waits on env.
    return json({ ok: true, posted: false, preview });
  }

  const posted = await postSlackMessage({ channel, text: preview });
  return json({
    ok: posted.ok,
    posted: posted.ok,
    preview,
    ...(posted.error ? { error: posted.error } : {}),
  });
}

export { handle as GET, handle as POST };
