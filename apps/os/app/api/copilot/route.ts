// VioX Copilot endpoint — tool-using agent over the tenant repository.
// JSON in: { messages, persona? } · JSON out: { reply, toolsUsed, demo }.
import { getRepository } from '@viox/db';
import { createCopilotRouteHandler } from '@viox/agents';

export const POST = createCopilotRouteHandler(() => getRepository());
