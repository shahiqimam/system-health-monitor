# Screenshots

Every image below is a real capture of the running application against the
Compose demo stack. Nothing is a mock-up, and no data was hand-written into the
database to make a chart look better: the incident shown was produced by the
scheduler checking `demo-flaky` after its `/admin/fail` toggle was flipped.

Captured at 1440x900, 2x device scale, with Playwright driving a real Chromium
against `http://localhost:3000`.

## Dashboard

![PulseWatch dashboard](images/dashboard.png)

Summary cards, uptime and latency charts for the selected window, status
distribution, active incidents and recent recoveries. Note that the uptime card
displays its sample count ("22 checks sampled") next to the percentage.

## Target list

![Target list](images/targets.png)

Name, host, status, 24h uptime with sample count, 24h p95 latency, last checked
and last success. Only the host is shown, never the full query string.

## Target detail

![Target detail](images/target-detail.png)

Configuration, uptime and latency statistics for the window, the checks
timeline, recent results and the target's incidents. Operator and admin
controls (check now, pause/resume, archive) appear according to role.

## Incident - open and acknowledged

![Open incident](images/incident-open.png)

A real incident opened by the scheduler after three consecutive failures. The
timeline shows the transition clearly: four `SUCCESS` rows at 200, then
`FAILURE` rows at 503 classified `INVALID_STATUS`. The summary states the
symptom and the page says explicitly that root cause is not inferred.

## Incident - resolved by recovery

![Resolved incident](images/incident-resolved.png)

The same incident after `demo-flaky` was healed and two consecutive successes
were recorded. `resolvedAt` is populated; nobody clicked a "close" button,
because there isn't one.

## Incident list

![Incident list](images/incidents.png)

## New target - server-side SSRF rejection

![New target form with an SSRF rejection](images/target-new.png)

The form submitted `https://user:secret@example.com/health`. Client-side Zod
validation accepts the URL shape, and the **server** refuses it with
`Target URL must not contain credentials`. A credentialed URL is rejected
regardless of `ALLOW_PRIVATE_TARGETS`, which is why it is the honest example to
show here: the demo profile enables private targets, so a link-local URL is
deliberately *accepted* in that configuration.

## Reproducing these

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up --build -d
docker compose exec -T api node dist/database/seed.js
```

Let the scheduler collect samples, then drive the incident:

```bash
curl http://localhost:8082/admin/fail   # three failures at the 30s seeded interval
curl http://localhost:8082/admin/heal   # two successes resolve it
```

Sign in at <http://localhost:3000> as `admin@pulsewatch.local` /
`AdminPass123!`.

## Rules followed

1. Real UI only - no mock-ups, no edited numbers, no hand-drawn charts.
2. No fabricated rows inserted to pad a chart. Sparse charts are left sparse:
   the 24h window buckets hourly, so a short demo genuinely yields few points.
3. Demo data only. No employer hostnames, internal domains, IP addresses or
   incident text appears anywhere.
