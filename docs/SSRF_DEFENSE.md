# SSRF defence

## What SSRF is

Server-Side Request Forgery: an attacker supplies a URL and the *server* makes
the request. The request then originates from inside the trust boundary, so it
can reach things the attacker cannot reach directly — internal admin panels,
databases on private subnets, and cloud instance-metadata endpoints that hand
out credentials.

## Why a monitoring tool is unusually exposed

A monitor's entire purpose is "fetch this URL the user gave me, on a timer,
forever". That is SSRF as a product feature. Three properties make it worse
than a one-off fetch:

- It is **persistent** — one accepted target keeps firing on a schedule.
- It is **authenticated as the server**, from the server's network position.
- It **reports back** — status code and latency are shown in the UI, which is
  enough to port-scan an internal network by timing and status differences.

That is why target creation is `ADMIN`-only and why URL handling has its own
service with its own test suite.

## Layer 1 — scheme and syntax policy

`UrlValidatorService.parseAndValidateSyntax` (no network access):

| Rule                     | Behaviour                                            |
| ------------------------ | ---------------------------------------------------- |
| Allowed schemes          | `http:` and `https:` only                            |
| Rejected schemes         | `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, everything else |
| Credentials in URL       | Rejected (`https://user:pass@host` → 400)            |
| URL length               | Capped at `MAX_URL_LENGTH` (default 2048)            |
| Hostname length          | Capped at `MAX_HOSTNAME_LENGTH` (default 253)        |
| Relative / malformed URL | Rejected                                             |

These rules apply **even when the local-lab override is enabled**.

## Layer 2 — address policy

Addresses are parsed with [`ipaddr.js`](https://github.com/whitequark/ipaddr.js),
not with string prefix matching. Hand-rolled checks like
`ip.startsWith('192.168.')` miss `0177.0.0.1`, `2130706433`, `::ffff:127.0.0.1`
and IPv6 entirely.

The policy is an **allowlist of one range class**: only `unicast` is permitted.
Everything ipaddr.js classifies otherwise is blocked, which covers at minimum:

```text
127.0.0.0/8      loopback          10.0.0.0/8       private
172.16.0.0/12    private           192.168.0.0/16   private
169.254.0.0/16   linkLocal         0.0.0.0/8        unspecified
224.0.0.0/4      multicast         100.64.0.0/10    carrierGradeNat
::1/128          loopback (v6)     fc00::/7         uniqueLocal
fe80::/10        linkLocal (v6)
```

Cloud metadata endpoints (`169.254.169.254`, `fd00:ec2::254`) fall inside the
link-local and unique-local blocks and are therefore already covered — no
special case needed.

IPv4-mapped IPv6 addresses are unwrapped *before* classification, so
`::ffff:169.254.169.254` is blocked as link-local rather than passing as a
generic IPv6 unicast address.

## Layer 3 — connect-time validation (the important one)

Validating at target-creation time is not enough. The classic bypass is DNS
rebinding: the attacker's nameserver answers `93.184.216.34` while the target
is being created, then answers `169.254.169.254` a minute later when the
scheduler actually fires. Nothing about the stored row changed.

PulseWatch therefore validates the address at the moment the socket is opened,
by handing `undici` a guarded `lookup`:

```ts
new Agent({
  connect: { lookup: this.urlValidator.createGuardedLookup() },
  maxRedirections: 0,
});
```

Node calls that function immediately before connecting, and the addresses it
returns are the addresses actually dialled. If any of them is outside the
allowed range the lookup fails with `ERR_BLOCKED_TARGET` and the check is
recorded as `BLOCKED_TARGET`. This closes the resolve-then-connect TOCTOU
window that a pre-flight check alone leaves open.

## Layer 4 — redirect validation

```text
followRedirects = false   (default)
maxRedirects    = 3       (when enabled)
```

The HTTP client's automatic redirect following is switched off
(`maxRedirections: 0`). Redirects are followed manually so that **every hop**
runs through Layers 1–3 again. A redirect to `file:///etc/passwd` or to
`http://169.254.169.254/` is refused and classified `BLOCKED_TARGET`; exceeding
the hop cap is `REDIRECT_LIMIT`.

Relying on a client's built-in redirect handling is a common and quiet failure:
the first URL is validated, the final one is not.

## Local-lab override

```env
ALLOW_PRIVATE_TARGETS=false   # default, and the only safe default
```

The Compose demo services live on a private Docker bridge network, so the demo
overlay (`docker-compose.demo.yml`) sets this to `true`.

> **Warning:** Private-target monitoring is enabled for a trusted local lab.
> Do not enable this for an internet-exposed deployment without a deliberate
> network security model.

The API logs that warning on boot whenever the flag is on. Even with the
override, scheme and credential rules still apply.

## Response handling

Only the status code and the duration are used. Bodies are drained with a 64 KB
cap and never stored, so a monitored endpoint cannot smuggle content into the
database or the dashboard.

## Residual limitations — stated honestly

This project does **not** claim complete SSRF prevention.

1. **Redirect hops re-resolve.** Each hop is validated at connect time by the
   guarded lookup, but the URL-level pre-check and the connection are still two
   separate DNS resolutions. The connect-time guard is the binding one.
2. **No per-connection IP pinning.** The guarded lookup validates the candidate
   addresses; it does not pin one address and force the socket to it. An
   adversarial resolver returning a rotating set could still, in principle, be
   probed for timing differences.
3. **Public-but-internal hosts are not covered.** An internal service on a
   public IP range, or one reachable via a VPN interface, passes the range
   check. Network-level egress filtering is the correct control for that, and
   is out of scope here.
4. **Blind timing signals remain.** Latency and error type are visible to any
   authenticated user who can read a target, which leaks some information about
   what the API server can reach.
5. **IPv6 transition mechanisms** (Teredo, 6to4) are classified by ipaddr.js
   but the embedded IPv4 address is not separately extracted and re-checked.

For a real deployment the right answer is defence in depth: keep these checks,
*and* run the checker in a network namespace with an egress allowlist.

## Tests

`apps/api/src/checks/ssrf/url-validator.service.spec.ts` and
`apps/api/src/checks/check-engine.service.spec.ts` cover blocked schemes,
credentialed URLs, over-long URLs, every required IP range, IPv4-mapped
metadata addresses, blocked redirect targets, and the override still rejecting
unsafe schemes.
