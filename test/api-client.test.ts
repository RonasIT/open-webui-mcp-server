import { describe, it, expect, vi } from 'vitest';
import {
  validateToken,
  maskToken,
  validateKnowledgeBaseId,
  validateQuery,
  sanitizeErrorMessage,
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
  it('sanitizes HTTP error text', () => {
    expect(sanitizeErrorMessage('HTTP error 500')).toBe(
      'An error occurred while processing the request. Please try again.',
    );
  });

  it('truncates long messages', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeErrorMessage(long).length).toBe(503);
    expect(sanitizeErrorMessage(long).endsWith('...')).toBe(true);
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
