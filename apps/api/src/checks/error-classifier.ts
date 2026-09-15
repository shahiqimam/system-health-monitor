import { CheckErrorType } from '../common/enums';

const TIMEOUT_CODES = new Set([
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ERR_TIMEOUT',
  'ABORT_ERR',
  'AbortError',
  'TimeoutError',
  // undici turns our AbortSignal.timeout into an abort; the engine only ever
  // aborts a request because the configured timeout elapsed.
  'UND_ERR_ABORTED',
]);

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NODATA', 'ENODATA']);

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EADDRNOTAVAIL',
  'UND_ERR_SOCKET',
]);

const isTlsCode = (code: string): boolean =>
  code.startsWith('ERR_TLS') ||
  code.startsWith('ERR_SSL') ||
  code.startsWith('CERT_') ||
  code.startsWith('DEPTH_ZERO') ||
  code.startsWith('UNABLE_TO_VERIFY') ||
  code.startsWith('SELF_SIGNED') ||
  code.startsWith('UNABLE_TO_GET_ISSUER');

const collectCodes = (error: unknown): string[] => {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as { code?: string; name?: string; cause?: unknown };
    if (typeof candidate.code === 'string') codes.push(candidate.code);
    if (typeof candidate.name === 'string') codes.push(candidate.name);
    current = candidate.cause;
  }
  return codes;
};

export const classifyNetworkError = (error: unknown): CheckErrorType => {
  const codes = collectCodes(error);
  if (codes.includes('ERR_BLOCKED_TARGET')) return CheckErrorType.BLOCKED_TARGET;
  if (codes.some((code) => TIMEOUT_CODES.has(code))) return CheckErrorType.TIMEOUT;
  if (codes.some((code) => DNS_CODES.has(code))) return CheckErrorType.DNS;
  if (codes.some(isTlsCode)) return CheckErrorType.TLS;
  if (codes.some((code) => CONNECTION_CODES.has(code))) return CheckErrorType.CONNECTION;
  return CheckErrorType.UNKNOWN;
};

/** Never store stack traces as check data (spec 9/11). */
export const sanitizeErrorMessage = (message: string, maxLength = 200): string =>
  message.replace(/\s+/g, ' ').trim().slice(0, maxLength);
