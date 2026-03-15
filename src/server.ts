import { AsyncLocalStorage } from 'node:async_hooks';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient, handleHttpError, validateKnowledgeBaseId, validateToken } from './api-client.js';
import { CONNECTION_ID_PREFIX_STDIO } from './constants.js';
import { getKnowledgeBaseInfo, listKnowledgeBases, searchKnowledgeBase } from './tool-handlers.js';
import type { ApiClient } from './api-client.js';

const requestContext = new AsyncLocalStorage<{
  connectionId: string;
  token?: string | null;
}>();

export function getConnectionId(): string {
  const ctx = requestContext.getStore();
  if (ctx?.connectionId) return ctx.connectionId;

  return `${CONNECTION_ID_PREFIX_STDIO}${process.pid}`;
}

export function runWithContext<T>(
  context: { connectionId: string; token?: string | null },
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(requestContext.run(context, () => fn()));
}

export interface KnowledgeServerOptions {
  apiBaseUrl: string;
  defaultApiToken?: string | null;
  httpMode?: boolean;
}

export class KnowledgeServer {
  readonly apiBaseUrl: string;

  readonly defaultApiToken: string | null;

  readonly httpMode: boolean;

  readonly connectionTokens = new Map<string, string>();

  private readonly connectionClients = new Map<string, ApiClient>();

  private _defaultMcpServer: McpServer | null = null;

  constructor(options: KnowledgeServerOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
    this.defaultApiToken = options.defaultApiToken ?? null;
    this.httpMode = options.httpMode ?? false;
  }

  createMcpServer(): McpServer {
    const mcpServer = new McpServer({ name: 'open-webui-knowledge-http', version: '1.0.0' }, {});
    this.registerHandlers(mcpServer);

    return mcpServer;
  }

  get mcpServer(): McpServer {
    if (!this._defaultMcpServer) this._defaultMcpServer = this.createMcpServer();

    return this._defaultMcpServer;
  }

  getConnectionId(): string {
    return getConnectionId();
  }

  getTokenForConnection(connectionId: string): string | null {
    const cached = this.connectionTokens.get(connectionId);
    if (cached) return cached;
    const ctx = requestContext.getStore();

    if (this.httpMode && ctx?.token) {
      if (validateToken(ctx.token)) {
        this.connectionTokens.set(connectionId, ctx.token);

        return ctx.token;
      }
    }
    const envToken = process.env['OPEN_WEBUI_API_TOKEN'];

    if (envToken && validateToken(envToken)) {
      this.connectionTokens.set(connectionId, envToken);

      return envToken;
    }

    if (this.defaultApiToken) {
      this.connectionTokens.set(connectionId, this.defaultApiToken);

      return this.defaultApiToken;
    }

    return null;
  }

  async getClientForConnection(connectionId: string): Promise<ApiClient> {
    const existing = this.connectionClients.get(connectionId);
    if (existing) return existing;
    const token = this.getTokenForConnection(connectionId);
    if (!token)
      throw new Error(
        `No API token found for connection ${connectionId.slice(0, 8)}... ` +
          'Please set OPEN_WEBUI_API_TOKEN environment variable or provide Authorization header with Bearer token.',
      );
    const client = createApiClient(this.apiBaseUrl, token);
    this.connectionClients.set(connectionId, client);

    return client;
  }

  async cleanupConnection(connectionId: string): Promise<void> {
    this.connectionClients.delete(connectionId);
    this.connectionTokens.delete(connectionId);
  }

  private registerHandlers(mcpServer: McpServer): void {
    mcpServer.registerTool(
      'search_knowledge_base',
      {
        description: 'Search a knowledge base using semantic search via Open WebUI API',
        inputSchema: z.object({
          knowledge_base_id: z.string().describe('The ID of the knowledge base to search'),
          query: z.string().describe('The search query'),
          k: z.number().int()
.min(1)
.max(100)
.default(5)
.describe('Number of results to return (default: 5)'),
        }),
      },
      async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
        const connectionId = getConnectionId();
        let client: ApiClient;

        try {
          client = await this.getClientForConnection(connectionId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);

          return {
            content: [
              {
                type: 'text',
                text: `Authentication Error: ${msg}\n\nTo use this MCP server, set the OPEN_WEBUI_API_TOKEN environment variable with your Open WebUI API token (starts with 'sk-').`,
              },
            ],
          };
        }
        const content = await searchKnowledgeBase(
          client,
          args as { knowledge_base_id: string; query: string; k?: number },
          { connectionId, cleanup: (id) => this.cleanupConnection(id) },
        );

        return { content };
      },
    );

    mcpServer.registerTool(
      'list_knowledge_bases',
      {
        description: 'List all knowledge bases accessible via Open WebUI API',
        inputSchema: z.object({}),
      },
      async (): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
        const connectionId = getConnectionId();
        let client: ApiClient;

        try {
          client = await this.getClientForConnection(connectionId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);

          return {
            content: [
              {
                type: 'text',
                text: `Authentication Error: ${msg}\n\nTo use this MCP server, set the OPEN_WEBUI_API_TOKEN environment variable with your Open WebUI API token (starts with 'sk-').`,
              },
            ],
          };
        }
        const content = await listKnowledgeBases(client, {
          connectionId,
          cleanup: (id) => this.cleanupConnection(id),
        });

        return { content };
      },
    );

    mcpServer.registerTool(
      'get_knowledge_base_info',
      {
        description: 'Get detailed information about a knowledge base via Open WebUI API',
        inputSchema: z.object({
          knowledge_base_id: z.string().describe('The ID of the knowledge base'),
        }),
      },
      async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
        const connectionId = getConnectionId();
        let client: ApiClient;

        try {
          client = await this.getClientForConnection(connectionId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);

          return {
            content: [
              {
                type: 'text',
                text: `Authentication Error: ${msg}\n\nTo use this MCP server, set the OPEN_WEBUI_API_TOKEN environment variable with your Open WebUI API token (starts with 'sk-').`,
              },
            ],
          };
        }
        const content = await getKnowledgeBaseInfo(client, args as { knowledge_base_id: string }, {
          connectionId,
          cleanup: (id) => this.cleanupConnection(id),
        });

        return { content };
      },
    );

    mcpServer.registerResource(
      'knowledge-bases',
      new ResourceTemplate('knowledge://{kbId}', {
        list: async () => {
          const connectionId = getConnectionId();

          try {
            const client = await this.getClientForConnection(connectionId);
            const res = await client.get('/knowledge/');
            if (!res.ok) return { resources: [] };
            const data = (await res.json()) as unknown;
            let kbList: Array<unknown> = [];
            if (Array.isArray(data)) kbList = data;
            else if (data && typeof data === 'object' && 'items' in data)
              kbList = (data as { items: Array<unknown> }).items;
            else if (data && typeof data === 'object') kbList = Object.values(data as Record<string, unknown>);
            const resources: Array<{ uri: string; name: string; description?: string }> = [];

            for (const kb of kbList) {
              if (typeof kb === 'string') {
                const id = kb.trim();
                if (id)
                  resources.push({
                    uri: `knowledge://${id}`,
                    name: 'Unknown',
                    description: `Knowledge base: ${id}`,
                  });
              } else if (kb && typeof kb === 'object' && 'id' in kb) {
                const o = kb as { id: string; name?: string; description?: string };
                const id = o.id;
                if (id && id !== 'Unknown')
                  resources.push({
                    uri: `knowledge://${id}`,
                    name: o.name ?? 'Unknown',
                    description: o.description ?? `Knowledge base: ${o.name ?? id}`,
                  });
              }
            }

            return { resources };
          } catch {
            return { resources: [] };
          }
        },
      }),
      {
        title: 'Knowledge base',
        description: 'Knowledge base content',
        mimeType: 'application/json',
      },
      async (uri, variables): Promise<{ contents: Array<{ uri: string; text: string }> }> => {
        const connectionId = getConnectionId();
        const client = await this.getClientForConnection(connectionId);
        const kbIdRaw = variables['kbId'] ?? uri.pathname.replace(/^\/+/, '').replace('knowledge://', '');
        const kbId = Array.isArray(kbIdRaw) ? kbIdRaw[0] : kbIdRaw;
        if (typeof kbId !== 'string') throw new Error('Invalid knowledge base ID');
        validateKnowledgeBaseId(kbId);
        const res = await client.get(`/knowledge/${kbId}`);
        if (!res.ok) await handleHttpError(res, connectionId, (id) => this.cleanupConnection(id), kbId);
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

        return {
          contents: [{ uri: uri.href, text: JSON.stringify(kbData, null, 2) }],
        };
      },
    );
  }

  get connectionCount(): number {
    return this.connectionClients.size;
  }
}
