# Troubleshooting

Each case lists the symptom, the likely causes, and a diagnostic sequence you
can actually run.

---

## 1. A target stays `UNKNOWN` forever

**Symptom:** a new target never leaves `UNKNOWN`; `lastCheckedAt` is `null`.

```bash
curl -s http://localhost:3001/api/v1/health/ready
docker compose logs api | grep -i "Scheduler started"
```

```bash
docker compose exec -T postgres psql -U pulsewatch -d pulsewatch -c \
  "SELECT name, enabled, archived, status, interval_seconds, last_checked_at FROM monitor_targets ORDER BY name;"
```

Likely causes, in order:

1. `SCHEDULER_ENABLED=false` — readiness reports `scheduler: false`.
2. The target is `enabled = false` / `archived = true`, so the due query skips it.
3. The tick has not come round yet. With `SCHEDULER_TICK_SECONDS=15` a brand
   new target is picked up within 15 seconds; wait that long before digging.
4. The API crashed after boot — `docker compose ps` shows it restarting.

Force the issue with a manual check, which uses the identical code path:

```bash
curl -X POST -H "authorization: Bearer $TOKEN" http://localhost:3001/api/v1/targets/$ID/check-now
```

---

## 2. A healthy endpoint is marked `DOWN`

```bash
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/targets/$ID/checks?limit=5"
```

Read `errorType` on the failing rows:

| `errorType`      | What it means here                                                  |
| ---------------- | ------------------------------------------------------------------- |
| `INVALID_STATUS` | The endpoint answered, but outside `expectedStatusMin..Max`. A 401 or 404 health path is the usual culprit. |
| `BLOCKED_TARGET` | SSRF policy refused it — see case 6.                                 |
| `TIMEOUT`        | `timeoutMs` is lower than the endpoint's real latency.               |
| `DNS`            | The API container cannot resolve the hostname — see case 5.          |
| `CONNECTION`     | Reachable name, refused or unreachable port.                         |
| `TLS`            | Certificate expired, self-signed, or hostname mismatch.              |

A very common one: the endpoint returns `302` to a login page, `followRedirects`
is off, and the expected range was narrowed to `200-299`. The default range is
`200-399` precisely so a redirect is not automatically a failure.

---

## 3. The scheduler is not running

```bash
curl -s http://localhost:3001/api/v1/health/ready | grep scheduler
docker compose logs api --tail 50 | grep -iE "scheduler|tick"
```

- `"scheduler": false` in readiness means `onModuleInit` never registered the
  interval — check `SCHEDULER_ENABLED`.
- `lastSchedulerTickAt` stuck in the past means ticks are firing but throwing.
  The service logs `Scheduler tick failed: ...` for that case.
- A tick that takes longer than the tick interval causes the next one to be
  skipped with `Previous tick still running`. Lower `MAX_CONCURRENT_CHECKS` or
  raise `SCHEDULER_TICK_SECONDS` if you see this repeatedly.

---

## 4. Checks are duplicated

**Symptom:** two `check_results` rows a few milliseconds apart, uptime
denominators roughly doubled.

Cause: **more than one API replica is running the scheduler.** This is a known
and documented limitation — the coordinator is in-process and
`TargetLockService` is a process-local `Set`.

```bash
docker compose ps api
docker compose up -d --scale api=1
```

For a real multi-replica deployment you would need a distributed lock
(`SELECT ... FOR UPDATE SKIP LOCKED`, a Redis lock, or leader election), or
move checks to a dedicated worker. None of that is implemented here. See
[CHECK_ENGINE.md](./CHECK_ENGINE.md).

---

## 5. The API cannot reach a target

Run the probe from inside the API container, not from your host:

```bash
docker compose exec api node -e "require('dns').lookup('demo-healthy', (e,a)=>console.log(e||a))"
docker compose exec api wget -qO- http://demo-healthy:8081/health
```

If the host can reach it but the container cannot, it is a Docker networking
issue, not an application bug — see case 11.

---

## 6. A private target is blocked

**Symptom:** creating the target returns `400 ... resolves to a blocked private
address`, or checks record `BLOCKED_TARGET`.

This is correct behaviour. `ALLOW_PRIVATE_TARGETS` defaults to `false` and
blocks loopback, RFC1918, link-local, multicast, CGNAT and their IPv6
equivalents.

For the local demo only:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up -d
docker compose logs api | grep ALLOW_PRIVATE_TARGETS
```

The API logs a warning on boot whenever the override is active. Never enable it
on an internet-exposed deployment. Scheme and credential rules still apply
either way, so `file://` and `https://user:pass@host` stay rejected.

---

## 7. A redirect is rejected

| Recorded `errorType` | Meaning                                                  |
| -------------------- | -------------------------------------------------------- |
| `REDIRECT_LIMIT`     | More hops than `maxRedirects` (or a redirect loop).      |
| `BLOCKED_TARGET`     | A hop pointed at a blocked scheme or a blocked IP range. |

Remember that redirects are **not followed by default**, and that with the
default `200-399` range a `301` is itself a success. Turn `followRedirects` on
only if you actually want to check the final destination.

---

## 8. Incidents never resolve

An incident resolves only when the target records `RECOVERY_THRESHOLD`
**consecutive** successes (default 2). Inspect the counters:

```bash
curl -s -H "authorization: Bearer $TOKEN" http://localhost:3001/api/v1/targets/$ID
```

Common reasons:

- The target is flapping, so `consecutiveSuccesses` resets to 0 before reaching 2.
- The target was **paused while DOWN**. Pausing deliberately does not resolve
  the incident; after resume the counters start from zero and two real
  successes are still required.
- Acknowledging is not resolving. `ACKNOWLEDGED` only records that a human saw
  it.

There is intentionally no "close this incident" button — resolution means the
service actually recovered.

---

## 9. Dashboard metrics look wrong

Check the sample count before the percentage:

```bash
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:3001/api/v1/targets/$ID/metrics?window=24h"
```

- `uptimePercent: null` with `totalChecks: 0` is "no data", not an error. A
  target created two minutes ago has nothing to report for 24 hours.
- Uptime is **sample-based**, not duration-based. A short outage between two
  successful checks is invisible. See [UPTIME_CALCULATION.md](./UPTIME_CALCULATION.md).
- Latency statistics exclude failures on purpose, so `latency.sampleCount` is
  lower than `uptime.totalChecks` whenever checks failed.
- `p95` over five samples is the worst of five samples. That is what
  nearest-rank means; the sample count is displayed beside it for this reason.

---

## 10. The database grows quickly

A 60-second interval produces roughly:

```text
1,440 rows/day/target - 43,200 rows/30 days/target
10 targets  ->  ~432,000 rows in 30 days
```

```bash
docker compose exec -T postgres psql -U pulsewatch -d pulsewatch -c "SELECT count(*) FROM check_results;"
docker compose exec -T postgres psql -U pulsewatch -d pulsewatch -c "SELECT pg_size_pretty(pg_total_relation_size('check_results'));"
```

Mitigations already in the project: `CHECK_RETENTION_DAYS` with a daily prune
job at 03:00, a manual `npm run retention:prune --workspace apps/api`,
composite indexes on `(target_id, checked_at)` and `(status, checked_at)`,
pagination on every list endpoint, and bucketed chart queries. Incidents are
never pruned.

---

## 11. Docker hostname confusion

The single most common local-setup mistake.

| From                     | PostgreSQL host    | API host         |
| ------------------------ | ------------------ | ---------------- |
| Your shell / browser     | `localhost:5432`   | `localhost:3001` |
| Inside the API container | `postgres:5432`    | —                |
| Inside another container | `postgres:5432`    | `api:3001`       |

Inside a container, `localhost` is *that container*. `DATABASE_HOST=localhost`
in the API container produces `ECONNREFUSED` against its own loopback.
`docker-compose.yml` therefore sets `DATABASE_HOST: postgres`.

The same applies to demo targets: the seeded URLs are
`http://demo-healthy:8081/health`, not `http://localhost:8081/health`, because
the API resolves them from inside the Compose network.

```bash
docker compose exec api env | grep DATABASE_HOST
```

---

## 12. CORS or 401 loops in the browser

- `CORS_ORIGIN` on the API must exactly match the origin serving the web app
  (scheme, host and port).
- `NEXT_PUBLIC_API_URL` is inlined at **web build time**. Changing it requires
  rebuilding the web image, not just restarting it.
- A `401` clears the stored token and bounces to `/login`. If that happens
  immediately after signing in, the API's `JWT_SECRET` most likely changed
  between issuing and verifying the token.
