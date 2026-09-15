import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LookupAddress, lookup as dnsLookup, promises as dns } from 'dns';
import { AppConfig } from '../../config/configuration';
import { BlockedTargetError } from './blocked-target.error';
import { classifyIp, isIpLiteral } from './ip-policy';

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export type GuardedLookup = typeof dnsLookup;

@Injectable()
export class UrlValidatorService {
  private readonly logger = new Logger(UrlValidatorService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private get ssrf() {
    return this.configService.get('ssrf', { infer: true });
  }

  get allowPrivateTargets(): boolean {
    return this.ssrf.allowPrivateTargets;
  }

  /**
   * Layer 1 - pure syntax policy. No network access, safe for DTO-time use.
   */
  parseAndValidateSyntax(rawUrl: string): URL {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      throw new BlockedTargetError('Target URL is required');
    }
    const trimmed = rawUrl.trim();
    if (trimmed.length > this.ssrf.maxUrlLength) {
      throw new BlockedTargetError(`Target URL exceeds ${this.ssrf.maxUrlLength} characters`);
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new BlockedTargetError('Target URL is not a valid absolute URL');
    }

    if (!ALLOWED_SCHEMES.has(url.protocol)) {
      throw new BlockedTargetError(
        `Scheme "${url.protocol.replace(':', '')}" is not allowed; use http or https`,
      );
    }
    if (url.username || url.password) {
      throw new BlockedTargetError('Target URL must not contain credentials');
    }
    if (!url.hostname) {
      throw new BlockedTargetError('Target URL must contain a hostname');
    }
    if (url.hostname.length > this.ssrf.maxHostnameLength) {
      throw new BlockedTargetError(
        `Hostname exceeds ${this.ssrf.maxHostnameLength} characters`,
      );
    }
    return url;
  }

  /**
   * Layer 2 - address policy for a single already-resolved IP.
   */
  assertAddressAllowed(address: string, hostname: string): void {
    if (this.allowPrivateTargets) return;
    const verdict = classifyIp(address);
    if (!verdict.allowed) {
      throw new BlockedTargetError(
        `Destination ${hostname} resolves to a blocked ${verdict.range} address`,
      );
    }
  }

  /**
   * Layer 3 - pre-flight resolution check, used at target creation and before
   * each check. This is advisory: the authoritative check is the connect-time
   * guarded lookup below (see docs/SSRF_DEFENSE.md, DNS rebinding).
   */
  async assertDestinationAllowed(url: URL): Promise<string[]> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');

    if (isIpLiteral(hostname)) {
      this.assertAddressAllowed(hostname, hostname);
      return [hostname];
    }

    let addresses: LookupAddress[];
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      // Resolution failure is not an SSRF verdict; the check engine classifies
      // it as a DNS error when the request actually runs.
      return [];
    }

    if (addresses.length === 0) return [];
    for (const entry of addresses) {
      this.assertAddressAllowed(entry.address, hostname);
    }
    return addresses.map((entry) => entry.address);
  }

  /**
   * Connect-time guard handed to undici. Node calls this immediately before
   * opening the socket, so the address validated here is the address actually
   * dialled. This closes the classic resolve-then-connect TOCTOU window.
   */
  createGuardedLookup(): GuardedLookup {
    const guarded = ((hostname: string, options: unknown, callback: unknown) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: NodeJS.ErrnoException | null,
        address?: string | LookupAddress[],
        family?: number,
      ) => void;
      const opts = (typeof options === 'function' ? {} : options) as {
        all?: boolean;
        family?: number;
      };

      dnsLookup(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
        if (err) return cb(err);
        const list = addresses as LookupAddress[];
        try {
          for (const entry of list) {
            this.assertAddressAllowed(entry.address, hostname);
          }
        } catch (blocked) {
          const error = Object.assign(
            new Error((blocked as Error).message),
            { code: 'ERR_BLOCKED_TARGET' },
          ) as NodeJS.ErrnoException;
          return cb(error);
        }
        if (opts.all) return cb(null, list);
        return cb(null, list[0].address, list[0].family);
      });
    }) as unknown as GuardedLookup;

    return guarded;
  }
}
