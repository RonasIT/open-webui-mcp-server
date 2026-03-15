import { handleHttpError, validateKnowledgeBaseId, validateQuery } from './api-client.js';
import type { ApiClient } from './api-client.js';

export type ToolContent = Array<{ type: 'text'; text: string }>;

export type HttpErrorContext = {
  connectionId: string;
  cleanup: (id: string) => Promise<void>;
};

export async function listKnowledgeBases(client: ApiClient, ctx: HttpErrorContext): Promise<ToolContent> {
  const res = await client.get('/knowledge/');

  if (!res.ok) {
    if (res.status === 401) await handleHttpError(res, ctx.connectionId, ctx.cleanup);

    return [{ type: 'text', text: 'Failed to list knowledge bases.' }];
  }
  const data = (await res.json()) as unknown;
  let kbList: Array<unknown> = [];
  if (Array.isArray(data)) kbList = data;
  else if (data && typeof data === 'object' && 'items' in data) kbList = (data as { items: Array<unknown> }).items;
  else if (data && typeof data === 'object') kbList = Object.values(data as Record<string, unknown>);
  if (kbList.length === 0) return [{ type: 'text', text: 'No knowledge bases found.' }];
  const kbDetails: Array<{ id: string; name: string; description?: string; created_at?: string }> = [];

  for (const kb of kbList) {
    if (typeof kb === 'string') {
      const kbId = kb.trim();
      if (!kbId) continue;

      try {
        const r = await client.get(`/knowledge/${kbId}`);
        if (r.ok) kbDetails.push((await r.json()) as { id: string; name: string });
        else kbDetails.push({ id: kbId, name: 'Unknown' });
      } catch {
        kbDetails.push({ id: kbId, name: 'Unknown' });
      }
    } else if (kb && typeof kb === 'object' && 'id' in kb) {
      kbDetails.push(kb as { id: string; name: string; description?: string; created_at?: string });
    }
  }
  if (kbDetails.length === 0) return [{ type: 'text', text: 'No knowledge bases found.' }];
  let resultText = `Found ${kbDetails.length} knowledge base(s):\n\n`;

  for (const kb of kbDetails) {
    const kbId = kb.id ?? 'Unknown';
    const kbName = kb.name ?? 'Unknown';
    let fileCount = 0;

    try {
      const fr = await client.get(`/knowledge/${kbId}/files?page=1`);

      if (fr.ok) {
        const fd = (await fr.json()) as { total?: number; items?: Array<unknown> };
        fileCount = fd.total ?? fd.items?.length ?? 0;
      }
    } catch {
      // ignore
    }
    resultText += `- ${kbName} (ID: ${kbId})\n`;
    if (kb.description) resultText += `  Description: ${kb.description}\n`;
    resultText += `  Files: ${fileCount}\n`;
    if (kb.created_at) resultText += `  Created: ${kb.created_at}\n`;
    resultText += '\n';
  }

  return [{ type: 'text', text: resultText }];
}

export type SearchArgs = { knowledge_base_id: string; query: string; k?: number };

export async function searchKnowledgeBase(
  client: ApiClient,
  args: SearchArgs,
  ctx: HttpErrorContext,
): Promise<ToolContent> {
  const { knowledge_base_id: kbId, query, k = 5 } = args;
  if (!kbId || !query) throw new Error('knowledge_base_id and query are required');
  validateKnowledgeBaseId(kbId);
  validateQuery(query);
  if (typeof k !== 'number' || k < 1 || k > 100) throw new Error('k must be an integer between 1 and 100');
  const res = await client.post('/retrieval/query/collection', {
    collection_names: [kbId],
    query,
    k,
  });
  if (!res.ok) await handleHttpError(res, ctx.connectionId, ctx.cleanup, kbId);
  const result = (await res.json()) as {
    documents?: Array<Array<string>>;
    metadatas?: Array<Array<unknown>>;
    distances?: Array<Array<number>>;
  };
  if (!result.documents?.[0]?.length) return [{ type: 'text', text: `No results found for query: ${query}` }];
  const documents = result.documents[0];
  const metadatas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  let text = `Found ${documents.length} results for query: '${query}'\n\n`;

  for (let i = 0; i < documents.length; i++) {
    text += `--- Result ${i + 1} ---\n`;
    if (distances[i] != null) text += `Relevance Score: ${distances[i]!.toFixed(4)}\n`;
    const meta = metadatas[i] as Record<string, unknown> | undefined;
    if (meta?.name) text += `Source: ${String(meta.name)}\n`;
    if (meta?.file_id) text += `File ID: ${String(meta.file_id)}\n`;
    text += `\n${documents[i]}\n\n`;
  }

  return [{ type: 'text', text }];
}

export type GetInfoArgs = { knowledge_base_id: string };

export async function getKnowledgeBaseInfo(
  client: ApiClient,
  args: GetInfoArgs,
  ctx: HttpErrorContext,
): Promise<ToolContent> {
  const kbId = args.knowledge_base_id;
  if (!kbId) throw new Error('knowledge_base_id is required');
  validateKnowledgeBaseId(kbId);
  const res = await client.get(`/knowledge/${kbId}`);
  if (!res.ok) await handleHttpError(res, ctx.connectionId, ctx.cleanup, kbId);
  const kbData = (await res.json()) as Record<string, unknown>;

  try {
    const fr = await client.get(`/knowledge/${kbId}/files?page=1`);

    if (fr.ok) {
      const fd = (await fr.json()) as { items?: Array<unknown>; total?: number };
      kbData['files'] = fd.items ?? [];
      kbData['file_count'] = fd.total ?? fd.items?.length ?? 0;
    }
  } catch {
    kbData['files'] = [];
    kbData['file_count'] = 0;
  }

  return [{ type: 'text', text: JSON.stringify(kbData, null, 2) }];
}
