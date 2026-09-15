# Uptime and latency calculation

## The formula

```text
uptimePercent = successfulChecks / totalCompletedChecks * 100
```

Implemented in `apps/api/src/metrics/uptime.ts` and executed in SQL by
`MetricsService`:

```sql
SELECT COUNT(*)                                   AS total,
       COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successful
FROM check_results
WHERE target_id = $1
  AND checked_at >= $2   -- window start
  AND checked_at <= $3   -- now
```

## Worked examples

```text
98 successes / 100 completed checks  = 98.00%
397 successes / 400 completed checks = 99.25%
2 successes / 3 completed checks     = 66.67%   (rounded to 2 decimals)
0 successes / 12 completed checks    = 0.00%
0 checks in the window               = null     ("no data")
```

## Rules this implementation follows

1. **Only checks that exist are counted.** The denominator is the number of
   rows in the window, never a theoretical number derived from the interval.
2. **Time before monitoring began is never counted as uptime.** A target
   created an hour ago shows uptime over that hour's samples, not 24 hours of
   assumed health.
3. **No samples returns `null`, not 100% and not 0%.** The UI renders that as
   "no data". A fresh target must not look perfect.
4. **The sample count is always displayed** next to the percentage, so the
   reader can judge whether the number means anything.

Example rendering from the dashboard and target list:

```text
99.25% uptime (397 successful / 400 checks)
```

## Windows

| Window | Span     | Chart bucket |
| ------ | -------- | ------------ |
| `24h`  | 24 hours | 1 hour       |
| `7d`   | 7 days   | 6 hours      |
| `30d`  | 30 days  | 1 day        |

Buckets are chosen so a chart never exceeds about 30 points regardless of
window, using

```sql
to_timestamp(floor(extract(epoch from checked_at) / :bucket) * :bucket)
```

There is no "all time" chart. With a 60-second interval a single target
produces ~43,200 rows per 30 days; an unbounded chart would be both useless and
expensive.

## Why this is an approximation

Sample-based uptime is **not** duration-weighted availability, and the two can
disagree substantially.

- A target on a 60-second interval that is down for 20 seconds between two
  successful checks records **no failed sample at all** — 100% by this metric,
  99.98% by duration.
- Conversely, one failed sample on a 60s interval is read by most people as a
  full minute of unavailability, when the real outage might have been one
  dropped packet.
- Resolution is bounded by the check interval. A 60-second interval cannot
  observe anything shorter than 60 seconds.
- The vantage point is a single container. A network fault between PulseWatch
  and the target is recorded identically to the target being down.

Real SLA accounting also requires maintenance windows, planned-downtime
exclusions, multi-region probes and an agreed measurement contract. **None of
that exists here**, so PulseWatch does not claim SLA/SLO compliance.

## Latency

Measured with `process.hrtime.bigint()` — monotonic, so an NTP adjustment
mid-request cannot produce a negative or wildly wrong duration. The timer spans
DNS, connection, TLS and time-to-headers for the whole operation, including any
redirect hops.

Latency is stored for successful checks, and for failures where a duration is
known (for example, the elapsed time before a timeout).

### Statistics

Only successful checks with a non-null latency feed the statistics:

```sql
AVG(latency_ms)                                          AS avg,
PERCENTILE_DISC(0.5)  WITHIN GROUP (ORDER BY latency_ms) AS p50,
PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
```

**Exact method:** `PERCENTILE_DISC` is the *discrete* / nearest-rank
percentile, so p95 is always a latency value that was actually observed, not an
interpolation between two samples. `nearestRankPercentile` in
`apps/api/src/metrics/uptime.ts` implements the same definition in TypeScript
and is unit-tested.

Failures are excluded on purpose: a 5000 ms timeout is not a "slow response",
and mixing it in would make p95 a measure of the timeout setting rather than of
service latency.

### Why no p99

p99 needs roughly 100+ samples before it stops being "the single worst sample",
and several hundred before it is stable. A 24-hour window on a 60-second
interval gives 1,440 samples — enough — but a freshly created target gives
five. Rather than render a number that is statistically meaningless at small
sample sizes, PulseWatch reports average, p50 and p95, and always shows the
sample count beside them.
