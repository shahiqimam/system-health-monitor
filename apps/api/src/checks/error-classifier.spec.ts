import { CheckErrorType } from '../common/enums';
import { classifyNetworkError, sanitizeErrorMessage } from './error-classifier';

const withCode = (code: string, cause?: unknown) =>
  Object.assign(new Error(`failed: ${code}`), { code, cause });

describe('classifyNetworkError', () => {
  it.each([
    ['ENOTFOUND', CheckErrorType.DNS],
    ['EAI_AGAIN', CheckErrorType.DNS],
    ['ECONNREFUSED', CheckErrorType.CONNECTION],
    ['ECONNRESET', CheckErrorType.CONNECTION],
    ['EHOSTUNREACH', CheckErrorType.CONNECTION],
    ['UND_ERR_HEADERS_TIMEOUT', CheckErrorType.TIMEOUT],
    ['UND_ERR_CONNECT_TIMEOUT', CheckErrorType.TIMEOUT],
    ['ETIMEDOUT', CheckErrorType.TIMEOUT],
    ['CERT_HAS_EXPIRED', CheckErrorType.TLS],
    ['ERR_TLS_CERT_ALTNAME_INVALID', CheckErrorType.TLS],
    ['SELF_SIGNED_CERT_IN_CHAIN', CheckErrorType.TLS],
    ['ERR_BLOCKED_TARGET', CheckErrorType.BLOCKED_TARGET],
    ['SOMETHING_ELSE', CheckErrorType.UNKNOWN],
  ])('classifies %s as %s', (code, expected) => {
    expect(classifyNetworkError(withCode(code))).toBe(expected);
  });

  it('inspects the cause chain used by undici', () => {
    const wrapped = Object.assign(new Error('fetch failed'), {
      cause: withCode('ECONNREFUSED'),
    });
    expect(classifyNetworkError(wrapped)).toBe(CheckErrorType.CONNECTION);
  });
});

describe('sanitizeErrorMessage', () => {
  it('collapses whitespace and truncates', () => {
    const noisy = `boom\n    at Object.<anonymous> (${'x'.repeat(400)})`;
    const sanitized = sanitizeErrorMessage(noisy);
    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized).not.toContain('\n');
  });
});
