import { randomUUID, createHash } from 'node:crypto';
import { serve } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateToken } from './api-client.js';
import {
  AUTHORIZATION_HEADER,
  BEARER_PREFIX,
  CONNECTION_ID_PREFIX_HTTP,
  DEFAULT_RATE_LIMIT_HEALTH,
  DEFAULT_RATE_LIMIT_PER_IP,
  DEFAULT_RATE_LIMIT_PER_TOKEN,
  HTTP_STATUS_INTERNAL_ERROR,
  HTTP_STATUS_TOO_LARGE,
  MAX_REQUEST_SIZE,
  SESSION_ID_HEADERS,
  TOKEN_HASH_LENGTH,
} from './constants.js';
import { runWithContext } from './server.js';
import type { KnowledgeServer } from './server.js';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function parseRateLimit(value: string): { windowMs: number; max: number } {
  const match = value.trim().match(/^(\d+)\/(minute|hour|day)$/);
  if (!match) return { windowMs: 60_000, max: 1000 };
  const num = Number(match[1]);
  const unit = match[2];
  const windowMs = unit === 'minute' ? 60_000 : unit === 'hour' ? 3_600_000 : 86_400_000;

  return { windowMs, max: num };
}

function checkRateLimit(key: string, limitConfig: string): boolean {
  const { windowMs, max } = parseRateLimit(limitConfig);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });

    return true;
  }

  if (now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });

    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;

  return true;
}

export function createHttpApp(server: KnowledgeServer): Hono {
  const app = new Hono();
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

  const _rateLimitPerIp = process.env['MCP_RATE_LIMIT_PER_IP'] ?? DEFAULT_RATE_LIMIT_PER_IP;
  const rateLimitPerToken = process.env['MCP_RATE_LIMIT_PER_TOKEN'] ?? DEFAULT_RATE_LIMIT_PER_TOKEN;
  const rateLimitHealth = process.env['MCP_RATE_LIMIT_HEALTH'] ?? DEFAULT_RATE_LIMIT_HEALTH;
  const corsOrigins = (process.env['MCP_CORS_ORIGINS'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (corsOrigins.length > 0) {
    app.use(
      '*',
      cors({
        origin: corsOrigins,
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Authorization', 'Content-Type', 'mcp-session-id', 'x-session-id'],
        credentials: true,
      }),
    );
  }

  function getSessionId(req: Request): string {
    const h = req.headers;

    return (h.get(SESSION_ID_HEADERS[0]) ?? h.get(SESSION_ID_HEADERS[1]) ?? randomUUID()) as string;
  }

  function getToken(req: Request): string | null {
    const auth = req.headers.get(AUTHORIZATION_HEADER);
    if (!auth?.startsWith(BEARER_PREFIX)) return null;
    const token = auth.slice(BEARER_PREFIX.length).trim();

    return validateToken(token) ? token : null;
  }

  function getRateLimitKey(req: Request): string {
    const token = getToken(req);

    if (token) {
      const hash = createHash('sha256').update(token)
.digest('hex')
.slice(0, TOKEN_HASH_LENGTH);

      return `token:${hash}`;
    }
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';

    return `ip:${ip}`;
  }

  app.get('/', (c) => c.json({
      service: 'Open WebUI Knowledge MCP Server',
      version: '1.0.0',
      transport: 'http',
      endpoints: { mcp: '/mcp', health: '/health' },
      usage: {
        mcp_endpoint: `POST ${new URL(c.req.url).origin}/mcp`,
        headers: {
          Authorization: 'Bearer sk-your-token',
          'mcp-session-id': 'optional-session-id',
          'Content-Type': 'application/json',
        },
      },
    }),);

  app.get('/health', (c) => {
    const rawReq = c.req.raw;
    const key = `health:${getRateLimitKey(rawReq)}`;
    if (!checkRateLimit(key, rateLimitHealth)) return c.json({ error: 'Too many requests' }, 429);

    return c.json({
      status: 'ok',
      service: 'open-webui-knowledge-mcp',
      transport: 'http',
      connections: server.connectionCount,
    });
  });

  app.all('/mcp', async (c) => {
    const req = c.req.raw;
    const key = getRateLimitKey(req);
    if (!checkRateLimit(key, rateLimitPerToken)) return c.json({ error: 'Too many requests' }, 429);

    const contentLength = req.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_REQUEST_SIZE)
      return c.json({ error: 'Request body too large' }, HTTP_STATUS_TOO_LARGE);

    const sessionId = getSessionId(req);
    const token = getToken(req);
    const connectionId = `${CONNECTION_ID_PREFIX_HTTP}${sessionId}`;
    if (token) server.connectionTokens.set(connectionId, token);

    let transport = transports.get(sessionId);

    if (!transport) {
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
        enableJsonResponse: false,
      });

      transport.onclose = () => {
        transports.delete(sessionId);
        server.cleanupConnection(connectionId);
      };
      const sessionMcpServer = server.createMcpServer();
      await sessionMcpServer.connect(transport);
      transports.set(sessionId, transport);
    }

    let parsedBody: unknown;

    try {
      if (req.method === 'POST') {
        const text = await req.text();
        if (text.length > MAX_REQUEST_SIZE) return c.json({ error: 'Request body too large' }, HTTP_STATUS_TOO_LARGE);
        parsedBody = text ? JSON.parse(text) : undefined;
      }
    } catch {
      parsedBody = undefined;
    }

    try {
      const webRequest = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'POST' && parsedBody != null ? JSON.stringify(parsedBody) : undefined,
      });
      const response = await runWithContext({ connectionId, token: token ?? null }, () => transport!.handleRequest(webRequest, { parsedBody }),);

      return response;
    } catch (e) {
      console.error('MCP request error:', e);

      return c.json({ error: 'Internal server error' }, HTTP_STATUS_INTERNAL_ERROR);
    }
  });

  return app;
}

export function runHttpServer(server: KnowledgeServer, host: string, port: number): Promise<never> {
  const app = createHttpApp(server);

  return new Promise(() => {
    serve(
      {
        fetch: app.fetch,
        hostname: host,
        port,
      },
      (info) => {
        console.info(`Knowledge MCP Server (HTTP) on http://${info.address}:${info.port}`);
        console.info(`MCP endpoint: http://${info.address}:${info.port}/mcp`);
        console.info(`Health: http://${info.address}:${info.port}/health`);
      },
    );
  });
}
