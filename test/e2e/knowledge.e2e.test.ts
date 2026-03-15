import { resolve } from 'node:path';
import { config } from 'dotenv';
import { describe, it, expect, beforeAll } from 'vitest';
import { KnowledgeServer } from '../../src/server.js';
import { listKnowledgeBases, searchKnowledgeBase, getKnowledgeBaseInfo } from '../../src/tool-handlers.js';

config({ path: resolve(process.cwd(), '.env') });

const OPEN_WEBUI_API_URL = process.env['OPEN_WEBUI_API_URL'];
const OPEN_WEBUI_API_TOKEN = process.env['OPEN_WEBUI_API_TOKEN'];

const hasE2eEnv = Boolean(OPEN_WEBUI_API_URL && OPEN_WEBUI_API_TOKEN);

describe.skipIf(!hasE2eEnv)('e2e: Open WebUI Knowledge API', () => {
  let server: KnowledgeServer;
  const ctx = {
    connectionId: 'e2e_conn',
    cleanup: async (id: string) => {
      await server.cleanupConnection(id);
    },
  };

  beforeAll(() => {
    server = new KnowledgeServer({
      apiBaseUrl: OPEN_WEBUI_API_URL!,
      defaultApiToken: OPEN_WEBUI_API_TOKEN!,
    });
  });

  describe('connection management', () => {
    it('gets client for connection and cleans up', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);
      expect(client).toBeDefined();
      expect(server.connectionCount).toBeGreaterThanOrEqual(1);
      await server.cleanupConnection(connectionId);
      expect(server.connectionTokens.has(connectionId)).toBe(false);
    });

    it('reuses same client for same connection id', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client1 = await server.getClientForConnection(connectionId);
      const client2 = await server.getClientForConnection(connectionId);
      expect(client1).toBe(client2);
      await server.cleanupConnection(connectionId);
    });
  });

  describe('list_knowledge_bases', () => {
    it('lists knowledge bases from API', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
        const result = await listKnowledgeBases(client, {
          ...ctx,
          connectionId,
          cleanup: (id) => server.cleanupConnection(id),
        });
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('text');
        expect(typeof result[0]!.text).toBe('string');
        expect(
          result[0]!.text.toLowerCase().includes('knowledge base') ||
            result[0]!.text.toLowerCase().includes('no knowledge bases'),
        ).toBe(true);
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });
  });

  describe('search_knowledge_base', () => {
    it('requires knowledge_base_id and query', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
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
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });

    it('returns result or not-found for real API', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
        const result = await searchKnowledgeBase(
          client,
          { knowledge_base_id: 'test-kb-id', query: 'test query', k: 3 },
          { ...ctx, connectionId, cleanup: (id) => server.cleanupConnection(id) },
        ).catch((e) => e as Error);

        if (result instanceof Error) {
          expect(result.message.toLowerCase()).toMatch(/not found|authentication/);
        } else {
          expect(result).toHaveLength(1);
          expect(result[0]!.type).toBe('text');
        }
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });
  });

  describe('get_knowledge_base_info', () => {
    it('requires knowledge_base_id', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
        await expect(getKnowledgeBaseInfo(client, {} as { knowledge_base_id: string }, ctx)).rejects.toThrow(
          'knowledge_base_id is required',
        );
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });

    it('returns error for non-existent knowledge base', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
        await expect(
          getKnowledgeBaseInfo(
            client,
            { knowledge_base_id: 'non-existent-kb-id-12345' },
            { ...ctx, connectionId, cleanup: (id) => server.cleanupConnection(id) },
          ),
        ).rejects.toThrow(/not found|Authentication/);
      } finally {
        await server.cleanupConnection(connectionId);
      }
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
    it('list then optional get info and search without crashing', async () => {
      const connectionId = server.getConnectionId();
      server.connectionTokens.set(connectionId, OPEN_WEBUI_API_TOKEN!);
      const client = await server.getClientForConnection(connectionId);

      try {
        const listResult = await listKnowledgeBases(client, {
          connectionId,
          cleanup: (id) => server.cleanupConnection(id),
        });
        expect(listResult).toHaveLength(1);
        const listText = listResult[0]!.text;

        if (!listText.toLowerCase().includes('no knowledge bases')) {
          await getKnowledgeBaseInfo(
            client,
            { knowledge_base_id: 'test-kb' },
            { connectionId, cleanup: (id) => server.cleanupConnection(id) },
          ).catch(() => {});
        }
        await searchKnowledgeBase(
          client,
          { knowledge_base_id: 'test-kb', query: 'test' },
          { connectionId, cleanup: (id) => server.cleanupConnection(id) },
        ).catch(() => {});
      } finally {
        await server.cleanupConnection(connectionId);
      }
    });
  });
});
