// ============================================================
// /api/automations/run — marketing-automation trigger.
//   GET  → { ok, automations: [...meta] } — playbook catalog with
//          live fixture audience counts. No secret required.
//   POST { automation: 'birthday' | 'winback', dryRun? }
//     → secret-gated (x-viox-secret === VOICE_WEBHOOK_SECRET,
//       same gate as /api/voice/reservation and /api/sms/send).
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

/** Playbook catalog — meta only, no guest PII beyond counts. */
export async function GET(): Promise<Response> {
  const automations = await getAutomationMeta();
  return json({ ok: true, automations });
}

export async function POST(req: Request): Promise<Response> {
  // ---- auth (same gate as /api/voice/reservation) ----
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
