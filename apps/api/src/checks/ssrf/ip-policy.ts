import ipaddr from 'ipaddr.js';

/**
 * ipaddr.js classifies every address into a range name. Anything that is not
 * plain public `unicast` is a special-purpose destination and is blocked by
 * default. This covers, at minimum, the ranges required by the spec:
 *
 *   127.0.0.0/8     loopback        10.0.0.0/8       private
 *   172.16.0.0/12   private         192.168.0.0/16   private
 *   169.254.0.0/16  linkLocal       0.0.0.0/8        unspecified/reserved
 *   224.0.0.0/4     multicast       ::1/128          loopback (v6)
 *   fc00::/7        uniqueLocal     fe80::/10        linkLocal (v6)
 *
 * Cloud instance-metadata endpoints (169.254.169.254, fd00:ec2::254) fall
 * inside the link-local / unique-local blocks and are therefore covered.
 */
const ALLOWED_RANGES = new Set(['unicast']);

export interface IpVerdict {
  allowed: boolean;
  range: string;
  normalized: string;
}

export const classifyIp = (address: string): IpVerdict => {
  let parsed = ipaddr.parse(address);

  // Unwrap ::ffff:169.254.169.254 style addresses before classifying.
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    }
  }

  const range = parsed.range();
  return {
    allowed: ALLOWED_RANGES.has(range),
    range,
    normalized: parsed.toString(),
  };
};

export const isIpLiteral = (host: string): boolean => ipaddr.isValid(host);
