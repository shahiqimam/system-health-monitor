/**
 * Raised whenever SSRF policy refuses a destination.
 * The message is safe to surface to API clients and to store as a bounded
 * CheckResult.errorMessage (spec 9, 41).
 */
export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedTargetError';
  }
}
