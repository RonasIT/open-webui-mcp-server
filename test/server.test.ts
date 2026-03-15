import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONNECTION_ID_PREFIX_STDIO } from '../src/constants.js';
import { KnowledgeServer, getConnectionId, runWithContext } from '../src/server.js';

const MOCK_API_URL = 'https://test-api.example.com/api/v1';
const MOCK_TOKEN = 'sk-test-token-12345';

describe('getConnectionId', () => {
  it('returns stdio-style id when not in request context', () => {
    const id = getConnectionId();
    expect(id).toMatch(new RegExp(`^${CONNECTION_ID_PREFIX_STDIO}\\d+$`));
  });

  it('returns context connectionId when inside runWithContext', async () => {
    const result = await runWithContext({ connectionId: 'http_abc123', token: null }, () => getConnectionId());
    expect(result).toBe('http_abc123');
  });
});

describe('KnowledgeServer connection management', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env['OPEN_WEBUI_API_TOKEN'];
  });

  afterEach(() => {
    if (savedEnv !== undefined) process.env['OPEN_WEBUI_API_TOKEN'] = savedEnv;
    else delete process.env['OPEN_WEBUI_API_TOKEN'];
  });

  describe('getConnectionId', () => {
    it('returns stdio-style id when not in context', () => {
      const server = new KnowledgeServer({
        apiBaseUrl: MOCK_API_URL,
        defaultApiToken: MOCK_TOKEN,
      });
      const id = server.getConnectionId();
      expect(id).toMatch(new RegExp(`^${CONNECTION_ID_PREFIX_STDIO}\\d+$`));
    });
  });

  describe('getTokenForConnection', () => {
    it('returns and caches token from OPEN_WEBUI_API_TOKEN', () => {
      process.env['OPEN_WEBUI_API_TOKEN'] = MOCK_TOKEN;
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';
      const token = server.getTokenForConnection(connectionId);
      expect(token).toBe(MOCK_TOKEN);
      expect(server.connectionTokens.get(connectionId)).toBe(MOCK_TOKEN);
    });

    it('falls back to defaultApiToken when env not set', () => {
      delete process.env['OPEN_WEBUI_API_TOKEN'];
      const server = new KnowledgeServer({
        apiBaseUrl: MOCK_API_URL,
        defaultApiToken: MOCK_TOKEN,
      });
      const connectionId = 'test_conn';
      const token = server.getTokenForConnection(connectionId);
      expect(token).toBe(MOCK_TOKEN);
    });

    it('returns null when no token available', () => {
      delete process.env['OPEN_WEBUI_API_TOKEN'];
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';
      const token = server.getTokenForConnection(connectionId);
      expect(token).toBeNull();
    });

    it('uses context token in httpMode when provided', async () => {
      delete process.env['OPEN_WEBUI_API_TOKEN'];
      const server = new KnowledgeServer({
        apiBaseUrl: MOCK_API_URL,
        httpMode: true,
      });
      const connectionId = 'http_xyz';
      const token = await runWithContext({ connectionId, token: 'sk-ctx-token' }, () => server.getTokenForConnection(connectionId),);
      expect(token).toBe('sk-ctx-token');
      expect(server.connectionTokens.get(connectionId)).toBe('sk-ctx-token');
    });
  });

  describe('getClientForConnection', () => {
    it('creates and caches client when token is available', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', fetchMock);
      process.env['OPEN_WEBUI_API_TOKEN'] = MOCK_TOKEN;
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';

      const client = await server.getClientForConnection(connectionId);
      expect(client).toBeDefined();
      expect(client.get).toBeTypeOf('function');
      expect(client.post).toBeTypeOf('function');
      expect(server.connectionCount).toBe(1);

      vi.unstubAllGlobals();
    });

    it('reuses same client for same connection id', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', fetchMock);
      process.env['OPEN_WEBUI_API_TOKEN'] = MOCK_TOKEN;
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';

      const client1 = await server.getClientForConnection(connectionId);
      const client2 = await server.getClientForConnection(connectionId);
      expect(client1).toBe(client2);

      vi.unstubAllGlobals();
    });

    it('throws when no token available', async () => {
      delete process.env['OPEN_WEBUI_API_TOKEN'];
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';

      await expect(server.getClientForConnection(connectionId)).rejects.toThrow(/No API token found/);
    });
  });

  describe('cleanupConnection', () => {
    it('removes client and token for connection', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
      vi.stubGlobal('fetch', fetchMock);
      process.env['OPEN_WEBUI_API_TOKEN'] = MOCK_TOKEN;
      const server = new KnowledgeServer({ apiBaseUrl: MOCK_API_URL });
      const connectionId = 'test_conn';

      await server.getClientForConnection(connectionId);
      expect(server.connectionTokens.has(connectionId)).toBe(true);
      expect(server.connectionCount).toBe(1);

      await server.cleanupConnection(connectionId);
      expect(server.connectionTokens.has(connectionId)).toBe(false);
      expect(server.connectionCount).toBe(0);

      vi.unstubAllGlobals();
    });
  });
});
