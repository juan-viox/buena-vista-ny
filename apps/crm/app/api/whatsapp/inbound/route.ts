// ============================================================
// POST /api/whatsapp/inbound — Twilio WhatsApp webhook.
// Guest WhatsApp → Twilio → this route → Anfitrión (concierge
// agent via runCopilot) → TwiML reply, with confirmed
// reservation requests captured straight into the CRM through
// the shared lib (same path as the voice concierge).
//
// Signature: when TWILIO_AUTH_TOKEN is set, X-Twilio-Signature
// is validated against the public URL (403 on mismatch). With
// the env missing the endpoint runs open in demo mode so it can
// be curl-tested before credentials land.
// GET returns a no-auth health check for smoke tests.
// ============================================================

import { runCopilot, type ChatMessage } from '@viox/agents';
import { getRepository } from '@viox/db';
import { isWhatsAppConfigured, twimlMessage, validateTwilioSignature } from '@viox/integrations';
import { captureReservation, getRecentMessages, saveMessage, str, toPartySize } from '@/lib/reservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public URL Twilio signs requests against (set on the WhatsApp sender). */
const PUBLIC_URL = 'https://buena-vista-crm.vercel.app/api/whatsapp/inbound';

const MAX_REPLY_CHARS = 1500; // Twilio hard limit is 1600 — keep headroom.

function xml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

/** Health check — no secret required, no data returned. */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ ok: true, configured: isWhatsAppConfigured() }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}

// ---------- WhatsApp channel addendum for Anfitrión ----------

function channelAddendum(profileName: string | undefined, waNumber: string | undefined): string {
  return [
    'CHANNEL CONTEXT (not from the guest): you are answering a guest over WhatsApp — a plain-text chat channel.',
    '- Keep every reply UNDER 500 characters. Short conversational sentences; no headers, no heavy bullet lists; emoji sparingly.',
    "- Answer hours / menu / location questions for both rooms in the guest's language (English or Spanish).",
    "- To book a table, collect: name, party size, date, time, room (Hell's Kitchen or East Village), and any occasion. Ask only for what is still missing — one question at a time.",
    '- Once the guest CONFIRMS those details, tell them their reservation request is in and the team will confirm shortly.',
    profileName ? `- The guest's WhatsApp profile name is "${profileName}".` : '',
    waNumber ? `- The guest's WhatsApp number is ${waNumber}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- reservation-intent extraction (post pass) ----------

interface ExtractedReservation {
  ready: boolean;
  fields?: Record<string, unknown>;
}

function parseExtraction(reply: string): ExtractedReservation | undefined {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const p = parsed as Record<string, unknown>;
      const fields = p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields)
        ? (p.fields as Record<string, unknown>)
        : undefined;
      return { ready: p.ready === true, fields };
    }
  } catch {
    // Model didn't return clean JSON — treat as "not ready".
  }
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  // ---- parse application/x-www-form-urlencoded (need every param for the signature) ----
  let params: Record<string, string> = {};
  try {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text).entries());
  } catch {
    return xml(twimlMessage('Sorry — we could not read that message. Please try again.'), 400);
  }

  // ---- signature validation (enforced only when the auth token is configured) ----
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get('x-twilio-signature');
  if (authToken) {
    if (!validateTwilioSignature(authToken, PUBLIC_URL, params, signature)) {
      return new Response('Invalid Twilio signature.', { status: 403 });
    }
  }
  // No TWILIO_AUTH_TOKEN → demo mode: accept unsigned requests (curl testing).

  const from = str(params.From);
  const body = str(params.Body);
  const profileName = str(params.ProfileName);
  if (!from) {
    return xml(twimlMessage('Missing sender.'), 400);
  }
  if (!body) {
    return xml(twimlMessage('¡Hola! How can we help — hours, menu, or a reservation at Buena Vista?'));
  }

  const waNumber = from.replace(/^whatsapp:/, '');
  const repo = getRepository();

  // ---- last 6 messages of thread context (fails soft to []) ----
  const history = await getRecentMessages(from, 6);

  // ---- run Anfitrión (concierge agent) with the WhatsApp addendum ----
  const messages: ChatMessage[] = [
    { role: 'user', content: channelAddendum(profileName, waNumber) },
    { role: 'assistant', content: 'Understood — WhatsApp channel rules in effect. Ready for the guest.' },
    ...history.map((m): ChatMessage => ({ role: m.role, content: m.body })),
    { role: 'user', content: body },
  ];

  let reply: string;
  try {
    const result = await runCopilot({ messages, repo, agentId: 'concierge' });
    reply = result.reply;
  } catch (err) {
    console.error('[whatsapp/inbound] copilot run failed', err);
    reply =
      "Thanks for messaging Buena Vista! We're having a moment on our end — call us at (212) 388-5040 (Hell's Kitchen) or (929) 220-0547 (East Village) and we'll take care of you.";
  }

  // ---- post pass: detect a completed reservation intent and capture it ----
  try {
    const transcript = [
      ...history.map((m) => `${m.role === 'user' ? 'Guest' : 'Anfitrión'}: ${m.body}`),
      `Guest: ${body}`,
      `Anfitrión: ${reply}`,
    ].join('\n');
    const extraction = await runCopilot({
      repo,
      messages: [
        {
          role: 'user',
          content:
            'You are a strict JSON extractor for a restaurant reservation desk. Read this WhatsApp conversation and decide whether the guest has CONFIRMED a reservation request in the latest exchange (name, party size, date and time all known and confirmed).\n\n' +
            `Conversation:\n${transcript}\n\n` +
            'Respond with ONLY a JSON object, no prose:\n' +
            '{"ready": boolean, "fields": {"guest_name": string, "party_size": number, "requested_date": "YYYY-MM-DD", "requested_time": "7:30 PM", "location": "hells-kitchen" | "east-village", "occasion": string, "notes": string}}\n' +
            'Set ready to true ONLY when the guest has confirmed the details in this latest exchange (not merely discussed them). Omit unknown fields.',
        },
      ],
    });
    const extracted = parseExtraction(extraction.reply);
    if (extracted?.ready) {
      const f = extracted.fields ?? {};
      const captured = await captureReservation({
        guestName: str(f.guest_name) ?? profileName ?? 'WhatsApp guest',
        phone: waNumber,
        partySize: toPartySize(f.party_size),
        requestedDate: str(f.requested_date),
        requestedTime: str(f.requested_time),
        location: str(f.location),
        occasion: str(f.occasion),
        notes: str(f.notes) ?? (profileName ? `WhatsApp profile: ${profileName}` : undefined),
        channel: 'whatsapp',
      });
      if (captured.stored) {
        reply = `${reply}\n\n📋 ${captured.message}`;
      }
    }
  } catch (err) {
    // Capture is best-effort — never block the reply.
    console.error('[whatsapp/inbound] reservation capture pass failed', err);
  }

  if (reply.length > MAX_REPLY_CHARS) reply = `${reply.slice(0, MAX_REPLY_CHARS - 1)}…`;

  // ---- persist both sides of the exchange (fails soft) ----
  await saveMessage(from, 'user', body);
  await saveMessage(from, 'assistant', reply);

  return xml(twimlMessage(reply));
}
