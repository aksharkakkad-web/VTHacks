# Journey data refresh

`databricks/refresh-track.mjs` inventories the snapshots consumed by the data track
and refreshes public sources into a separate local review directory. Its default
is read-only status. It never runs Databricks commands, starts a schedule, writes
cloud tables, or replaces `data/campus`. Review and integration of generated local
snapshots belong to the manager; cloud imports and job changes need Akshar's
explicit approval.

## Callable interface and commands

From the repository root, using Node 22 and the existing Python importers:

```sh
# No network requests or writes.
node databricks/refresh-track.mjs
node databricks/refresh-track.mjs --status --at 2026-09-19T22:15:00Z

# Fetch public sources; --out must be a new directory outside the source data tree.
node databricks/refresh-track.mjs --run --out /tmp/beacon-refresh-review

# Bound a refresh to independent datasets, using existing PDF dependencies if needed.
node databricks/refresh-track.mjs --run --out /tmp/beacon-refresh-review-next \
  --datasets weather,closures,transit,lighting,crime \
  --python /path/to/python-with-pdfplumber

# Review the generated data without changing the application data directory.
node databricks/refresh-track.mjs --status --data-root /tmp/beacon-refresh-review

# Import a locally reviewed date-specific hours document into another review directory.
node databricks/refresh-track.mjs --run --out /tmp/beacon-hours-review \
  --datasets waiting --waiting-reviewed /tmp/reviewed-waiting-locations.json

node --test databricks/refresh-track.test.mjs
```

The importable functions are `refreshStatus(dataRoot?, nowEpochMs?)` and
`runRefresh({ output, sourceRoot?, datasets?, python?, waitingReviewed? })`.
`--at` affects status evaluation only; actual refresh capture times always come
from the clock. The full-transit importer starts at yesterday's agency-local date
and indexes 14 service dates, retaining overnight trips after 24:00. A valid
service horizon does not prove there is a departure on every date.

Status returns `beacon-refresh-v1`, evaluated time, dataset capture/expiry/state,
last attempt, and an explicit cloud activation boundary. Run returns `{ report,
status }`; it writes `journey-refresh-status.json` in the review directory after
every source and at completion. A source failure does not stop independent work.
Exit 0 means all requested sources refreshed; exit 1 means a partial/blocked run
or command error. Read-only status exits 0 even when sources are stale: inspect
its states rather than treating command success as data freshness.

Example partial-run record from the actual September 19 verification:

```json
{
  "dataset": "crime",
  "attemptedAt": "2026-09-19T22:14:14.254Z",
  "state": "partial_source_rejected",
  "exitCode": 2,
  "error": "PUBLISHED_DOCUMENT_EXTRACTION_PARTIAL",
  "priorSnapshotRetained": true,
  "diagnostics": {
    "coverage": "partial",
    "extractedRecords": 719,
    "sourceGaps": 1,
    "gapKinds": ["missing_cells"]
  }
}
```

Every importer runs in an isolated temporary directory. Only an exit-0 result is
copied into the new review directory; incomplete crime extraction and fetch
failures retain the prior dataset and its original capture time. A process crash
leaves the report in `running` rather than claiming completion. Generated output
is for review, so it must not be pointed at a running app until the manager has
checked its finished report. Child process output is not copied into status; safe
error codes, exit codes and bounded extraction counts describe failures without
logging credentials. Python tasks have a 180-second bound; the single Overpass
request has a 55-second timeout and 8 MB response bound. No automatic retries or
new dependencies are introduced.

## Coverage and expiry

| Dataset | Repeatable refresh | Freshness and remaining limits |
| --- | --- | --- |
| Weather/alerts | Existing `public_sources.py --datasets weather` | Oldest underlying source capture + 24 hours, source issue age <24 hours, and currently overlapping validity interval. Area forecast; no route observation or all-clear claim. |
| Closures | Existing `public_sources.py --datasets closures` | Oldest source capture + one hour. Source dates and geometric relevance still govern each closure; road delays do not prove pedestrian closure. |
| Full direct transit | Existing `full_transit.py --start-date YYYY-MM-DD --days 14` | Capture +24 hours and requested agency-local date inside the retained service horizon. 297 stops/24 routes in verified feed. Scheduled direct trips; no live arrival or transfer claim. |
| Waiting hours | `--waiting-reviewed FILE` | Must be a current review for the current New York date; expiry is bounded by capture +24 hours and latest published closing. Each place/leg still obeys its own closing time. Official rendered pages need human/agent review; retrieval alone does not renew hours. |
| Mapped lighting | Bounded, existing Overpass query | Map capture +7 days is an inventory review threshold, not lamp-operating freshness. Retains each object's original edit timestamp, ODbL attribution and `community_unverified` labels. New relation shapes or partial responses fail for review. |
| Published crime logs | Existing `public_crime.py --refresh` | Historical evidence has no live expiry. Source recheck due after 24 hours is separate from occurrence/report dates. Complete-document parsing is required to replace prior data; published missing cells remain a source limitation. |
| Measured illumination | Static retained source | January–March 2026 observations remain historical permanently. No refresh rewrites this file, collection windows or operating-status claim. A newer measured source requires reviewed evidence. |

The Python interpreter selected by `--python` must already contain `pdfplumber`
for crime extraction. `PYTHON_PDFPLUMBER_UNAVAILABLE` blocks that dataset before
fetching any PDFs; other sources continue. On this machine, the existing bundled
runtime at
`/Users/aksharkakkad/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`
has the dependency. System `python3` does not. No installation was performed.

The reviewed waiting file uses the existing `data/campus/waiting-locations.json`
schema. Copy that file, review official hours and exceptions for the target date,
and update its dates, hours and capture method. The importer validates source
URLs and place IDs against the existing sites, keeps reference coordinates and
indoor evidence unchanged, and requires access/pickup permission fields to remain
null. It cannot turn a published schedule into verified access or authorized
pickup. A closure/exception should be represented honestly in the reviewed
records; omit unavailable sites rather than inventing hours. New sites or access
claims require a separate reviewed contract change.

This runner does not rebuild walking paths, refresh provider offers, or produce
navigation instructions. Weather/closures are the research files read by the
journey evidence loader; it does not rewrite older `route-context.json` or the
legacy corridor-departure files. The existing native job continues to maintain
its separate legacy Delta datasets.

## Actual verification on September 19, 2026

Read-only cloud checks used the repository-configured `beacon` profile and the
existing job. Databricks CLI was v1.17.0. Commands:

```sh
databricks jobs get 1118599535446767 --profile beacon --output json
databricks jobs list-runs --job-id 1118599535446767 --limit 1 --profile beacon --output json
```

The job was **UNPAUSED**, with the existing finite UTC schedule
`0 0 0,6,12,18 19,20 9 ? 2026`, notebook
`/Shared/Beacon/refresh-public-data-v2`, and 600-second timeout. Latest periodic
run **931752416693874** started **18:00:04 UTC**, finished **18:06:23 UTC**, and
reported **SUCCESS**. The checked-in notebook's cutoff remains September 20 at
16:00 UTC. No job was started or changed by this verification. This existing job
covers hourly weather, legacy two-corridor departures, phones and fares; it does
not activate this new full-transit/research refresh.

Live public-source refresh produced a local review dataset at
`/tmp/beacon-refresh-review-20260919-final`. This is a temporary verification
artifact. After explicit manager authorization, its verified weather, closure,
full-transit and lighting files were promoted to canonical local `data/campus`
paths. Crime, measured lighting and waiting files were checked byte for byte and
retained unchanged. Canonical status at **22:17 UTC** confirmed weather/closures,
transit and mapped lighting current under the thresholds above; this was not a
cloud deployment:

| Source | Actual result |
| --- | --- |
| Weather | 69 forecast/context rows; captured `2026-09-19T22:11:46.469213Z`. Evaluated current interval expired at 23:00 UTC; later intervals retain their own deadlines. |
| Closures | 14 records; bundle captured `2026-09-19T22:11:47.898298Z`; oldest source expiry `2026-09-19T23:11:47.362Z`. |
| Full transit | 297 stops, 24 routes, 3,658 trips, 74,301 stop times and 10,456 service-trip entries. Captured `2026-09-19T22:11:48.589125Z`, service September 18–October 1. |
| Mapped lighting | 1,179 observations: 54 lamps and 1,125 lit-tag objects. Captured `2026-09-19T22:13:01.620Z`, OSM base `22:11:14Z`; original edit timestamps preserved. An initial HTTP 406 was resolved by supplying the explicit public-research User-Agent, now included in the runner. |
| Crime | Real source refresh/extraction returned 719 rows and one `missing_cells` gap; recorded partial and retained prior history. No fixture substitution. |
| Waiting | Retained existing three-site September 19 review, captured 17:08:35 UTC. New review was explicitly blocked as `MANUAL_HOURS_REVIEW_REQUIRED`; no dates were silently renewed. |
| Measured lighting | Original historical file retained byte for byte. |

Checks: **12/12** refresh-runner tests; **73/73** importer tests with bundled
Python; **6/6** native job tests; **7/7** full-transit native generator tests and
**3/3** public native import tests; targeted ESLint passed without warnings. The
initial importer suite under system Python had three missing-`pdfplumber` errors;
rerunning in the existing configured-capable runtime resolved those errors.
Tests cover independent source failure, history preservation, source-vs-bundle
expiry, weather issue time, transit service horizon, reviewed-hours constraints,
HTTP failures, dependency blockers and no response/credential leakage in status.

## Remaining activation and integration

The smallest cloud activation step is Akshar's approval for the manager's exact
reviewed import/job change. This tool deliberately offers no cloud activation
flag. Current native import commands and readback requirements remain in
[the native import runbook](../databricks/NATIVE_PUBLIC_IMPORT.md) and
[full transit native data](DATABRICKS_FULL_TRANSIT_NATIVE.md).

Before a later demo, refresh expiring weather/closures, review that date's waiting
hours and exceptions, and run status against the data directory the app actually
loads. For the crime gap, review the published incomplete row if a more complete
extract is required; a refetch alone cannot supply withheld/missing fields.
Mahin's provider offer/booking refresh and Rishit's rendering integration remain
outside this refresh module. These results establish local public-data refresh
and existing-job status, not complete app integration or live pickup access.

### Prepared cloud imports and same-source transit recapture

These commands prepare local imports without uploading or executing them:

```sh
node databricks/native-public-import.mjs
node databricks/full-transit-native.mjs --output /tmp/beacon-full-transit-recapture-reviewed.py
node --input-type=module - <<'JS'
import { buildNativePublicImport } from './databricks/native-public-import.mjs';
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/beacon-public-refreshed.py', buildNativePublicImport().notebook, { flag: 'wx' });
JS
```

Use new output filenames on repeat runs; the generators refuse overwrite. The
weather/closures/mapped-lighting/historical-crime bundle preview after local
promotion produced import ID
`fca0c86559f4425e3bb7461fb14ab2bdc63789f0b1be2e34f38bb0a92195f051`.
Waiting hours retain their separate local contract and have no approved native
waiting-hours table; no cloud schema is silently introduced for them.

The fresh GTFS ZIP hash remains
`aed7634f4df2e942f1af101c24d05f53e2b8686013f0bbe843b0e1c8dd34dd85`,
but its recapture is later and the local service index now covers September 18–
October 1, including yesterday for overnight service. The previous cloud import
covered September 19–October 2. The generated native notebook now supports this
case without changing source identity or deleting prior service dates:

- Stop/route/trip/time/service rows remain insert-only and keyed by source hash.
- It verifies exact stored values against the authenticated ZIP-derived rows.
  Service counts are checked inside the newly declared service horizon, so older
  retained service dates cannot cause a false count mismatch.
- Only after all normalized tables pass, it conditionally updates the archive
  capture manifest, then the completion marker's capture time and service dates.
  A newer capture is required for metadata updates; an older run cannot roll back
  metadata. The completion marker remains last.
- Failed row insertion/validation cannot renew the existing completion marker.
  This is a prepared and locally tested notebook; no recapture metadata update
  was executed in Databricks during this task.

The refreshed public bundle and transit capture/horizon therefore require an
approved cloud import and readback before cloud/local parity can be claimed.
The existing scheduled job does not execute these two generators.

## Completed waiting-hours review

At 2026-09-19T22:27:30.888824Z, the manager reviewed the rendered official Student Centers calendar for September 19 and the University Libraries September 14–20 table. Squires showed 09:00–23:00, Newman 09:00–22:00, and Graduate Life Center 10:00–22:00 local time. The separate GLC football-home-game exception remains explicitly unresolved. Access and provider-pickup permissions remain null. The reviewed file passed `--datasets waiting --waiting-reviewed` and was promoted to canonical local data; the earlier `MANUAL_HOURS_REVIEW_REQUIRED` attempt is resolved for September 19. Future dates still require their own review. No cloud write occurred.
