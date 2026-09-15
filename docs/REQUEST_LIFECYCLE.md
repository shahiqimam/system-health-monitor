# Request lifecycle

Traced with real class and file names. Two paths matter: a scheduled check, and
an authenticated API read.

## A. Scheduled check

```text
scheduler tick
 -> due target
 -> SSRF validation
 -> HTTP request
 -> CheckResult
 -> threshold logic
 -> incident state
 -> dashboard query
```

### 1. Tick

`SchedulerService.onModuleInit` registers one interval named
`pulsewatch-check-tick`
(`apps/api/src/scheduler/scheduler.service.ts`). Every
`SCHEDULER_TICK_SECONDS` it calls `SchedulerService.tick()`. If the previous
tick is still running, this one returns immediately.

### 2. Due-target selection

`SchedulerService.findDueTargets()` queries `monitor_targets` for rows that are
enabled, not archived, not `PAUSED`, and whose
`last_checked_at + interval_seconds` has elapsed. Results are processed in
batches of `MAX_CONCURRENT_CHECKS`.

### 3. Lock

`CheckRunnerService.runForTarget(targetId, null)` calls
`TargetLockService.tryAcquire(targetId)`
(`apps/api/src/checks/target-lock.service.ts`). A `false` return means a manual
check is already in flight; the scheduler skips the target this tick.

### 4. SSRF validation

`CheckEngineService.checkTarget(target)`
(`apps/api/src/checks/check-engine.service.ts`) calls, in order:

- `UrlValidatorService.parseAndValidateSyntax(target.url)` — scheme,
  credentials, length.
- `UrlValidatorService.assertDestinationAllowed(url)` — pre-flight DNS
  resolution and range classification via
  `apps/api/src/checks/ssrf/ip-policy.ts`.

Failures throw `BlockedTargetError` and become a `BLOCKED_TARGET` result.

### 5. HTTP request

`CheckEngineService.sendOnce` issues the request through the shared `undici`
`Agent` whose `connect.lookup` is
`UrlValidatorService.createGuardedLookup()` — the address is re-validated at
connect time. Timeouts derive from the remaining budget. The body is dumped
with a 64 KB cap and discarded. Redirects, if enabled, loop back to step 4 for
each hop.

### 6. Result construction

The engine returns a `CheckExecutionResult`
(`apps/api/src/checks/check-engine.types.ts`): status, `httpStatus`,
`latencyMs`, `errorType` from `classifyNetworkError`
(`apps/api/src/checks/error-classifier.ts`), a sanitized `errorMessage`,
`checkedAt` and `redirectCount`.

### 7. Threshold logic

`CheckRunnerService.persist` opens a transaction, loads any incident for the
target with `status != RESOLVED`, and calls the pure function
`computeHealthTransition` (`apps/api/src/checks/health-state.ts`) with the
current counters, the result and the configured thresholds.

### 8. Persistence and incident state — one transaction

```text
INSERT check_results
UPDATE monitor_targets   (status, counters, lastCheckedAt, lastSuccess/FailureAt)
INSERT incidents         if decision.shouldOpenIncident
UPDATE incidents         if decision.shouldResolveIncident
INSERT audit_events      INCIDENT_OPENED / INCIDENT_RESOLVED (null actor)
COMMIT
```

`AuditService.record` (`apps/api/src/audit/audit.service.ts`) joins the same
transaction and swallows its own failures so auditing can never break the
operation it describes.

### 9. Dashboard query

The next browser poll hits `DashboardController`
(`apps/api/src/dashboard/dashboard.controller.ts`), which delegates to
`DashboardService` and `MetricsService`
(`apps/api/src/metrics/metrics.service.ts`) for the aggregate SQL described in
[UPTIME_CALCULATION.md](./UPTIME_CALCULATION.md).

## B. An authenticated API read

```text
GET /api/v1/targets/:id/metrics?window=24h
```

1. **Helmet + CORS** — configured in `apps/api/src/main.ts`; only
   `CORS_ORIGIN` may call the API from a browser.
2. **`ThrottlerGuard`** — global 120 requests/minute, tightened to 10/min on
   login and 20/min on `check-now`.
3. **`JwtAuthGuard`** (`apps/api/src/common/guards/jwt-auth.guard.ts`) — every
   route is protected unless decorated `@Public()`. `JwtStrategy.validate`
   re-reads the user from the database, so a deleted or role-changed account
   cannot keep acting on a still-valid token.
4. **`RolesGuard`** (`apps/api/src/common/guards/roles.guard.ts`) — compares
   the user's role against `@Roles(...)` metadata; a mismatch throws `403`.
5. **`ValidationPipe`** — global, with `whitelist`, `forbidNonWhitelisted` and
   `transform`. `MetricsQueryDto` rejects any window other than `24h/7d/30d`;
   `ParseUUIDPipe` rejects a malformed id with `400`.
6. **Controller to service to SQL** — `TargetsController.metrics` confirms the
   target exists, then `MetricsService.getTargetMetrics` runs four aggregate
   queries in parallel.
7. **`AllExceptionsFilter`**
   (`apps/api/src/common/filters/all-exceptions.filter.ts`) — converts anything
   thrown into `{ statusCode, error, message, path, timestamp }`. Unexpected
   errors are logged with their stack server-side and reported to the client as
   a bare `500`; driver and resolver internals never reach the response.

## C. Manual check-now

`POST /targets/:id/check-now` differs from the scheduled path in exactly four
ways: it is throttled (20/min), it requires `OPERATOR` or `ADMIN`, it records a
`MANUAL_CHECK_REQUESTED` audit event with a real actor id, and it returns `409`
if the target is paused, archived, or already being checked. Everything from
step 4 onward is the identical code path — there is no separate "manual"
engine.
