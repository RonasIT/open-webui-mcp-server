import { describe, it, expect } from 'vitest';
import { KnowledgeServer } from '../../src/server.js';
import { getKnowledgeBaseInfo, listKnowledgeBases, searchKnowledgeBase } from '../../src/tool-handlers.js';
import {
  createE2eServer,
  expectTextContent,
  hasE2eEnv,
  listKnowledgeBaseIds,
  OPEN_WEBUI_API_TOKEN,
  OPEN_WEBUI_API_URL,
  parseKnowledgeBaseIds,
  withE2eSession,
} from './helpers.js';

describe.skipIf(!hasE2eEnv)('e2e: Open WebUI Knowledge API', () => {
  describe('connection management', () => {
    it('gets client for connection and cleans up', async () => {
      await withE2eSession(async ({ server, connectionId }) => {
        expect(server.connectionCount).toBeGreaterThanOrEqual(1);
        expect(server.connectionTokens.has(connectionId)).toBe(true);
      });
    });

    it('reuses same client for same connection id', async () => {
      const server = createE2eServer();
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);

      try {
        const client1 = await server.getClientForConnection(connectionId);
        const client2 = await server.getClientForConnection(connectionId);
        expect(client1).toBe(client2);
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });
  });

  describe('list_knowledge_bases', () => {
    it('lists knowledge bases with structured output', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        const text = expectTextContent(await listKnowledgeBases(client, ctx));

        if (text.includes('No knowledge bases found')) return;

        expect(text).toMatch(/Found \d+ knowledge base\(s\):/);
        const kbIds = parseKnowledgeBaseIds(text);
        expect(kbIds.length).toBeGreaterThan(0);
        expect(kbIds.every((id) => /^[a-zA-Z0-9_-]+$/.test(id))).toBe(true);
        expect(text).toMatch(/Files: \d+/);
      });
    });
  });

  describe('get_knowledge_base_info', () => {
    it('requires knowledge_base_id', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(getKnowledgeBaseInfo(client, {} as { knowledge_base_id: string }, ctx)).rejects.toThrow(
          'knowledge_base_id is required',
        );
      });
    });

    it('rejects invalid knowledge_base_id before calling API', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(getKnowledgeBaseInfo(client, { knowledge_base_id: 'invalid id!' }, ctx)).rejects.toThrow(
          'invalid characters',
        );
      });
    });

    it('returns error for non-existent knowledge base', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(
          getKnowledgeBaseInfo(client, { knowledge_base_id: 'non-existent-kb-id-12345' }, ctx),
        ).rejects.toThrow(/not found|Authentication/);
      });
    });

    it('returns JSON info for an existing knowledge base', async () => {
      const kbIds = await listKnowledgeBaseIds();
      expect(kbIds.length).toBeGreaterThan(0);

      await withE2eSession(async ({ client, ctx }) => {
        const text = expectTextContent(await getKnowledgeBaseInfo(client, { knowledge_base_id: kbIds[0]! }, ctx));
        const info = JSON.parse(text) as {
          id: string;
          name: string;
          file_count: number;
          files: Array<{ filename?: string }>;
        };

        expect(info.id).toBe(kbIds[0]);
        expect(typeof info.name).toBe('string');
        expect(info.name.length).toBeGreaterThan(0);
        expect(typeof info.file_count).toBe('number');
        expect(Array.isArray(info.files)).toBe(true);
      });
    });
  });

  describe('search_knowledge_base', () => {
    it('requires knowledge_base_id and query', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(
          searchKnowledgeBase(client, {} as { knowledge_base_id: string; query: string }, ctx),
        ).rejects.toThrow('knowledge_base_id and query are required');
        await expect(
          searchKnowledgeBase(
            client,
            { knowledge_base_id: 'kb-1' } as { knowledge_base_id: string; query: string },
            ctx,
          ),
        ).rejects.toThrow('knowledge_base_id and query are required');
      });
    });

    it('rejects invalid k values before calling API', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(
          searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: 'test', k: 0 }, ctx),
        ).rejects.toThrow('k must be an integer between 1 and 100');
        await expect(
          searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: 'test', k: 101 }, ctx),
        ).rejects.toThrow('k must be an integer between 1 and 100');
      });
    });

    it('rejects invalid knowledge_base_id and empty query before calling API', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        await expect(searchKnowledgeBase(client, { knowledge_base_id: 'bad id!', query: 'test' }, ctx)).rejects.toThrow(
          'invalid characters',
        );
        await expect(searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: '   ' }, ctx)).rejects.toThrow(
          'query must be a non-empty string',
        );
      });
    });

    it('handles non-existent knowledge base id', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        const outcome = await searchKnowledgeBase(
          client,
          { knowledge_base_id: 'non-existent-kb-id-12345', query: 'test', k: 3 },
          ctx,
        ).catch((error: Error) => error);

        if (outcome instanceof Error) {
          expect(outcome.message).toMatch(/not found|Authentication|Semantic search failed/);

          return;
        }

        expect(expectTextContent(outcome)).toContain('No results found for query: test');
      });
    });

    it('searches an existing knowledge base', async () => {
      const kbIds = await listKnowledgeBaseIds();
      expect(kbIds.length).toBeGreaterThan(0);

      await withE2eSession(async ({ client, ctx }) => {
        const outcome = await searchKnowledgeBase(
          client,
          { knowledge_base_id: kbIds[0]!, query: 'architecture', k: 3 },
          ctx,
        ).catch((error: Error) => error);

        if (outcome instanceof Error) {
          expect(outcome.message).toMatch(/not found|Authentication|Semantic search failed/);

          return;
        }

        expect(expectTextContent(outcome)).toMatch(/Found \d+ results for query|No results found for query/);
      });
    });
  });

  describe('authentication', () => {
    it('invalid token fails with auth error', async () => {
      const badServer = new KnowledgeServer({
        apiBaseUrl: OPEN_WEBUI_API_URL!,
        defaultApiToken: 'sk-invalid-token-12345',
      });
      const connectionId = badServer.getConnectionId();
      badServer.connectionTokens.set(connectionId, 'sk-invalid-token-12345');
      const client = await badServer.getClientForConnection(connectionId);

      try {
        await expect(
          listKnowledgeBases(client, {
            connectionId,
            cleanup: (id) => badServer.cleanupConnection(id),
          }),
        ).rejects.toThrow('Authentication failed');
      } finally {
        await badServer.cleanupConnection(connectionId);
      }
    });

    it('missing token throws when getting client', async () => {
      const noTokenServer = new KnowledgeServer({
        apiBaseUrl: OPEN_WEBUI_API_URL!,
      });
      const saved = process.env['OPEN_WEBUI_API_TOKEN'];
      delete process.env['OPEN_WEBUI_API_TOKEN'];
      const connectionId = noTokenServer.getConnectionId();

      try {
        await expect(noTokenServer.getClientForConnection(connectionId)).rejects.toThrow('No API token found');
      } finally {
        if (saved !== undefined) process.env['OPEN_WEBUI_API_TOKEN'] = saved;
      }
    });
  });

  describe('full workflow', () => {
    it('lists, loads info, and searches the same knowledge base', async () => {
      await withE2eSession(async ({ client, ctx }) => {
        const listText = expectTextContent(await listKnowledgeBases(client, ctx));
        const kbIds = parseKnowledgeBaseIds(listText);
        expect(kbIds.length).toBeGreaterThan(0);

        const kbId = kbIds[0]!;
        const infoText = expectTextContent(await getKnowledgeBaseInfo(client, { knowledge_base_id: kbId }, ctx));
        const info = JSON.parse(infoText) as { id: string; name: string };
        expect(info.id).toBe(kbId);

        const searchOutcome = await searchKnowledgeBase(
          client,
          { knowledge_base_id: kbId, query: 'test', k: 2 },
          ctx,
        ).catch((error: Error) => error);

        if (searchOutcome instanceof Error) {
          expect(searchOutcome.message).toMatch(/not found|Authentication|Semantic search failed/);

          return;
        }

        expect(expectTextContent(searchOutcome)).toMatch(/Found \d+ results for query|No results found for query/);
      });
    });
  });
});
