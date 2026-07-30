// VioX CRM copilot — same shared handler as the OS app,
// bound to the tenant repository (demo fixtures until Supabase).
import { createCopilotRouteHandler } from '@viox/agents';
import { getRepository } from '@viox/db';

export const runtime = 'nodejs';

export const POST = createCopilotRouteHandler(() => getRepository());
