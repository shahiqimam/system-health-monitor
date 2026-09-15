# Screenshots

> **Status:** the image files are not committed yet. Everything below is a
> capture guide, not a description of images that exist. Nothing in this
> repository is a mock-up or a rendering — when these are captured they must
> come from a real running stack.

Place captures in `docs/images/` using the file names below, then the README
and this page will render them.

## How to get a stack worth photographing

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up --build -d
docker compose exec -T api node dist/database/seed.js
```

Let it run for 10-15 minutes so the charts have more than a handful of points,
then drive a real incident:

```bash
curl http://localhost:8082/admin/fail   # demo-flaky starts returning 503
# wait for 3 consecutive failures (~90s at the seeded 30s interval)
curl http://localhost:8082/admin/heal   # back to 200
# wait for 2 consecutive successes
```

Sign in at <http://localhost:3000> with `admin@pulsewatch.local` /
`AdminPass123!`.

## Captures to take

| File                       | Page              | Must show                                                                 |
| -------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `dashboard.png`            | `/dashboard`      | Six summary cards, uptime and latency charts with real points, status distribution |
| `targets.png`              | `/targets`        | Both demo targets, mixed statuses, 24h uptime with sample counts, p95      |
| `target-detail.png`        | `/targets/[id]`   | Config panel, uptime/latency charts, recent results table with a mix of SUCCESS and FAILURE |
| `incident-open.png`        | `/incidents/[id]` | An `OPEN` or `ACKNOWLEDGED` incident, its summary, a note, the surrounding checks timeline |
| `incident-resolved.png`    | `/incidents/[id]` | The same incident after recovery: `RESOLVED`, with `resolvedAt` populated  |
| `target-new.png`           | `/targets/new`    | The create form, ideally with the SSRF rejection message visible after submitting a private URL |

Optional but useful:

| File              | Page             | Must show                                        |
| ----------------- | ---------------- | ------------------------------------------------ |
| `swagger.png`     | `/api/docs`      | The generated OpenAPI surface                    |
| `admin-users.png` | `/admin/users`   | The three seeded roles                           |

## Rules

1. **Real UI only.** No mock-ups, no edited numbers, no hand-drawn charts.
2. **Capture after data exists.** A dashboard full of "no data" demonstrates
   nothing except that the window is empty.
3. **Demo data only.** Never capture an employer's hostnames, internal domains,
   IP addresses or incident text. The demo services exist so this is never
   necessary.
4. **Redact nothing after the fact.** If something would need redacting, do not
   capture it.
5. Full browser width, light theme, 2x scale if available.
