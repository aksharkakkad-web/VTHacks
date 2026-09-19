# Bounded native campus refresh

Installed in the existing Free Edition workspace and live-tested September 19,
2026. Job ID **1118599535446767**, notebook
`/Shared/Beacon/refresh-public-data-v2`. Final reviewed notebook run
**748744025713625** completed **SUCCESS** (task run **57174209832663**).
The finite schedule is enabled: every six hours through the hackathon, with
all fetching/writes stopping at **September 20, 16:00 UTC (noon Eastern)**.
This is periodic public-data refresh, **not real-time emergency monitoring**.

```sh
databricks jobs get-run 748744025713625 --profile beacon --output json
databricks jobs run-now 1118599535446767 --no-wait --profile beacon
```

`refresh-job.json` is the reproducible job configuration, not a command to
create a duplicate. Use this existing job for manual reruns. To pause it,
update its schedule's `pause_status` to `PAUSED`, preserving the other settings.

Build a self-contained Python notebook from the reviewed importer and native
Delta runner (no workspace mount, pip package, token, or student data):

```sh
python3 databricks/jobs/build_notebook.py /tmp/beacon_refresh.py
python3 -m unittest discover -s databricks/jobs -p 'test_*.py'
```

Upload the generated Python source as a Databricks workspace notebook. Manually
run its single cell on serverless Spark, or call `refresh(spark)` in that notebook.
The job must use existing `workspace.beacon` Delta tables, with the additive
`route_context.valid_from TIMESTAMP` migration first. It writes typed MERGEs
for hourly NWS context (next at most 24 hours), six local service dates of
scheduled BT departures (yesterday through four days ahead, retaining
`>24:00` overnight trips), mapped VT public emergency phones, parsed public
weather/GTFS/phone/fare snapshots and source provenance. Feed versions on
departures end with `:` plus the first 12 characters of the current GTFS
source SHA-256; readers must filter to the matching `source_manifest` hash
because old departures are deliberately not deleted. It does not refresh the
manually reviewed incident facts. `source_manifest` is updated for a source
only after its typed table (and bronze payload where applicable) succeeds.
Any failed source marks the overall job failed and logs `BEACON_REFRESH_FAILED`;
successful independent sources can still update, while old records are never
deleted. An old context remains governed by its original `valid_until`, not
silently renewed. A zero-row emergency-phone layer, missing transit corridor,
stale NWS issue time, or changed fare policy fails closed for that source.

Job settings are manager-owned. Use one concurrent serverless run, timeout at
most 600 seconds, no retries, and a finite Quartz schedule such as
`0 0 0,6,12,18 19,20 9 ? 2026` in UTC. The notebook itself skips all work
from `2026-09-20T16:00:00Z`; therefore the September 20 18:00 scheduled slot
does not fetch/write. Seven of the eight theoretical slots fall before cutoff
(earlier slots may already have elapsed when deployed). Disable/delete the
job after judging as an additional cost-control check; do not leave an
unbounded schedule. Free Edition quotas still apply; the live run verified
serverless task availability, not unlimited capacity. The local builder itself
does not upload or run a job.

`route_context.updated_at` records NWS `updateTime` (source issue time);
`valid_from` and `valid_until` delimit each forecast/alert period. The query
must require `valid_from <= evaluation time < valid_until`, plus the existing
24-hour source-issue age check. `context_version` includes both hourly-forecast
and alert-response SHA-256 prefixes; the query must match both current
`source_manifest` hashes so superseded alert slices cannot resurface.
Severe/extreme NWS alerts split hourly periods at onset and expiry;
`active_official_alert` is true only within overlapping slices, otherwise
null, not a claim of no alerts.
The feed is area-level forecast evidence, not observed route conditions.
