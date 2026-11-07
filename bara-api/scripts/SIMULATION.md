# Synthetic ingestion

Results use seed-based random draws: visible/absent/uncertain flames and smoke, smoke colors and origins, wooded-setting clarity, single/multiple/unknown burning materials, suppression methods, actor counts and roles, frame locations, relative depth and distance-reference availability. Failures can affect one criterion independently or the entire observation. Dependent fields remain consistent. Peat stays unconfirmed because the criterion does not allow a stronger conclusion. Changing `--seed` changes the mix; keeping the same seed reproduces it. To refresh results of an existing completed batch in place, use the load command with `--refresh-results --write`. This preserves session IDs, positions, timestamps and media, and regenerates summaries and follow-ups from the updated results using the batch's stored configuration.

The simulator writes fixture sessions, snapshots, private PNG media, structured criterion results and the existing follow-up summaries into the local BARA storage. It makes no AI calls. This exercises downstream database reads, timelines and dashboard polling; it bypasses the witness upload endpoint and image analysis.

Default: 100 sessions, 12 observations each, 20 shared scenarios near illustrative Indonesian coordinates. These are invented locations and events, not reports of actual fires. Scenario types include woodland, grass, waste, buildings and smoke-only. Observations move through reported, active, suppression and monitoring phases, with changing witness positions, obscured views and unavailable analyses. Monitoring never establishes extinguishment. Synthetic images are striped placeholders, not evidence photos.

Run from `bara-api` in PowerShell. The existing API image must be built and the `bara-data` services running. The image provides dependencies and compiled follow-up logic. Existing database criteria are validated before writing. New unsupported criteria are marked unavailable rather than fabricated.

```powershell
# Preview without any database connection or writes.
node scripts/simulate-ingestion.mjs

# Load a named batch into the local storage.
docker run --rm --network bara-data --env-file .env --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" bara-api-api node scripts/simulate-ingestion.mjs --batch=bara-demo-v1 --write

# Verify every session and observation through API reads and dashboard session counts,
# plus a private image through the dashboard proxy.
docker run --rm --network bara-data --env-file .env --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" bara-api-api node scripts/verify-simulation.mjs bara-demo-v1

# A separate streaming batch: 60 simulated seconds per wall-clock second.
docker run --rm --network bara-data --env-file .env --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" bara-api-api node scripts/simulate-ingestion.mjs --batch=bara-replay-v1 --mode=replay --sessions=20 --captures=12 --speed=60 --write

# Remove only the named synthetic batch, including its media.
docker run --rm --network bara-data --env-file .env --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" bara-api-api node scripts/simulate-ingestion.mjs --batch=bara-demo-v1 --cleanup --write

node --test scripts/simulation-data.test.mjs
```

Options use `--name=value`: `batch`, `seed`, `sessions`, `captures`, `start` (ISO timestamp), `interval-seconds`, `mode` (`batch` or `replay`), `speed`. `--write` is required for mutation. Maximum 100,000 observations per run. Use fixed `--seed` and `--start` for repeatable data; batch-scoped IDs avoid collisions between runs. Reusing a batch is rejected. After interruption, remove that batch before retrying. Database/media writes are not transactional; cleanup also removes orphan media in that batch's dedicated prefix.

Replay inserts observations by simulated arrival time, starts sessions as active and ends them when replay completes. It preserves scenario timestamps; accelerated replay uses a simulated clock, so timestamps may be ahead of wall time. Dashboard polling remains five seconds. Batch mode loads historical data, defaulting to one hour ago. Large custom capture intervals may extend beyond the present; choose `--start` accordingly.

All generated sessions/snapshots have `synthetic: true`, `simulationBatchId`, and `incidentId`. `simulation_runs` records configuration and completion; `simulation_incidents` stores shared scenario metadata and `groundTruthOrigin`. Snapshot `simulation.phase` is scenario truth, not an AI conclusion or verified operational fire status. The standard `location` remains witness GPS; `groundTruthOrigin` is kept separate. Some observations explicitly include a synthetic supplied map reference in `simulation.suppliedMappedTarget`: only those may report an estimated horizontal map distance. The result explains its coordinate source rather than claiming a distance inferred from the image. Without a reference, distance remains relative or not determinable.

The existing dashboard displays sessions, witness positions, synthetic messages and criterion results. Its seven-item availability checklist remains an unconnected placeholder. Incident correlation, a fire-position map and operational status aggregation are subsequent features; this dataset is input for developing them.
