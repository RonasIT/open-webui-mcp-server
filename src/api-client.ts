import {
  ALLOWED_KB_ID_PATTERN,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_KB_ID_LENGTH,
  MAX_QUERY_LENGTH,
  TOKEN_MASK_LENGTH,
} from './constants.js';

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

export type HttpErrorContext = {
  kbId?: string;
  fileId?: string;
  operation?: 'search' | 'file' | 'info';
};

function truncateErrorMessage(message: string): string {
  if (message.length > MAX_ERROR_MESSAGE_LENGTH) return message.slice(0, MAX_ERROR_MESSAGE_LENGTH) + '...';

  return message;
}

export async function parseApiErrorDetail(res: Response): Promise<string | null> {
  try {
    const body = await res.text();
    if (!body.trim()) return null;

    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === 'string') return parsed;

      if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
        const detail = (parsed as { detail: unknown }).detail;
        if (typeof detail === 'string') return detail;

        if (Array.isArray(detail)) {
          return detail
            .map((item) => {
              if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg);

              return JSON.stringify(item);
            })
            .join('; ');
        }
        if (detail != null) return String(detail);
      }
    } catch {
      // response body is not JSON
    }

    return truncateErrorMessage(body);
  } catch {
    return null;
  }
}

export function formatHttpErrorMessage(status: number, detail: string, context?: HttpErrorContext): string {
  if (context?.operation === 'search') {
    return truncateErrorMessage(
      `Semantic search failed (HTTP ${status}): ${detail}\n\n` +
        'This often indicates an Open WebUI embedding or retrieval configuration issue. ' +
        'Check Admin Settings → Documents / Embeddings in Open WebUI. ' +
        'As a workaround, use get_knowledge_base_file_content with a file ID from get_knowledge_base_info.',
    );
  }

  if (status === 404 && context?.fileId) return `File not found: ${context.fileId}`;
  if (status === 404 && context?.kbId) return `Knowledge base not found: ${context.kbId}`;

  return truncateErrorMessage(`Request failed (HTTP ${status}): ${detail}`);
}

export function sanitizeErrorMessage(errorText: string): string {
  return truncateErrorMessage(`${errorText}. Check Open WebUI server logs for details.`);
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
  context?: HttpErrorContext,
): Promise<never> {
  if (res.status === 401) {
    await cleanup(connectionId);
    throw new Error('Authentication failed. Please check your API token.');
  }

  const detail = await parseApiErrorDetail(res);
  if (detail) throw new Error(formatHttpErrorMessage(res.status, detail, context));

  throw new Error(sanitizeErrorMessage(`HTTP error ${res.status}: Request failed`));
}
