# Deployment evidence

## Target

The selected submission target is **Local Docker** using `Dockerfile` and
`docker-compose.yml`. The image is multi-stage: its build stage runs
`npm run harness:verify`, compiles TypeScript, and copies only production
dependencies and `dist/` into the unprivileged runtime image. The container
publishes port 3000 and exposes a `/health` health check.

## Deploy

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health
```

Demonstrate the governed feature:

```bash
curl -X PATCH http://localhost:3000/api/activities/bulk-status \
  -H "authorization: Bearer token-alice-associate" \
  -H "content-type: application/json" \
  -H "x-correlation-id: deployment-demo-1" \
  -d '{"taskIds":["task_1","task_2","task_nope"],"targetStatus":"DONE"}'
```

Expected: HTTP 200 with both `updated[]` and `failed[]`; the unknown ID has a
stable error code and rule identifier. Use identifiers returned from the
seeded application if the fixed sample IDs differ.

## Verified evidence

On 2026-09-28, `npm run harness:verify` passed with:

- gate self-test: 5/5 fixtures, F1-F4 all detected;
- gate verdict: PASS, 0 blocking and 4 advisory findings;
- typecheck: PASS;
- tests: 101/101 PASS;
- coverage: 93.22% lines, above all specification thresholds.

On the same date, `npm run smoke` built the service, started a real server on
port 3100, and passed 33/33 HTTP checks. It demonstrated partial success,
typed 400/401/409/422 errors, audit-visible updates, the SHIFT_HANDOVER alert
and report recomputation through the event bus, and end-to-end correlation IDs.
The archived console evidence is
`.harness/reviews/2026-09-22-shift-handover-bulk-status/smoke-run.txt`.

## Submission evidence status

Docker is not installed on the workstation used for this build. Therefore the
Dockerfile and Compose definition have been reviewed but the container has not
been executed here, and no container screenshot is claimed. The local
real-server smoke run is valid application evidence but does **not** replace
the programme requirement for a screenshot of `docker compose ps` plus the
successful endpoint response. Capture that screenshot on a Docker-enabled
machine before final submission and place it at
`docs/evidence/docker-bulk-status.png`, then update this section with the run
date and image reference.

## Stop and clean up

```bash
docker compose down
```
