// ============================================================
// @viox/agents — Next.js route handler factory for /api/copilot.
// Apps re-export:  export const POST = createCopilotRouteHandler(() => getRepository());
// ============================================================

import type { DataRepository } from '@viox/db';
import { runCopilot, type ChatMessage } from './copilot';
import { AGENTS, getAgent } from './registry';
import { resolveModel } from './models';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export interface CopilotRequestBody {
  messages?: ChatMessage[];
  persona?: string;
  /** Scope the run to one AI-team agent id from the registry (e.g. "mise", "fiesta"). */
  agentId?: string;
  /** Model id from the catalog (models.ts). Unknown ids resolve to the default model. */
  model?: string;
}

/**
 * Returns a POST handler both apps can re-export from
 * app/api/copilot/route.ts. JSON in ({messages, persona?, agentId?}),
 * JSON out ({reply, toolsUsed, demo}).
 */
export function createCopilotRouteHandler(getRepo: () => DataRepository | Promise<DataRepository>) {
  return async function POST(req: Request): Promise<Response> {
    let body: CopilotRequestBody;
    try {
      body = (await req.json()) as CopilotRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(
        (m): m is ChatMessage =>
          !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0,
      )
      .slice(-20); // keep the context window sane

    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Send at least one user message: { messages: [{ role: "user", content: "..." }] }' }, 400);
    }

    const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : undefined;
    if (agentId && !getAgent(agentId)) {
      return json({ error: `Unknown agent "${agentId}". Valid ids: ${AGENTS.map((a) => a.id).join(', ')}.` }, 400);
    }

    const model =
      typeof body.model === 'string' && body.model.trim() ? resolveModel(body.model.trim()).id : undefined;

    try {
      const repo = await getRepo();
      const persona = typeof body.persona === 'string' ? body.persona : undefined;
      const result = await runCopilot({ messages, repo, persona, agentId, model });
      return json(result);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Copilot failed.' }, 500);
    }
  };
}
