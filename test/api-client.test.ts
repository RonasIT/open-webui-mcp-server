import { describe, it, expect, vi } from 'vitest';
import {
  validateToken,
  maskToken,
  validateKnowledgeBaseId,
  validateQuery,
  sanitizeErrorMessage,
  parseApiErrorDetail,
  formatHttpErrorMessage,
  createApiClient,
} from '../src/api-client.js';

describe('validateToken', () => {
  it('accepts sk- prefix tokens', () => {
    expect(validateToken('sk-valid-token')).toBe(true);
    expect(validateToken('sk-')).toBe(true);
  });

  it('accepts JWT-like tokens', () => {
    expect(validateToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0')).toBe(true);
  });

  it('rejects invalid tokens', () => {
    expect(validateToken('invalid-token')).toBe(false);
    expect(validateToken('')).toBe(false);
    expect(validateToken(null)).toBe(false);
    expect(validateToken(undefined)).toBe(false);
    expect(validateToken('short')).toBe(false);
  });
});

describe('maskToken', () => {
  it('masks long tokens', () => {
    expect(maskToken('sk-1234567890')).toBe(`sk-1...7890`);
  });

  it('returns **** for short tokens', () => {
    expect(maskToken('short')).toBe('****');
  });

  it('returns None for null/empty', () => {
    expect(maskToken(null)).toBe('None');
    expect(maskToken(undefined)).toBe('None');
    expect(maskToken('')).toBe('None');
  });
});

describe('validateKnowledgeBaseId', () => {
  it('accepts valid ids', () => {
    expect(() => validateKnowledgeBaseId('kb-1')).not.toThrow();
    expect(() => validateKnowledgeBaseId('my_kb')).not.toThrow();
  });

  it('rejects empty or invalid', () => {
    expect(() => validateKnowledgeBaseId('')).toThrow('non-empty string');
    expect(() => validateKnowledgeBaseId('   ')).toThrow();
    expect(() => validateKnowledgeBaseId('invalid id!')).toThrow('invalid characters');
  });
});

describe('validateQuery', () => {
  it('accepts non-empty query', () => {
    expect(() => validateQuery('hello')).not.toThrow();
  });

  it('rejects empty or too long', () => {
    expect(() => validateQuery('')).toThrow('non-empty string');
    expect(() => validateQuery('   ')).toThrow();
  });
});

describe('sanitizeErrorMessage', () => {
  it('appends guidance for fallback HTTP errors', () => {
    expect(sanitizeErrorMessage('HTTP error 500')).toContain('HTTP error 500');
    expect(sanitizeErrorMessage('HTTP error 500')).toContain('Open WebUI server logs');
  });

  it('truncates long messages', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeErrorMessage(long).length).toBe(503);
    expect(sanitizeErrorMessage(long).endsWith('...')).toBe(true);
  });
});

describe('parseApiErrorDetail', () => {
  it('extracts detail string from JSON body', async () => {
    const res = {
      text: async () => JSON.stringify({ detail: 'Embedding model is not configured' }),
    } as Response;

    await expect(parseApiErrorDetail(res)).resolves.toBe('Embedding model is not configured');
  });

  it('extracts validation error messages from JSON body', async () => {
    const res = {
      text: async () => JSON.stringify({ detail: [{ msg: 'field required' }] }),
    } as Response;

    await expect(parseApiErrorDetail(res)).resolves.toBe('field required');
  });
});

describe('formatHttpErrorMessage', () => {
  it('adds search-specific guidance for retrieval failures', () => {
    const message = formatHttpErrorMessage(400, 'Error querying knowledge base', { operation: 'search' });

    expect(message).toContain('Semantic search failed (HTTP 400)');
    expect(message).toContain('embedding or retrieval configuration');
    expect(message).toContain('get_knowledge_base_file_content');
  });
});

describe('createApiClient', () => {
  it('builds client with base URL and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('https://api.example.com', 'sk-token');
    await client.get('/knowledge/');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/knowledge/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-token',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
