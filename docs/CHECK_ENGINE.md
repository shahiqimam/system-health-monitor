# Check engine and scheduler

## Two separate concerns

| Concern                  | Class                  | File                                          |
| ------------------------ | ---------------------- | --------------------------------------------- |
| *When* to check          | `SchedulerService`     | `apps/api/src/scheduler/scheduler.service.ts`  |
| *How* to perform a check | `CheckEngineService`   | `apps/api/src/checks/check-engine.service.ts`  |
| What to persist          | `CheckRunnerService`   | `apps/api/src/checks/check-runner.service.ts`  |
| State decision           | `computeHealthTransition` | `apps/api/src/checks/health-state.ts`      |

## Scheduler tick vs target interval

The scheduler is **not** one cron job per target. It is one interval that asks
a question:

```ts
setInterval(() => void this.tick(), SCHEDULER_TICK_SECONDS * 1000);
```

Each tick selects *due* targets:

```sql
WHERE enabled = true
  AND archived = false
  AND status <> 'PAUSED'
  AND (last_checked_at IS NULL
       OR last_checked_at <= now - (interval_seconds * INTERVAL '1 second'))
ORDER BY last_checked_at ASC NULLS FIRST
LIMIT 500
```

So `SCHEDULER_TICK_SECONDS` (default 15) is the *resolution* of scheduling,
while `intervalSeconds` (per target, minimum 15) is the actual cadence. A
60-second target is checked on roughly every fourth tick. The consequence is
that a target's real interval is `intervalSeconds` rounded up to the next tick
boundary — deliberate, and far cheaper than per-row timers.

Adding a new target does not require restarting or re-registering anything: the
next tick simply finds a row whose `last_checked_at` is `NULL`.

## Concurrency limit

```env
MAX_CONCURRENT_CHECKS=10
```

Due targets are processed in batches of that size with `Promise.allSettled`, so
one hung endpoint cannot stall the others and 200 due targets cannot open 200
sockets at once. A tick that is still running when the next one fires is
skipped (`this.ticking` guard) rather than overlapping.

## Per-target mutual exclusion

`TargetLockService` holds an in-process `Set` of target ids being checked.
Both the scheduler and `POST /targets/:id/check-now` must acquire the lock, so
a manual check can never race the scheduled one for the same target. A manual
check that loses the race gets `409 Conflict`.

## Executing one check

`CheckEngineService.checkTarget(target)` does, in order:

1. **Validate URL syntax** — scheme, credentials, length (`UrlValidatorService`).
2. **Pre-resolve and validate the destination** against IP policy.
3. **Send the request** through a shared `undici` `Agent` whose `connect.lookup`
   is a guarded lookup that re-validates the address at connect time.
4. **Enforce the timeout** — `headersTimeout`, `bodyTimeout` and an
   `AbortSignal.timeout` all derive from the *remaining* budget, so the whole
   operation including redirects fits inside `timeoutMs`.
5. **Handle redirects manually** — `maxRedirections: 0` on the client; each
   `Location` is re-validated with the same SSRF rules before the next hop.
6. **Measure latency** with `process.hrtime.bigint()` (monotonic, unaffected by
   wall-clock adjustments).
7. **Inspect the status** against `expectedStatusMin..expectedStatusMax`.
8. **Classify the failure** into the `CheckErrorType` enum.
9. **Return bounded diagnostics** — no stack traces, error message capped at
   200 characters.

The engine performs no database access and never touches incidents.

## Response bodies are discarded

The monitor needs a status code and a duration, nothing more. Bodies are
drained with `response.body.dump({ limit: 64 * 1024 })` so the socket can be
reused and a multi-gigabyte response cannot exhaust memory. No response body
is ever stored.

## Error classification

| `CheckErrorType`  | Typical cause                                             |
| ----------------- | --------------------------------------------------------- |
| `TIMEOUT`         | `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_CONNECT_TIMEOUT`, abort |
| `DNS`             | `ENOTFOUND`, `EAI_AGAIN`                                   |
| `CONNECTION`      | `ECONNREFUSED`, `ECONNRESET`, `EHOSTUNREACH`               |
| `TLS`             | `CERT_*`, `ERR_TLS_*`, `SELF_SIGNED_*`                     |
| `INVALID_STATUS`  | Response outside the configured expected range             |
| `REDIRECT_LIMIT`  | More hops than `maxRedirects`                              |
| `BLOCKED_TARGET`  | Refused by SSRF policy (scheme, credentials, IP range)     |
| `UNKNOWN`         | Anything unclassified — also logged as a warning           |

The classifier walks the `cause` chain up to four levels deep, because undici
wraps socket errors inside a generic outer error.

## Result storage and state transition

`CheckRunnerService.persist` runs a single transaction:

```text
BEGIN
  SELECT active incident for target
  INSERT check_results
  UPDATE monitor_targets (status, counters, lastCheckedAt, lastSuccess/FailureAt)
  INSERT incidents          -- only if the threshold was just crossed
  UPDATE incidents          -- only if recovery just completed
  INSERT audit_events
COMMIT
```

If any write fails the whole thing rolls back, so the database can never hold a
target marked `DOWN` with no incident, or an incident with no corresponding
check result.

## Single-instance limitation

> If multiple API replicas run the scheduler, checks can duplicate unless a
> distributed lock, leader election or a worker queue is introduced.

Concretely, with two replicas:

- Both ticks select the same due rows, because "due" is computed from
  `last_checked_at`, which is only written *after* the check completes.
- `TargetLockService` is a process-local `Set` and does not coordinate across
  processes.
- The result is duplicate samples, which inflates the denominator of uptime and
  can cross the failure threshold twice as fast.

Fixes that would work, none of which are implemented here: a PostgreSQL
advisory lock or `SELECT ... FOR UPDATE SKIP LOCKED` claim per target, a Redis
lock, leader election, or moving checks onto a dedicated worker queue.
