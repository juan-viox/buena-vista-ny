// ============================================================
// POST /api/voice/reservation — ElevenLabs "Anfitrión" webhook.
// The voice concierge calls this tool with the guest's details;
// we upsert the guest + insert a reservation_request row into
// Supabase via plain PostgREST fetch (no extra dependencies).
// GET returns a no-auth health check for smoke tests.
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TENANT_SLUG = 'buena-vista';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Trimmed non-empty string or undefined. */
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Coerce party size to a positive integer or undefined. */
function toPartySize(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Accept true/false, "true"/"yes"/"si"/"sí"/"1" from voice tool calls. */
function toOptIn(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', 'si', 'sí', '1'].includes(v.trim().toLowerCase());
  return false;
}

interface SupabaseTarget {
  base: string;
  headers: Record<string, string>;
}

function supabaseTarget(): SupabaseTarget | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    base: `${url.replace(/\/+$/, '')}/rest/v1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

/** Health check — no secret required, no data returned. */
export async function GET(): Promise<Response> {
  return json({ ok: true, configured: !!process.env.SUPABASE_URL });
}

export async function POST(req: Request): Promise<Response> {
  // ---- auth ----
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-viox-secret') !== secret) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  // ---- parse + validate ----
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const guestName = str(b.guest_name);
  if (!guestName) {
    return json({ ok: false, error: 'guest_name is required.' }, 400);
  }

  const phone = str(b.phone);
  const email = str(b.email);
  const partySize = toPartySize(b.party_size);
  const requestedDate = str(b.requested_date);
  const requestedTime = str(b.requested_time);
  const location = str(b.location); // 'hells-kitchen' | 'east-village' | free text
  const occasion = str(b.occasion);
  const notes = str(b.notes);
  const marketingOptIn = toOptIn(b.marketing_opt_in);

  // ---- storage not configured: never fail a live call ----
  const supabase = supabaseTarget();
  if (!supabase) {
    return json({ ok: true, stored: false, reason: 'storage not configured' });
  }

  try {
    // (a) Guest upsert (by tenant+phone when we have a phone) — best effort:
    // a guest failure must not lose the reservation request itself.
    let guestId: string | undefined;
    try {
      const guestBody = {
        tenant_slug: TENANT_SLUG,
        name: guestName,
        phone: phone ?? null,
        email: email ?? null,
        source: 'voice',
        marketing_opt_in: marketingOptIn,
      };
      const guestUrl = phone
        ? `${supabase.base}/guests?on_conflict=tenant_slug,phone`
        : `${supabase.base}/guests`;
      const prefer = phone
        ? 'resolution=merge-duplicates,return=representation'
        : 'return=representation';
      const guestRes = await fetch(guestUrl, {
        method: 'POST',
        headers: { ...supabase.headers, Prefer: prefer },
        body: JSON.stringify(guestBody),
        cache: 'no-store',
      });
      if (guestRes.ok) {
        const rows = (await guestRes.json()) as Array<{ id?: string | number }>;
        const id = Array.isArray(rows) ? rows[0]?.id : undefined;
        if (id !== undefined && id !== null) guestId = String(id);
      } else {
        console.error('[voice/reservation] guest upsert failed', guestRes.status, await guestRes.text());
      }
    } catch (guestErr) {
      console.error('[voice/reservation] guest upsert error', guestErr);
    }

    // (b) Reservation request insert.
    const requestBody = {
      tenant_slug: TENANT_SLUG,
      guest_id: guestId ?? null,
      guest_name: guestName,
      phone: phone ?? null,
      email: email ?? null,
      party_size: partySize ?? null,
      requested_date: requestedDate ?? null,
      requested_time: requestedTime ?? null,
      location: location ?? null,
      occasion: occasion ?? null,
      notes: notes ?? null,
      channel: 'voice',
      status: 'new',
    };
    const insertRes = await fetch(`${supabase.base}/reservation_requests`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });
    if (!insertRes.ok) {
      console.error('[voice/reservation] insert failed', insertRes.status, await insertRes.text());
      return json({ ok: false, error: 'Could not store the reservation request.' }, 500);
    }
    const inserted = (await insertRes.json()) as Array<{ id?: string | number }>;
    const rowId = Array.isArray(inserted) ? inserted[0]?.id : undefined;

    return json({
      ok: true,
      stored: true,
      id: rowId !== undefined && rowId !== null ? String(rowId) : undefined,
      message: 'Reservation request captured — the team will confirm shortly.',
    });
  } catch (err) {
    console.error('[voice/reservation] error', err);
    return json({ ok: false, error: 'Internal error storing the reservation request.' }, 500);
  }
}
