import { describe, it, expect, vi } from 'vitest';
import { MAX_FILE_CONTENT_LENGTH } from '../src/constants.js';
import {
  listKnowledgeBases,
  searchKnowledgeBase,
  getKnowledgeBaseInfo,
  getKnowledgeBaseFile,
} from '../src/tool-handlers.js';
import type { ApiClient } from '../src/api-client.js';

function mockRes<T>(data: T, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

const noopCleanup = vi.fn().mockResolvedValue(undefined);
const ctx = { connectionId: 'test_conn', cleanup: noopCleanup };

describe('listKnowledgeBases', () => {
  it('returns formatted list when API returns array', async () => {
    const kbList = [
      { id: 'kb-1', name: 'Test KB 1', description: 'First', files: [], created_at: '2024-01-01T00:00:00Z' },
      { id: 'kb-2', name: 'Test KB 2', description: 'Second', files: [], created_at: '2024-01-02T00:00:00Z' },
    ];
    const client: ApiClient = {
      get: vi
        .fn()
        .mockResolvedValueOnce(mockRes(kbList))
        .mockResolvedValueOnce(mockRes({ total: 0 }))
        .mockResolvedValueOnce(mockRes({ total: 0 })),
      post: vi.fn(),
    };
    const result = await listKnowledgeBases(client, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('text');
    expect(result[0]!.text).toContain('Found 2 knowledge base(s)');
    expect(result[0]!.text).toContain('Test KB 1');
    expect(result[0]!.text).toContain('Test KB 2');
    expect(client.get).toHaveBeenCalledWith('/knowledge/');
  });

  it('returns empty message when API returns empty array', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes([])),
      post: vi.fn(),
    };
    const result = await listKnowledgeBases(client, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('No knowledge bases found');
  });

  it('throws on 401 and calls cleanup', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({}, false, 401)),
      post: vi.fn(),
    };
    await expect(listKnowledgeBases(client, ctx)).rejects.toThrow('Authentication failed');
    expect(noopCleanup).toHaveBeenCalledWith('test_conn');
  });

  it('normalizes items wrapper from API', async () => {
    const client: ApiClient = {
      get: vi
        .fn()
        .mockResolvedValueOnce(mockRes({ items: [{ id: 'kb-1', name: 'KB One' }] }))
        .mockResolvedValueOnce(mockRes({ total: 0 })),
      post: vi.fn(),
    };
    const result = await listKnowledgeBases(client, ctx);
    expect(result[0]!.text).toContain('Found 1 knowledge base(s)');
    expect(result[0]!.text).toContain('KB One');
  });
});

describe('searchKnowledgeBase', () => {
  it('returns formatted results on success', async () => {
    const apiResponse = {
      documents: [['Document 1 content', 'Document 2 content']],
      metadatas: [
        [
          { name: 'file1.txt', file_id: 'file-1' },
          { name: 'file2.txt', file_id: 'file-2' },
        ],
      ],
      distances: [[0.1, 0.2]],
    };
    const client: ApiClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(mockRes(apiResponse)),
    };
    const result = await searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: 'test query', k: 5 }, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('Found 2 results');
    expect(result[0]!.text).toContain('Document 1 content');
    expect(result[0]!.text).toContain('file1.txt');
    expect(client.post).toHaveBeenCalledWith('/retrieval/query/collection', {
      collection_names: ['kb-1'],
      query: 'test query',
      k: 5,
    });
  });

  it('returns no results message when documents empty', async () => {
    const client: ApiClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(mockRes({ documents: [[]], metadatas: [[]], distances: [[]] })),
    };
    const result = await searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: 'test query' }, ctx);
    expect(result[0]!.text).toContain('No results found');
  });

  it('throws when knowledge_base_id and query are required', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(searchKnowledgeBase(client, {} as { knowledge_base_id: string; query: string }, ctx)).rejects.toThrow(
      'knowledge_base_id and query are required',
    );
    await expect(
      searchKnowledgeBase(client, { knowledge_base_id: 'kb-1' } as { knowledge_base_id: string; query: string }, ctx),
    ).rejects.toThrow('knowledge_base_id and query are required');
  });

  it('throws on 401 and calls cleanup', async () => {
    const client: ApiClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(mockRes({}, false, 401)),
    };
    await expect(searchKnowledgeBase(client, { knowledge_base_id: 'kb-1', query: 'q' }, ctx)).rejects.toThrow(
      'Authentication failed',
    );
    expect(noopCleanup).toHaveBeenCalledWith('test_conn');
  });

  it('throws on 404 with knowledge base not found', async () => {
    const client: ApiClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(mockRes({}, false, 404)),
    };
    await expect(searchKnowledgeBase(client, { knowledge_base_id: 'kb-nonexistent', query: 'q' }, ctx)).rejects.toThrow(
      'Knowledge base not found',
    );
  });

  it('rejects invalid knowledge_base_id', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(searchKnowledgeBase(client, { knowledge_base_id: 'invalid id!', query: 'q' }, ctx)).rejects.toThrow(
      'invalid characters',
    );
  });
});

describe('getKnowledgeBaseInfo', () => {
  it('returns KB info and file count on success', async () => {
    const kbData = { id: 'kb-1', name: 'Test KB', description: 'Desc', created_at: '2024-01-01T00:00:00Z' };
    const filesData = { items: [{ id: 'file-1', name: 'test.txt' }], total: 1 };
    const client: ApiClient = {
      get: vi.fn().mockResolvedValueOnce(mockRes(kbData))
.mockResolvedValueOnce(mockRes(filesData)),
      post: vi.fn(),
    };
    const result = await getKnowledgeBaseInfo(client, { knowledge_base_id: 'kb-1' }, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('kb-1');
    expect(result[0]!.text).toContain('Test KB');
    expect(client.get).toHaveBeenCalledWith('/knowledge/kb-1');
    expect(client.get).toHaveBeenCalledWith('/knowledge/kb-1/files?page=1');
  });

  it('throws when knowledge_base_id is missing', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(getKnowledgeBaseInfo(client, {} as { knowledge_base_id: string }, ctx)).rejects.toThrow(
      'knowledge_base_id is required',
    );
  });

  it('throws on 404 and calls cleanup', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({}, false, 404)),
      post: vi.fn(),
    };
    await expect(getKnowledgeBaseInfo(client, { knowledge_base_id: 'kb-nonexistent' }, ctx)).rejects.toThrow(
      'Knowledge base not found',
    );
    expect(noopCleanup).toHaveBeenCalledWith('test_conn');
  });

  it('throws on 401', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({}, false, 401)),
      post: vi.fn(),
    };
    await expect(getKnowledgeBaseInfo(client, { knowledge_base_id: 'kb-1' }, ctx)).rejects.toThrow(
      'Authentication failed',
    );
  });
});

describe('getKnowledgeBaseFile', () => {
  it('returns file content with name and length', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(
        mockRes({
          id: 'file-1',
          filename: 'architecture.md',
          meta: { name: 'architecture.md' },
          data: { content: '# Architecture\n\nSome content.' },
        }),
      ),
      post: vi.fn(),
    };
    const result = await getKnowledgeBaseFile(client, { file_id: 'file-1' }, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain('File: architecture.md');
    expect(result[0]!.text).toContain('# Architecture');
    expect(client.get).toHaveBeenCalledWith('/files/file-1');
  });

  it('truncates content longer than max_length', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({ filename: 'big.md', data: { content: 'x'.repeat(50) } })),
      post: vi.fn(),
    };
    const result = await getKnowledgeBaseFile(client, { file_id: 'file-1', max_length: 10 }, ctx);
    expect(result[0]!.text).toContain('truncated to 10');
    expect(result[0]!.text).toContain('Increase max_length');
    const body = result[0]!.text.split('\n\n')[1];
    expect(body).toBe('x'.repeat(10));
  });

  it('reports the server limit when max_length is already at the ceiling', async () => {
    const client: ApiClient = {
      get: vi
        .fn()
        .mockResolvedValue(
          mockRes({ filename: 'huge.md', data: { content: 'x'.repeat(MAX_FILE_CONTENT_LENGTH + 25) } }),
        ),
      post: vi.fn(),
    };
    const result = await getKnowledgeBaseFile(client, { file_id: 'file-1' }, ctx);
    expect(result[0]!.text).toContain(`server limit of ${MAX_FILE_CONTENT_LENGTH} characters`);
    expect(result[0]!.text).toContain('25 characters were not returned');
    expect(result[0]!.text).not.toContain('Increase max_length');
  });

  it('reports files without extractable text', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({ filename: 'image.png', data: {} })),
      post: vi.fn(),
    };
    const result = await getKnowledgeBaseFile(client, { file_id: 'file-1' }, ctx);
    expect(result[0]!.text).toContain('no extractable text content');
  });

  it('throws when file_id is missing', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(getKnowledgeBaseFile(client, {} as { file_id: string }, ctx)).rejects.toThrow('file_id is required');
  });

  it('throws when file_id contains invalid characters', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(getKnowledgeBaseFile(client, { file_id: '../../etc/passwd' }, ctx)).rejects.toThrow(
      'file_id contains invalid characters',
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('throws when max_length is out of range or not an integer', async () => {
    const client: ApiClient = { get: vi.fn(), post: vi.fn() };
    await expect(getKnowledgeBaseFile(client, { file_id: 'file-1', max_length: 0 }, ctx)).rejects.toThrow(
      'max_length must be an integer',
    );
    await expect(getKnowledgeBaseFile(client, { file_id: 'file-1', max_length: 1.5 }, ctx)).rejects.toThrow(
      'max_length must be an integer',
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('throws on 404', async () => {
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({}, false, 404)),
      post: vi.fn(),
    };
    await expect(getKnowledgeBaseFile(client, { file_id: 'file-nonexistent' }, ctx)).rejects.toThrow(
      'File not found: file-nonexistent',
    );
  });

  it('throws on 401 and calls cleanup', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const client: ApiClient = {
      get: vi.fn().mockResolvedValue(mockRes({}, false, 401)),
      post: vi.fn(),
    };
    await expect(
      getKnowledgeBaseFile(client, { file_id: 'file-1' }, { connectionId: 'conn_401', cleanup }),
    ).rejects.toThrow('Authentication failed');
    expect(cleanup).toHaveBeenCalledWith('conn_401');
  });
});
