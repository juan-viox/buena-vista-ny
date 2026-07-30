// ============================================================
// Slack team-collaboration adapter — env-gated, zero new deps.
//
// Env:
//   SLACK_BOT_TOKEN      xoxb- bot token (chat:write)
//   SLACK_SIGNING_SECRET request-signature secret (Events API)
//   SLACK_CHANNEL_ID     optional default channel for digests
//
// Exposes the primitives the OS Slack routes build on:
//   isSlackConfigured()     both Slack env vars present
//   verifySlackSignature()  v0 HMAC-SHA256 per Slack docs, 5-min replay window
//   postSlackMessage()      chat.postMessage via plain fetch (mrkdwn)
//   stripMention()          drop <@U…> bot mentions from event text
//   parseAgentFromText()    leading "as <agent>" / "@<agent>" → AI-team agent id
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Both Slack env vars present — posting AND signature verification possible. */
export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET);
}

/**
 * Verify a Slack request signature (v0 scheme):
 *   base = "v0:{timestamp}:{rawBody}"
 *   expected = "v0=" + hex(HMAC-SHA256(signingSecret, base))
 * Rejects timestamps more than 5 minutes from now (replay protection)
 * and compares with a constant-time equality check.
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PostSlackMessageInput {
  /** Channel id (C… / D…) or name the bot has been invited to. */
  channel: string;
  /** mrkdwn-formatted message body. */
  text: string;
  /** Reply in a thread — pass the parent message ts. */
  thread_ts?: string;
}

export interface PostSlackMessageResult {
  ok: boolean;
  /** ts of the posted message when ok. */
  ts?: string;
  channel?: string;
  error?: string;
}

interface SlackApiResponse {
  ok?: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/** Post a mrkdwn message via chat.postMessage. Never throws — errors land in `.error`. */
export async function postSlackMessage({
  channel,
  text,
  thread_ts,
}: PostSlackMessageInput): Promise<PostSlackMessageResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  if (!channel) return { ok: false, error: 'no channel provided' };

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text,
        mrkdwn: true,
        unfurl_links: false,
        ...(thread_ts ? { thread_ts } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as SlackApiResponse;
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `chat.postMessage HTTP ${res.status}` };
    }
    return { ok: true, ts: data.ts, channel: data.channel };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'chat.postMessage failed' };
  }
}

/** Remove <@U12345> / <@U12345|name> mention tokens and collapse whitespace. */
export function stripMention(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+(\|[^>]*)?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * AI-team agent aliases → registry ids (see @viox/agents registry.ts).
 * Kept as a local map so @viox/integrations stays dependency-light.
 */
const AGENT_ALIASES: Record<string, string> = {
  mise: 'mise',
  ledger: 'ledger',
  sala: 'sala',
  turno: 'turno',
  fiesta: 'fiesta',
  concierge: 'concierge',
  anfitrion: 'concierge',
  anfitrión: 'concierge',
  vega: 'vega',
};

export interface ParsedAgentText {
  /** AI-team agent id when the message leads with "as <agent>" or "@<agent>", else null. */
  agentId: string | null;
  /** The message with any bot mention and agent prefix removed. */
  text: string;
}

/**
 * Pick an AI-team agent from the front of a Slack message.
 * Accepts "as mise …", "as @Ledger, …" or "@fiesta …" (bot mentions
 * are stripped first). Unknown names leave the text untouched.
 */
export function parseAgentFromText(text: string): ParsedAgentText {
  const cleaned = stripMention(text ?? '');
  const m = cleaned.match(/^(?:as\s+@?|@)([\p{L}_-]+)[\s,:.—-]*/iu);
  if (m) {
    const agentId = AGENT_ALIASES[m[1].toLowerCase()];
    if (agentId) return { agentId, text: cleaned.slice(m[0].length).trim() };
  }
  return { agentId: null, text: cleaned };
}
