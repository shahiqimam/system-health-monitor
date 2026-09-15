# Demo services

Two throwaway HTTP fixtures used by the `demo` Compose profile so the
monitoring demo never depends on a third-party internet endpoint.

| Service        | Port | Behaviour                                              |
| -------------- | ---- | ------------------------------------------------------ |
| `demo-healthy` | 8081 | `GET /health` always returns 200                       |
| `demo-flaky`   | 8082 | `GET /health` returns 200 or 503, toggled via `/admin` |

Toggle the flaky service from the host:

```bash
curl http://localhost:8082/admin/fail   # start returning 503
curl http://localhost:8082/admin/heal   # back to 200
curl http://localhost:8082/admin/state  # current state
```

These are test fixtures, not production architecture. They live on the Docker
network in private IP space, which is why the demo profile sets
`ALLOW_PRIVATE_TARGETS=true`. Never enable that outside a trusted local lab.
