// ============================================================
// /api/slack/events — Slack Events API receiver.
//
// Mention @BuenaVista OS in a channel (app_mention) or DM the bot
// (message.im) and the right AI-team specialist answers in-thread
// with live numbers. Lead with "as mise" / "@ledger" to pick an
// agent; plain mentions go to the general copilot.
//
// Slack expects a fast ack (~3s) and retries beyond it. runCopilot
// usually answers within that window, so we process inline and
// dedupe: retried deliveries (X-Slack-Retry-Num) and already-seen
// event_ids are acked immediately without reprocessing.
// ============================================================

import { getRepository } from '@viox/db';
import { runCopilot, getAgent } from '@viox/agents';
import {
  isSlackConfigured,
  verifySlackSignature,
  parseAgentFromText,
  postSlackMessage,
} from '@viox/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SlackEvent {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
}

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackEvent;
}

/** Module-level dedupe of processed Slack event_ids (survives warm invocations). */
const processedEvents = new Set<string>();
const PROCESSED_CAP = 500;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Light Markdown → Slack mrkdwn: bold, headings, bullets. */
function toSlackMrkdwn(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,4} (.+)$/gm, '*$1*')
    .replace(/^[-*] /gm, '• ');
}

export async function POST(req: Request): Promise<Response> {
  // Raw body FIRST — the signature is computed over the exact bytes.
  const rawBody = await req.text();

  if (!isSlackConfigured()) {
    return json({ ok: false, reason: 'slack not configured' }, 503);
  }

  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';
  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET ?? '', timestamp, rawBody, signature)) {
    return json({ ok: false, reason: 'invalid signature' }, 401);
  }

  let payload: SlackEnvelope;
  try {
    payload = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return json({ ok: false, reason: 'invalid JSON body' }, 400);
  }

  // Slack URL verification handshake — echo the challenge.
  if (payload.type === 'url_verification') {
    return json({ challenge: payload.challenge ?? '' });
  }

  // Slack retry of a delivery we already took inline — ack immediately.
  if (req.headers.get('x-slack-retry-num')) {
    return json({ ok: true, skipped: 'retry' });
  }

  if (payload.type !== 'event_callback' || !payload.event) {
    return json({ ok: true, skipped: 'unhandled payload type' });
  }

  const ev = payload.event;
  const eventId = payload.event_id ?? `${ev.channel ?? ''}:${ev.ts ?? ''}`;
  if (processedEvents.has(eventId)) return json({ ok: true, skipped: 'duplicate' });
  if (processedEvents.size >= PROCESSED_CAP) processedEvents.clear();
  processedEvents.add(eventId);

  const isMention = ev.type === 'app_mention';
  const isDm = ev.type === 'message' && ev.channel_type === 'im';
  // Ignore bot echoes (incl. our own replies) and message edits/joins.
  if ((!isMention && !isDm) || ev.bot_id || ev.subtype || !ev.channel || !ev.ts) {
    return json({ ok: true, skipped: 'ignored event' });
  }

  const { agentId, text } = parseAgentFromText(ev.text ?? '');
  const prompt = text || 'Give me the quick morning read.';
  const agent = agentId ? getAgent(agentId) : undefined;

  try {
    const result = await runCopilot({
      messages: [{ role: 'user', content: prompt }],
      repo: getRepository(),
      agentId: agentId ?? undefined,
    });

    const prefix = agent ? `*${agent.name}* — ` : '';
    const posted = await postSlackMessage({
      channel: ev.channel,
      text: `${prefix}${toSlackMrkdwn(result.reply)}`,
      thread_ts: ev.thread_ts || ev.ts,
    });

    return json({
      ok: posted.ok,
      agent: agentId ?? 'copilot',
      model: result.model,
      ...(posted.error ? { error: posted.error } : {}),
    });
  } catch (err) {
    // Ack 200 so Slack doesn't retry-storm a failing handler.
    console.error('[slack/events] handling failed:', err);
    return json({ ok: false, reason: err instanceof Error ? err.message : 'handler failed' });
  }
}
