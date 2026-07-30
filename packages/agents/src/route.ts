// ============================================================
// @viox/agents — Next.js route handler factory for /api/copilot.
// Apps re-export:  export const POST = createCopilotRouteHandler(() => getRepository());
// ============================================================

import type { DataRepository } from '@viox/db';
import { runCopilot, type ChatMessage } from './copilot';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export interface CopilotRequestBody {
  messages?: ChatMessage[];
  persona?: string;
}

/**
 * Returns a POST handler both apps can re-export from
 * app/api/copilot/route.ts. JSON in ({messages, persona?}),
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

    try {
      const repo = await getRepo();
      const persona = typeof body.persona === 'string' ? body.persona : undefined;
      const result = await runCopilot({ messages, repo, persona });
      return json(result);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Copilot failed.' }, 500);
    }
  };
}
