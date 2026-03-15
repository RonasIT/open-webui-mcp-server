export const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
export const MAX_QUERY_LENGTH = 10_000;
export const MAX_KB_ID_LENGTH = 255;
export const ALLOWED_KB_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const DEFAULT_RATE_LIMIT_PER_IP = '1000/minute';
export const DEFAULT_RATE_LIMIT_PER_TOKEN = '1000/minute';
export const DEFAULT_RATE_LIMIT_HEALTH = '10/minute';

export const CONNECTION_TIMEOUT = 5_000;
export const CONNECTION_ID_PREFIX_HTTP = 'http_';
export const CONNECTION_ID_PREFIX_STDIO = 'conn_';

export const BEARER_PREFIX = 'Bearer ';
export const AUTHORIZATION_HEADER = 'Authorization';
export const SESSION_ID_HEADERS = ['mcp-session-id', 'x-session-id'] as const;

export const TOKEN_HASH_LENGTH = 16;
export const TOKEN_MASK_LENGTH = 4;

export const HTTP_STATUS_TOO_LARGE = 413;
export const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
export const HTTP_STATUS_INTERNAL_ERROR = 500;
export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_NOT_FOUND = 404;

export const MAX_ERROR_MESSAGE_LENGTH = 500;
