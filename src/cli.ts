#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KnowledgeServer } from './server.js';
import { runHttpServer } from './transport-http.js';

async function main(): Promise<void> {
  const apiUrl = process.env['OPEN_WEBUI_API_URL'] ?? 'https://your-open-webui-instance.com/api/v1';
  const apiToken = process.env['OPEN_WEBUI_API_TOKEN'] ?? null;
  const transport = (process.env['MCP_TRANSPORT'] ?? 'stdio').toLowerCase();
  const httpHost = process.env['MCP_HTTP_HOST'] ?? '0.0.0.0';
  const httpPort = Number(process.env['MCP_HTTP_PORT'] ?? '8001');

  const server = new KnowledgeServer({
    apiBaseUrl: apiUrl,
    defaultApiToken: apiToken,
    httpMode: transport === 'http',
  });

  if (transport === 'http') {
    console.info('Starting Knowledge MCP Server in HTTP mode');
    console.info(`Connecting to Open WebUI API: ${apiUrl}`);

    if (!apiToken) {
      console.info('Note: No default API token provided.');
      console.info('Each client should provide their token via Authorization header.');
    }
    console.info('\nServer will be available at:');
    console.info(`  MCP Endpoint: http://${httpHost}:${httpPort}/mcp`);
    console.info(`  Health Check: http://${httpHost}:${httpPort}/health`);
    await runHttpServer(server, httpHost, httpPort);
  } else {
    console.info('Starting Knowledge MCP Server in stdio mode');
    console.info(`Connecting to Open WebUI API: ${apiUrl}`);

    if (!apiToken) {
      console.info('Note: No default API token provided.');
      console.info('Set OPEN_WEBUI_API_TOKEN environment variable.');
    }
    const stdioTransport = new StdioServerTransport();
    await server.mcpServer.connect(stdioTransport);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
