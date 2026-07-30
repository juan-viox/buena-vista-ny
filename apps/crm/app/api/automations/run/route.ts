// ============================================================
// /api/automations/run — marketing-automation trigger.
//   GET  → { ok, automations: [...meta] } — playbook catalog with
//          live fixture audience counts. No secret required.
//   GET ?automation=birthday → scheduled (Vercel cron) trigger:
//          requires auth (Bearer CRON_SECRET — sent automatically
//          by Vercel cron — or x-viox-secret) and ALWAYS runs
//          dryRun — a scheduled GET can never send messages.
//   POST { automation: 'birthday' | 'winback', dryRun? }
//     → secret-gated (x-viox-secret === VOICE_WEBHOOK_SECRET,
//       same gate as /api/voice/reservation and /api/sms/send;
//       Authorization: Bearer <CRON_SECRET> also accepted).
//       dryRun composes and returns previews without sending;
//       live mode only ever delivers to the test-user allowlist
//       (standing rule — fixture guests are never contacted) and
//       logs through sms_log/email_log via the workflow libs.
//       Returns { ok, automation, dryRun, audience, sent,
//                 skippedByAllowlist, failed, previews }.
// ============================================================

import {
  RUNNABLE_AUTOMATIONS,
  getAutomationMeta,
  isRunnableAutomation,
  runAutomation,
} from '@/app/automations/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * True when the request carries a valid secret: x-viox-secret against
 * VOICE_WEBHOOK_SECRET or CRON_SECRET, or Authorization: Bearer against
 * CRON_SECRET (Vercel cron sends that header automatically once the
 * CRON_SECRET env var exists on the project).
 */
function isAuthorized(req: Request): boolean {
  const voiceSecret = process.env.VOICE_WEBHOOK_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const header = req.headers.get('x-viox-secret') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (voiceSecret && header === voiceSecret) return true;
  if (cronSecret && (bearer === cronSecret || header === cronSecret)) return true;
  return false;
}

/**
 * GET — playbook catalog (no secret required), or, with
 * ?automation=<id>, the scheduled cron trigger: auth-gated and
 * ALWAYS dry-run so a scheduled GET can never send messages.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const automation = url.searchParams.get('automation');

  if (automation !== null) {
    if (!isAuthorized(req)) {
      return json({ ok: false, error: 'Unauthorized.' }, 401);
    }
    if (!isRunnableAutomation(automation)) {
      return json(
        { ok: false, error: `automation must be one of: ${RUNNABLE_AUTOMATIONS.join(', ')}.` },
        400,
      );
    }
    try {
      const result = await runAutomation(automation, { dryRun: true });
      return json({ ...result, scheduled: true });
    } catch (err) {
      console.error('[automations] scheduled run error', err);
      return json({ ok: false, error: 'Automation run failed.' }, 500);
    }
  }

  const automations = await getAutomationMeta();
  return json({ ok: true, automations });
}

export async function POST(req: Request): Promise<Response> {
  // ---- auth (same gate as /api/voice/reservation, + cron bearer) ----
  if (!isAuthorized(req)) {
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

  const automation = b.automation;
  if (!isRunnableAutomation(automation)) {
    return json(
      { ok: false, error: `automation must be one of: ${RUNNABLE_AUTOMATIONS.join(', ')}.` },
      400,
    );
  }
  const dryRun = b.dryRun === true || b.dryRun === 'true' || b.dryRun === 1;

  try {
    const result = await runAutomation(automation, { dryRun });
    return json(result);
  } catch (err) {
    console.error('[automations] run error', err);
    return json({ ok: false, error: 'Automation run failed.' }, 500);
  }
}
