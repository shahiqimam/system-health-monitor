import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent, Dispatcher, request as undiciRequest } from 'undici';
import { CheckErrorType, CheckResultStatus } from '../common/enums';
import { CheckableTarget, CheckExecutionResult } from './check-engine.types';
import { classifyNetworkError, sanitizeErrorMessage } from './error-classifier';
import { BlockedTargetError } from './ssrf/blocked-target.error';
import { UrlValidatorService } from './ssrf/url-validator.service';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Executes exactly one HTTP health check.
 *
 * Deliberately knows nothing about incidents, persistence or scheduling
 * (spec 12): it takes a target description and returns a bounded result.
 */
@Injectable()
export class CheckEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(CheckEngineService.name);
  private readonly agent: Agent;

  constructor(private readonly urlValidator: UrlValidatorService) {
    this.agent = new Agent({
      connect: {
        // Validated at connect time, not only at resolve time.
        lookup: this.urlValidator.createGuardedLookup(),
        timeout: 10_000,
      },
      // Redirects are followed manually so every hop is re-validated.
      maxRedirections: 0,
      pipelining: 0,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.agent.close().catch(() => undefined);
  }

  async checkTarget(target: CheckableTarget): Promise<CheckExecutionResult> {
    const checkedAt = new Date();
    const startedAt = process.hrtime.bigint();
    const elapsedMs = () => Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

    let redirectCount = 0;

    try {
      let currentUrl = this.urlValidator.parseAndValidateSyntax(target.url);
      await this.urlValidator.assertDestinationAllowed(currentUrl);

      const maxHops = target.followRedirects ? Math.max(0, target.maxRedirects) : 0;

      for (;;) {
        const remainingMs = target.timeoutMs - elapsedMs();
        if (remainingMs <= 0) {
          return this.failure(
            CheckErrorType.TIMEOUT,
            `Timed out after ${target.timeoutMs}ms`,
            checkedAt,
            elapsedMs(),
            redirectCount,
          );
        }

        const response = await this.sendOnce(currentUrl, target, remainingMs);
        const httpStatus = response.statusCode;

        if (target.followRedirects && REDIRECT_STATUSES.has(httpStatus)) {
          const location = this.headerValue(response.headers['location']);
          if (location) {
            if (redirectCount >= maxHops) {
              return this.failure(
                CheckErrorType.REDIRECT_LIMIT,
                `Exceeded redirect limit of ${maxHops}`,
                checkedAt,
                elapsedMs(),
                redirectCount,
                httpStatus,
              );
            }
            const next = this.urlValidator.parseAndValidateSyntax(
              new URL(location, currentUrl).toString(),
            );
            await this.urlValidator.assertDestinationAllowed(next);
            currentUrl = next;
            redirectCount += 1;
            continue;
          }
        }

        const latencyMs = elapsedMs();
        const inRange =
          httpStatus >= target.expectedStatusMin && httpStatus <= target.expectedStatusMax;

        if (inRange) {
          return {
            status: CheckResultStatus.SUCCESS,
            httpStatus,
            latencyMs,
            errorType: null,
            errorMessage: null,
            checkedAt,
            redirectCount,
          };
        }

        return this.failure(
          CheckErrorType.INVALID_STATUS,
          `HTTP ${httpStatus} outside expected range ${target.expectedStatusMin}-${target.expectedStatusMax}`,
          checkedAt,
          latencyMs,
          redirectCount,
          httpStatus,
        );
      }
    } catch (error) {
      if (error instanceof BlockedTargetError) {
        return this.failure(
          CheckErrorType.BLOCKED_TARGET,
          error.message,
          checkedAt,
          elapsedMs(),
          redirectCount,
        );
      }
      const errorType = classifyNetworkError(error);
      const message =
        errorType === CheckErrorType.TIMEOUT
          ? `Timed out after ${target.timeoutMs}ms`
          : (error as Error)?.message ?? 'Check failed';
      if (errorType === CheckErrorType.UNKNOWN) {
        this.logger.warn(`Unclassified check error for ${target.id ?? target.url}: ${message}`);
      }
      return this.failure(errorType, message, checkedAt, elapsedMs(), redirectCount);
    }
  }

  private async sendOnce(
    url: URL,
    target: CheckableTarget,
    remainingMs: number,
  ): Promise<Dispatcher.ResponseData> {
    const response = await undiciRequest(url, {
      method: target.method,
      dispatcher: this.agent,
      maxRedirections: 0,
      headersTimeout: remainingMs,
      bodyTimeout: remainingMs,
      signal: AbortSignal.timeout(remainingMs),
      headers: { 'user-agent': 'PulseWatch/1.0 (health-check)', accept: '*/*' },
    });
    // Response bodies are never stored (spec 21); drain with a hard cap so the
    // socket can be reused and a huge body cannot exhaust memory.
    await response.body.dump({ limit: 64 * 1024 }).catch(() => undefined);
    return response;
  }

  private headerValue(header: string | string[] | undefined): string | undefined {
    if (Array.isArray(header)) return header[0];
    return header;
  }

  private failure(
    errorType: CheckErrorType,
    message: string,
    checkedAt: Date,
    latencyMs: number | null,
    redirectCount: number,
    httpStatus: number | null = null,
  ): CheckExecutionResult {
    return {
      status: CheckResultStatus.FAILURE,
      httpStatus,
      latencyMs,
      errorType,
      errorMessage: sanitizeErrorMessage(message),
      checkedAt,
      redirectCount,
    };
  }
}
