# Health model

## Target statuses

| Status     | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `UNKNOWN`  | No verdict yet — the target has never been checked, or was just resumed. |
| `UP`       | The most recent check succeeded and no recovery is pending.              |
| `DEGRADED` | At least one consecutive failure, but fewer than `FAILURE_THRESHOLD`.    |
| `DOWN`     | `FAILURE_THRESHOLD` consecutive failures reached, or recovery pending.   |
| `PAUSED`   | Checks are disabled. The scheduler skips the target entirely.            |

`DEGRADED` exists so that a single transient failure never becomes an outage
incident. It is a *warning*, not an incident.

## Thresholds

Configured globally via environment variables and applied by
`computeHealthTransition`:

```env
FAILURE_THRESHOLD=3     # consecutive failures before DOWN + incident
RECOVERY_THRESHOLD=2    # consecutive successes before UP + incident resolved
```

## State machine

Implemented as a pure function in
`apps/api/src/checks/health-state.ts`.

### On a successful check

```text
consecutiveFailures  = 0
consecutiveSuccesses += 1
lastSuccessAt        = now
```

- If the target is `DOWN` **or** has an active incident, it is *recovering*:
  - `consecutiveSuccesses < RECOVERY_THRESHOLD` → stay `DOWN`, incident stays open.
  - `consecutiveSuccesses >= RECOVERY_THRESHOLD` → `UP`, and the active
    incident (if any) is resolved.
- Otherwise → `UP`.

### On a failed check

```text
consecutiveSuccesses = 0
consecutiveFailures  += 1
lastFailureAt        = now
```

- `consecutiveFailures < FAILURE_THRESHOLD` → `DEGRADED`, no incident.
- `consecutiveFailures >= FAILURE_THRESHOLD` → `DOWN`; open an incident **only
  if none is currently active**.

### Worked example (defaults 3 / 2)

| Check | Result  | consecFail | consecOk | Status     | Incident        |
| ----- | ------- | ---------- | -------- | ---------- | --------------- |
| 1     | success | 0          | 1        | `UP`       | —               |
| 2     | fail    | 1          | 0        | `DEGRADED` | —               |
| 3     | fail    | 2          | 0        | `DEGRADED` | —               |
| 4     | fail    | 3          | 0        | `DOWN`     | **OPEN**        |
| 5     | fail    | 4          | 0        | `DOWN`     | same incident   |
| 6     | success | 0          | 1        | `DOWN`     | still open      |
| 7     | success | 0          | 2        | `UP`       | **RESOLVED**    |

This exact sequence is asserted by `scripts/smoke-test.sh` against the
`demo-flaky` container and by the unit tests in
`apps/api/src/checks/health-state.spec.ts`.

## Incident lifecycle

```text
OPEN ──acknowledge──> ACKNOWLEDGED ──recovery──> RESOLVED
  └──────────────────recovery───────────────────────┘
```

| Transition               | Trigger                                              |
| ------------------------ | ---------------------------------------------------- |
| → `OPEN`                 | Failure threshold reached with no active incident     |
| `OPEN` → `ACKNOWLEDGED`  | `POST /incidents/:id/acknowledge` by OPERATOR/ADMIN   |
| → `RESOLVED`             | Recovery threshold reached (automatic, system actor)  |

**Only one active incident per target.** This is enforced twice:

1. In `CheckRunnerService`, which looks for an incident with
   `status != RESOLVED` before opening a new one.
2. By a PostgreSQL partial unique index:

   ```sql
   CREATE UNIQUE INDEX uq_incidents_one_active_per_target
     ON incidents (target_id) WHERE status <> 'RESOLVED';
   ```

Acknowledging does **not** resolve. Acknowledgement records that a human is
aware; resolution records that the service actually recovered.

## UNKNOWN and PAUSED

- A newly created target is `UNKNOWN` until its first check completes.
- Pausing sets `enabled = false` and `status = PAUSED`. The scheduler's due
  query excludes both, and `POST /targets/:id/check-now` returns `409`.
- **Pausing a DOWN target does not resolve its incident.** The incident stays
  open. After resume, the target returns to `UNKNOWN` with its counters reset,
  and the incident is resolved only once `RECOVERY_THRESHOLD` real successes
  are recorded.
- Archiving sets `archived = true`, disables checks and hides the target from
  the default list. Historical checks and incidents are retained.

## What the model does not claim

PulseWatch observes availability symptoms from one vantage point. It does not
infer root cause, does not distinguish "the service is down" from "the network
path from this container is down", and has no maintenance-window or SLA
calendar accounting.
