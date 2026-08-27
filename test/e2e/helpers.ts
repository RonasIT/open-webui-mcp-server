import { resolve } from 'node:path';
import { config } from 'dotenv';
import { expect } from 'vitest';
import { KnowledgeServer } from '../../src/server.js';
import { listKnowledgeBases, getKnowledgeBaseInfo } from '../../src/tool-handlers.js';
import type { ApiClient } from '../../src/api-client.js';
import type { HttpErrorContext, ToolContent } from '../../src/tool-handlers.js';

config({ path: resolve(process.cwd(), '.env') });

export const OPEN_WEBUI_API_URL = process.env['OPEN_WEBUI_API_URL'];
export const OPEN_WEBUI_API_TOKEN = process.env['OPEN_WEBUI_API_TOKEN'];
export const hasE2eEnv = Boolean(OPEN_WEBUI_API_URL && OPEN_WEBUI_API_TOKEN);

const KB_ID_PATTERN = /\(ID: ([a-zA-Z0-9_-]+)\)/g;

export function parseKnowledgeBaseIds(listText: string): Array<string> {
  return [...listText.matchAll(KB_ID_PATTERN)].map((match) => match[1]!);
}

export function createE2eServer(): KnowledgeServer {
  return new KnowledgeServer({
    apiBaseUrl: OPEN_WEBUI_API_URL!,
    defaultApiToken: OPEN_WEBUI_API_TOKEN!,
  });
}

export type E2eSession = {
  server: KnowledgeServer;
  connectionId: string;
  client: ApiClient;
  ctx: HttpErrorContext;
};

export async function withE2eSession<T>(fn: (session: E2eSession) => Promise<T>): Promise<T> {
  const server = createE2eServer();
  const connectionId = server.getConnectionId();
  server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
  const client = await server.getClientForConnection(connectionId);
  const ctx: HttpErrorContext = {
    connectionId,
    cleanup: (id) => server.cleanupConnection(id),
  };

  try {
    return await fn({ server, connectionId, client, ctx });
  } finally {
    await server.cleanupConnection(connectionId);
  }
}

export async function listKnowledgeBaseIds(): Promise<Array<string>> {
  return withE2eSession(async ({ client, ctx }) => {
    const result = await listKnowledgeBases(client, ctx);

    return parseKnowledgeBaseIds(result[0]!.text);
  });
}

export type KnowledgeBaseFileRef = {
  kbId: string;
  fileId: string;
  filename?: string;
};

export async function getFirstKnowledgeBaseFile(): Promise<KnowledgeBaseFileRef> {
  const kbIds = await listKnowledgeBaseIds();
  expect(kbIds.length).toBeGreaterThan(0);

  return withE2eSession(async ({ client, ctx }) => {
    for (const kbId of kbIds) {
      const text = expectTextContent(await getKnowledgeBaseInfo(client, { knowledge_base_id: kbId }, ctx));
      const info = JSON.parse(text) as {
        files?: Array<{ id?: string; filename?: string }>;
      };
      const file = info.files?.find((item) => typeof item.id === 'string' && item.id.length > 0);

      if (file?.id) {
        return { kbId, fileId: file.id, filename: file.filename };
      }
    }

    throw new Error('No knowledge base files available for e2e testing');
  });
}

export function expectTextContent(result: ToolContent): string {
  expect(result).toHaveLength(1);
  expect(result[0]!.type).toBe('text');

  return result[0]!.text;
}

export function getToolText(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  expect(Array.isArray(content)).toBe(true);
  expect((content as Array<{ type: string; text?: string }>)[0]).toMatchObject({ type: 'text' });

  return (content as Array<{ type: 'text'; text: string }>)[0]!.text;
}

export function getResourceText(contents: Array<{ text?: string; blob?: string }>): string {
  const item = contents[0];
  expect(item?.text).toBeTypeOf('string');

  return item!.text!;
}
