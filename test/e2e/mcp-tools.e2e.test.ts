import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KnowledgeServer } from '../../src/server.js';
import {
  createE2eServer,
  getFirstKnowledgeBaseFile,
  getResourceText,
  getToolText,
  hasE2eEnv,
  listKnowledgeBaseIds,
} from './helpers.js';

describe.skipIf(!hasE2eEnv)('e2e: MCP tools via InMemoryTransport', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createE2eServer();
    const mcpServer = server.createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists registered MCP tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      'get_knowledge_base_file_content',
      'get_knowledge_base_info',
      'list_knowledge_bases',
      'search_knowledge_base',
    ]);
    expect(tools.find((tool) => tool.name === 'search_knowledge_base')?.inputSchema).toMatchObject({
      type: 'object',
      properties: expect.objectContaining({
        knowledge_base_id: expect.anything(),
        query: expect.anything(),
        k: expect.anything(),
      }),
    });
  });

  it('calls list_knowledge_bases through MCP', async () => {
    const result = await client.callTool({ name: 'list_knowledge_bases', arguments: {} });

    expect(result.content).toBeDefined();
    const text = getToolText(result);
    expect(text.toLowerCase()).toMatch(/found \d+ knowledge base|no knowledge bases found/);
  });

  it('calls get_knowledge_base_info for a real knowledge base', async () => {
    const kbIds = await listKnowledgeBaseIds();
    expect(kbIds.length).toBeGreaterThan(0);

    const result = await client.callTool({
      name: 'get_knowledge_base_info',
      arguments: { knowledge_base_id: kbIds[0] },
    });

    expect(result.isError).not.toBe(true);
    const text = getToolText(result);
    const info = JSON.parse(text) as { id: string; name: string; file_count?: number };
    expect(info.id).toBe(kbIds[0]);
    expect(typeof info.name).toBe('string');
    expect(info.name.length).toBeGreaterThan(0);
    expect(typeof info.file_count).toBe('number');
  });

  it('calls search_knowledge_base for a real knowledge base', async () => {
    const kbIds = await listKnowledgeBaseIds();
    expect(kbIds.length).toBeGreaterThan(0);

    const result = await client.callTool({
      name: 'search_knowledge_base',
      arguments: { knowledge_base_id: kbIds[0], query: 'architecture', k: 3 },
    });

    expect(result.content).toBeDefined();
    const text = getToolText(result);
    expect(text).toMatch(/Found \d+ results for query|No results found for query|Semantic search failed/);
  });

  it('lists and reads knowledge base resources', async () => {
    const kbIds = await listKnowledgeBaseIds();
    expect(kbIds.length).toBeGreaterThan(0);

    const resources = await client.listResources();
    expect(resources.resources.length).toBeGreaterThan(0);
    expect(resources.resources.some((resource) => resource.uri === `knowledge://${kbIds[0]}`)).toBe(true);

    const readResult = await client.readResource({ uri: `knowledge://${kbIds[0]}` });
    expect(readResult.contents).toHaveLength(1);
    const text = getResourceText(readResult.contents);
    const info = JSON.parse(text) as { id: string; name: string };
    expect(info.id).toBe(kbIds[0]);
    expect(typeof info.name).toBe('string');
  });

  it('calls get_knowledge_base_file_content for a real file', async () => {
    const { fileId } = await getFirstKnowledgeBaseFile();

    const result = await client.callTool({
      name: 'get_knowledge_base_file_content',
      arguments: { file_id: fileId },
    });

    expect(result.isError).not.toBe(true);
    const text = getToolText(result);
    expect(text).toContain(`File ID: ${fileId}`);
    expect(text.length).toBeGreaterThan(fileId.length + 20);
  });

  it('returns auth guidance when no token is configured', async () => {
    const noTokenServer = new KnowledgeServer({ apiBaseUrl: process.env['OPEN_WEBUI_API_URL']! });
    const saved = process.env['OPEN_WEBUI_API_TOKEN'];
    delete process.env['OPEN_WEBUI_API_TOKEN'];

    const mcpServer = noTokenServer.createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const authClient = new Client({ name: 'e2e-auth-client', version: '1.0.0' });

    try {
      await mcpServer.connect(serverTransport);
      await authClient.connect(clientTransport);

      const result = await authClient.callTool({ name: 'list_knowledge_bases', arguments: {} });
      const text = getToolText(result);

      expect(text).toContain('Authentication Error');
      expect(text).toContain('OPEN_WEBUI_API_TOKEN');
    } finally {
      if (saved !== undefined) process.env['OPEN_WEBUI_API_TOKEN'] = saved;
      await authClient.close();
      await mcpServer.close();
    }
  });
});
