# Interview notes

Each topic has four parts: a plain-language answer, a technical answer, how
this project actually uses it, and a question you are likely to be asked.

---

## Health check

**Simple answer.** A small request that asks a service "are you working?" and
expects a quick, cheap answer.

**Technical answer.** An endpoint with no side effects, low cost and a
predictable status code, polled by an external system or an orchestrator. Its
value comes from being cheap enough to call constantly and specific enough that
a `200` genuinely means "usable".

**How this project uses it.** Two ways round: PulseWatch *performs* health
checks against configured targets, and it *exposes* its own at
`GET /api/v1/health` and `/health/ready`.

**Likely question.** *Why not just check that the process is running?* Because
a process can be alive and useless — connection pool exhausted, disk full,
dependency unreachable. Liveness answers "is it running", readiness answers "can
it serve".

---

## Liveness

**Simple answer.** Is the process alive at all?

**Technical answer.** A probe that should fail only when the process is
unrecoverable, because the standard reaction is a restart. It must not depend on
downstream services — otherwise a database blip restarts every replica at once
and turns a partial outage into a total one.

**How this project uses it.** `GET /api/v1/health` returns
`{ status: 'ok', uptimeSeconds }` and touches nothing else. It is the Docker
healthcheck for the API container.

**Likely question.** *What happens if you put a database check in liveness?*
A database outage makes every replica fail liveness, restart in a loop, and
never recover even after the database comes back.

---

## Readiness

**Simple answer.** Is this instance ready to take traffic right now?

**Technical answer.** A probe covering the dependencies needed to serve
requests. Failing readiness removes the instance from the load-balancer pool but
does not restart it, so it can recover on its own.

**How this project uses it.** `GET /api/v1/health/ready` checks two things:
`SELECT 1` against PostgreSQL, and whether the scheduler registered its
interval. It returns `503` with a body naming the failing check.

**Likely question.** *Should a monitoring tool report itself unhealthy when a
monitored target is down?* No — and this codebase comments on that explicitly. A
monitored endpoint being `DOWN` is the product working correctly. Mixing that
into readiness would take the monitor out of rotation exactly when it is most
needed.

---

## Uptime

**Simple answer.** The share of checks that succeeded over a period.

**Technical answer.** Here it is sample-based:
`successfulChecks / totalCompletedChecks * 100` over a bounded window. It is not
duration-weighted availability, and the difference is material at low sampling
rates.

**How this project uses it.** `MetricsService.getUptime` with `COUNT(*) FILTER
(WHERE status = 'SUCCESS')`. Zero samples returns `null` — rendered as "no
data", never as 100%. The sample count is always shown next to the percentage.

**Likely question.** *Your target shows 100% uptime but it was down for 30
seconds. Why?* A 60-second interval cannot observe a 30-second outage that falls
between two successful checks. Sample-based uptime is bounded by sampling
resolution; duration-weighted SLA accounting needs a different data model.

---

## Latency

**Simple answer.** How long the request took.

**Technical answer.** Wall-time from request start to response headers,
measured on a monotonic clock so a clock adjustment cannot corrupt it. It spans
DNS, TCP, TLS and time-to-first-byte.

**How this project uses it.** `process.hrtime.bigint()` in
`CheckEngineService`, stored as `latencyMs`. Failures are excluded from latency
statistics on purpose — a 5000 ms timeout measures the timeout setting, not the
service.

**Likely question.** *Why `hrtime` instead of `Date.now()`?* `Date.now()` is
wall-clock and can jump backwards on an NTP correction, which yields negative
or absurd durations. `hrtime` is monotonic.

---

## p50 / p95

**Simple answer.** The middle response time, and the response time that 95% of
requests beat.

**Technical answer.** Order statistics over the latency distribution. The mean
is misleading for latency because the distribution has a long right tail: a
handful of 3-second responses barely move the average but are exactly what users
notice.

**How this project uses it.** PostgreSQL `PERCENTILE_DISC(0.5)` and
`PERCENTILE_DISC(0.95)` — the *discrete*, nearest-rank definition, so the value
returned is one that was actually observed rather than an interpolation.
`nearestRankPercentile` implements the same definition in TypeScript for tests.

**Likely question.** *Why no p99?* p99 over five samples is just the worst
sample. The project reports average, p50 and p95 and always displays the sample
count, rather than printing a statistic the data cannot support.

---

## HTTP status codes

**Simple answer.** A number saying how the request went.

**Technical answer.** 2xx success, 3xx redirection, 4xx client error, 5xx server
error. "Healthy" is not a synonym for 200 — a `204`, a `301` or an authenticated
`401` can all be the correct, expected answer for a given endpoint.

**How this project uses it.** Each target carries
`expectedStatusMin..expectedStatusMax`, defaulting to `200-399` so a redirect is
not automatically a failure. Anything outside the configured range is recorded
as `INVALID_STATUS`.

**Likely question.** *Why is the default range 200-399 rather than just 200?*
Because many real health endpoints redirect, and hard-coding 200 would report a
working service as down.

---

## DNS

**Simple answer.** Turning a hostname into an IP address.

**Technical answer.** A hierarchical, cached lookup. Its two properties that
matter here are that it can be slow or fail independently of the target
(`ENOTFOUND`, `EAI_AGAIN`), and that the answer can change between two lookups —
which is what makes DNS rebinding attacks possible.

**How this project uses it.** `errorType: DNS` is a distinct classification
from `CONNECTION`. More importantly, the destination IP is validated **at
connect time** through a guarded `lookup` handed to undici, not only when the
target is created.

**Likely question.** *You validated the IP when the target was saved. Why check
again?* Because the attacker controls the nameserver. It can answer with a
public IP during validation and `169.254.169.254` a minute later. Only the
address actually dialled matters.

---

## TCP timeout

**Simple answer.** Giving up when a connection takes too long.

**Technical answer.** Several distinct timeouts hide behind one word: connect
timeout (SYN unanswered), headers/read timeout (connected but silent), and an
overall deadline. Without an overall deadline, a slow-drip response can hold a
worker open indefinitely.

**How this project uses it.** `timeoutMs` per target (default 5000). The engine
derives `headersTimeout`, `bodyTimeout` and an `AbortSignal.timeout` from the
*remaining* budget on each hop, so redirects cannot extend the total beyond
`timeoutMs`.

**Likely question.** *What happens if you only set a connect timeout?* A server
that accepts the connection and then sends nothing holds the socket forever.
That is the classic Slowloris shape, and it is why a read timeout and a total
deadline both matter.

---

## Scheduler

**Simple answer.** The part that decides when work runs.

**Technical answer.** A coordinator that periodically selects due work, rather
than a timer per work item. Decoupling tick frequency from per-item cadence
keeps the number of timers constant as the number of items grows, and makes
adding an item a pure data change.

**How this project uses it.** One `setInterval` registered once in
`SchedulerService.onModuleInit`. Each tick queries for targets whose
`last_checked_at + interval_seconds` has elapsed, then runs them in batches of
`MAX_CONCURRENT_CHECKS`.

**Likely question.** *Why not one cron job per target?* 500 targets would mean
500 timers to create, cancel and reconcile on every edit, and a restart would
have to rebuild all of them. A due-query is one timer and survives restarts for
free.

---

## Cron

**Simple answer.** Run this at a fixed time.

**Technical answer.** Calendar-based scheduling (`0 3 * * *`) as opposed to
interval-based (`every 15 seconds`). Cron suits infrequent, time-of-day work;
intervals suit continuous polling. Cron in an application process is also
per-process, unlike system cron.

**How this project uses it.** Exactly one cron expression, for retention:
`@Cron(CronExpression.EVERY_DAY_AT_3AM)` in `RetentionService`. Checking is
interval-driven; pruning is calendar-driven.

**Likely question.** *When would cron be the wrong tool?* When the work is
"every N seconds relative to the last run". Cron fires on absolute times, so a
job that overruns either overlaps itself or skips, and it has no concept of per
item cadence.

---

## Background job

**Simple answer.** Work that happens without a user waiting for it.

**Technical answer.** Work decoupled from the request lifecycle. The hard parts
are not "run it later" but failure handling, overlap prevention, visibility and
idempotency.

**How this project uses it.** Two: the check tick and the daily retention
prune. Both guard against overlap, both catch and log their own failures so one
bad run cannot kill the timer, and the scheduler exposes `lastTickAt` through
the readiness probe so it can be observed.

**Likely question.** *How do you know a background job is still running?*
Expose its last-run timestamp and alert on staleness. A job that silently stops
is worse than one that fails loudly — this project surfaces
`lastSchedulerTickAt` in `/health/ready` for that reason.

---

## Race condition

**Simple answer.** Two things happening at once, and the result depends on the
order.

**Technical answer.** Unsynchronised concurrent access to shared state. Here the
shared state is a target row: two concurrent checks could interleave their
read-modify-write of `consecutiveFailures` and open two incidents or lose a
count.

**How this project uses it.** `TargetLockService` gives per-target mutual
exclusion in-process, so the scheduler and a manual `check-now` can never run
together for the same target; the loser gets `409`. The read-decide-write of
counters and incident state runs inside one transaction, and a partial unique
index enforces "one active incident per target" at the database level as a
backstop.

**Likely question.** *Your in-process lock — does it work with two replicas?*
No, and the code says so. It is a `Set` in one process. With replicas you need a
database advisory lock, `SELECT ... FOR UPDATE SKIP LOCKED`, a Redis lock, or a
single worker.

---

## Transaction

**Simple answer.** A group of database writes that all happen or none do.

**Technical answer.** ACID: atomicity, consistency, isolation, durability.
Atomicity is what matters most here — it prevents partially applied multi-table
state changes.

**How this project uses it.** One check produces up to four writes: insert
`check_results`, update `monitor_targets`, insert or update `incidents`, insert
`audit_events`. `CheckRunnerService.persist` wraps all of them in
`dataSource.transaction`.

**Likely question.** *What breaks without the transaction?* A crash between
writes leaves a target marked `DOWN` with no incident, or an incident whose
triggering check result was never stored. The dashboard then shows a state the
data cannot explain.

---

## Incident

**Simple answer.** A record that something was broken, from when to when.

**Technical answer.** A durable state machine over a symptom: opened on a
threshold, acknowledged by a human, resolved on recovery. Its value is that it
survives the raw samples that produced it.

**How this project uses it.** `OPEN → ACKNOWLEDGED → RESOLVED`, opened at
`FAILURE_THRESHOLD` consecutive failures, resolved automatically at
`RECOVERY_THRESHOLD` consecutive successes. Retention prunes check samples but
**never** incidents.

**Likely question.** *Why not open an incident on the first failure?* Because
most single failures are transient — one dropped packet, one deploy restart. The
`DEGRADED` state records the symptom without declaring an outage, which is the
difference between a useful alert and alert fatigue.

---

## SSRF

**Simple answer.** Tricking a server into fetching a URL it should not fetch.

**Technical answer.** The server makes the request from inside the trust
boundary, so an attacker-supplied URL can reach internal admin panels, private
subnets and cloud metadata endpoints that hand out credentials.

**How this project uses it.** Four layers: scheme/credential/length validation,
IP range classification with `ipaddr.js` (allowlist of `unicast` only),
connect-time re-validation via a guarded DNS lookup, and per-hop redirect
validation. `ALLOW_PRIVATE_TARGETS` defaults to `false`.

**Likely question.** *Is your SSRF defence complete?*
[SSRF_DEFENSE.md](./SSRF_DEFENSE.md) says no, and lists five residual gaps —
no per-connection IP pinning, internal services on public ranges, timing side
channels, IPv6 transition mechanisms, and the fact that each redirect hop
re-resolves. The correct production answer is these checks *plus* network-level
egress filtering.

---

## Redirect

**Simple answer.** The server telling you the thing is somewhere else.

**Technical answer.** A 3xx with a `Location` header. For a security-sensitive
fetcher the danger is that validation applies to the URL you supplied, while the
request that actually happens is to a URL the *target* chose.

**How this project uses it.** The HTTP client's automatic redirect following is
disabled (`maxRedirections: 0`). Hops are followed manually so every one runs
through the full SSRF policy again, capped at `maxRedirects` (default 3), with
`followRedirects` off by default.

**Likely question.** *Why not let the HTTP library follow redirects?* Because
then only the first URL is validated. A redirect to `http://169.254.169.254/`
would be followed by the library before any of your checks run.

---

## Docker network

**Simple answer.** A private network where containers find each other by name.

**Technical answer.** A user-defined bridge network with an embedded DNS
resolver, so service names resolve to container IPs. Published ports are a
separate concern — they expose a container to the *host*, not to its peers.

**How this project uses it.** One `pulsewatch` bridge network. The API reaches
PostgreSQL at `postgres:5432` and the demo fixtures at `demo-healthy:8081`.
Because those are private IPs, the demo overlay must enable
`ALLOW_PRIVATE_TARGETS` — which is exactly why that flag exists and why it is
confined to an overlay file.

**Likely question.** *Why does the API use `postgres` but your browser uses
`localhost`?* They sit on different networks. The browser reaches published
ports on the host; the API resolves service names inside the bridge network.

---

## localhost

**Simple answer.** "This machine" — and inside a container that means the
container, not your laptop.

**Technical answer.** The loopback interface, scoped to a network namespace.
Each container has its own, so `127.0.0.1` in the API container cannot reach
PostgreSQL in another container.

**How this project uses it.** `docker-compose.yml` sets
`DATABASE_HOST: postgres`. Loopback is also the single most-blocked destination
in the SSRF policy, since `http://127.0.0.1:5432/` is the canonical SSRF probe.

**Likely question.** *Your app works locally but `ECONNREFUSED` in Docker.
Why?* Almost always `DATABASE_HOST=localhost` carried over from a local `.env`
into a container, where it points at the container's own empty loopback.

---

## PostgreSQL index

**Simple answer.** A lookup structure so the database does not read every row.

**Technical answer.** Usually a B-tree. Column order in a composite index
matters: it serves queries that filter on a prefix of its columns. Indexes cost
write throughput and disk, so they are added for known query shapes, not
speculatively.

**How this project uses it.**

```text
check_results (target_id, checked_at)   -- per-target history and metrics
check_results (status, checked_at)      -- fleet-wide success counts
incidents     (target_id, status)       -- active-incident lookup per target
incidents     (target_id) WHERE status <> 'RESOLVED'  -- partial UNIQUE
monitor_targets (status), (enabled)     -- dashboard counts, due-target query
```

**Likely question.** *Why `(target_id, checked_at)` and not two separate
indexes?* Every metrics query filters by target *and* a time window. One
composite index serves that directly; two single-column indexes would force a
bitmap combination and read far more rows.

---

## Retention

**Simple answer.** Deleting old data on purpose.

**Technical answer.** A bounded-growth policy. Time-series monitoring data grows
linearly and forever, so a retention window is a design requirement, not
housekeeping.

**How this project uses it.** `CHECK_RETENTION_DAYS` (default 30), a daily
prune at 03:00 plus a manual CLI. Only `check_results` are pruned; incidents are
kept, because they are the small, durable record of what happened.

**Likely question.** *How much data does this actually produce?* A 60-second
interval is 1,440 rows/day/target, ~43,200 per 30 days, so 10 targets reach
~432,000 rows in a month. That is the number that forces indexes, pagination,
bucketed charts and retention — and a real system would add downsampling to
rollup tables on top.

---

## Horizontal scaling

**Simple answer.** Adding more instances instead of a bigger one.

**Technical answer.** It works cleanly for stateless request handling and badly
for anything holding process-local state or assuming exclusivity. Scheduled work
is the classic example of the second category.

**How this project uses it.** The API's request handling is stateless and would
scale fine. The **scheduler would not**: every replica's tick selects the same
due rows, and the in-process lock does not coordinate across processes, so
checks duplicate and uptime denominators inflate. This is documented rather than
glossed over.

**Likely question.** *How would you fix it?* Cheapest correct fix: claim due
targets with `SELECT ... FOR UPDATE SKIP LOCKED` inside the transaction, so only
one replica can own a target per tick. Alternatives: leader election so one
replica schedules, or move checks onto a real worker queue — which is the right
answer once check volume outgrows one process anyway.

---

## Distributed lock

**Simple answer.** A lock that works across several machines.

**Technical answer.** Mutual exclusion with no shared memory. Every
implementation must handle expiry (the holder can die), fencing (a stale holder
must not be able to act after losing the lock), and clock skew. Redlock's
weaknesses are a standard discussion point.

**How this project uses it.** It does not — and that is the point. v1 uses an
in-process `Set` and documents the limitation explicitly rather than implying
the design scales. The nearest practical upgrade in this stack is a PostgreSQL
advisory lock or `SKIP LOCKED`, since the database is already the shared
dependency and adding Redis for one lock is not justified.

**Likely question.** *Why not just add Redis?* It is another stateful service to
run, monitor and back up, for a guarantee PostgreSQL already provides here.
Introduce it when there is a second reason — caching, queues, pub/sub — not for
one lock.
