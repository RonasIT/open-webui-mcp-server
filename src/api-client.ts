import { ALLOWED_KB_ID_PATTERN, MAX_KB_ID_LENGTH, MAX_QUERY_LENGTH, TOKEN_MASK_LENGTH } from './constants.js';

export function validateToken(token: string | null | undefined): boolean {
  if (token == null || typeof token !== 'string') return false;
  const t = token.trim();
  if (t.startsWith('sk-')) return t.length >= 3 && t.length <= 500;

  if (t.includes('.')) {
    const parts = t.split('.');
    if (parts.length === 2 || parts.length === 3) return parts.every((p) => p.length > 0) && t.length > 20;
  }

  return false;
}

export function maskToken(token: string | null | undefined): string {
  if (token == null || token === '') return 'None';
  if (token.length <= TOKEN_MASK_LENGTH * 2) return '****';

  return `${token.slice(0, TOKEN_MASK_LENGTH)}...${token.slice(-TOKEN_MASK_LENGTH)}`;
}

export function validateKnowledgeBaseId(kbId: string): void {
  if (kbId == null || typeof kbId !== 'string') throw new Error('knowledge_base_id must be a non-empty string');
  const id = kbId.trim();
  if (id.length === 0) throw new Error('knowledge_base_id must be a non-empty string');
  if (id.length > MAX_KB_ID_LENGTH) throw new Error(`knowledge_base_id exceeds maximum length of ${MAX_KB_ID_LENGTH}`);
  if (!ALLOWED_KB_ID_PATTERN.test(id)) throw new Error('knowledge_base_id contains invalid characters');
}

export function validateQuery(query: string): void {
  if (query == null || typeof query !== 'string') throw new Error('query must be a non-empty string');
  const q = query.trim();
  if (q.length === 0) throw new Error('query must be a non-empty string');
  if (q.length > MAX_QUERY_LENGTH) throw new Error(`query exceeds maximum length of ${MAX_QUERY_LENGTH}`);
}

export function sanitizeErrorMessage(errorText: string): string {
  if (errorText.includes('HTTP error') || errorText.toLowerCase().includes('status'))
    return 'An error occurred while processing the request. Please try again.';
  if (errorText.length > 500) return errorText.slice(0, 500) + '...';

  return errorText;
}

export type ApiClient = {
  get: (path: string) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
};

export function createApiClient(baseUrl: string, token: string): ApiClient {
  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return {
    async get(path: string) {
      const res = await fetch(`${base}${path}`, { headers });

      return res;
    },
    async post(path: string, body: unknown) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      return res;
    },
  };
}

export async function handleHttpError(
  res: Response,
  connectionId: string,
  cleanup: (id: string) => Promise<void>,
  kbId?: string,
): Promise<never> {
  if (res.status === 401) {
    await cleanup(connectionId);
    throw new Error('Authentication failed. Please check your API token.');
  }
  if (res.status === 404 && kbId) throw new Error(`Knowledge base not found: ${kbId}`);
  throw new Error(sanitizeErrorMessage(`HTTP error ${res.status}: Request failed`));
}
