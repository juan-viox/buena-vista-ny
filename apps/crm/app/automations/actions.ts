'use server';

// ============================================================
// app/automations/actions.ts — server action behind the "Run
// now" button. Same engine the secret-gated API route uses; the
// dashboard path skips the header secret the way /api/waitlist
// does (same-origin CRM UI — TODO(auth): session/role gate
// before exposing beyond the UI). Live sends are still fenced
// to the test-user allowlist inside runAutomation, so a click
// here can never contact a fixture guest.
// ============================================================

import { isRunnableAutomation, runAutomation, type AutomationRunResult } from './engine';

export interface RunNowResult {
  ok: boolean;
  error?: string;
  result?: AutomationRunResult;
}

export async function runAutomationNow(automation: string, dryRun: boolean): Promise<RunNowResult> {
  if (!isRunnableAutomation(automation)) {
    return { ok: false, error: `"${automation}" cannot be run on demand.` };
  }
  try {
    const result = await runAutomation(automation, { dryRun });
    return { ok: true, result };
  } catch (err) {
    console.error('[automations] run-now error', err);
    return { ok: false, error: 'Automation run failed — check server logs.' };
  }
}
