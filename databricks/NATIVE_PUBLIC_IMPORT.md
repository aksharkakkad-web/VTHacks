# Expanded public evidence: native import

This imports Mahin's checked-in public research bundle into the existing Beacon Databricks schema. It does not fetch student data, change ranking, provision compute, schedule recurring work or deploy the app.

```sh
node databricks/native-public-import.mjs
# Existing authorized workspace/profile; explicit cloud write:
DATABRICKS_HOST=https://YOUR-WORKSPACE.cloud.databricks.com node databricks/native-public-import.mjs --apply --profile YOUR-PROFILE
# Require completed tables and actual SQL/audit behavior:
node databricks/run.mjs evidence --live --initialize-outcomes --profile YOUR-PROFILE
```

The evidence command also requires the usual non-secret host/warehouse configuration. `--initialize-outcomes` creates the empty outcome table; it never inserts simulated observations. Its zero-history assertion is specific to this initial demo setup, not a monitor for a future populated production table.

The script validates the chosen OAuth profile against the host, reuses the bounded public-bundle validator, and generates a content-addressed notebook. It submits one 15-minute-bounded serverless job, with no retries and an idempotency token. Submission is **not success**: inspect `databricks jobs get-run RUN_ID --profile YOUR-PROFILE` and its task output. No credentials are embedded in the notebook.

Four insert-only Delta tables:

- `public_research_snapshots`: complete JSON bytes split into reconstructable parts with hashes/provenance.
- `public_research_items`: addressable JSON items and their source pointers, also hashed.
- `public_evidence_records`: typed dataset/record/source/capture envelope and original record JSON.
- `public_research_imports`: completion marker written last, after preceding merge/count checks pass.

Consumers must join to the completion marker for the exact import ID. Older or partially imported versions are retained, never silently treated as the newest completed evidence. JSON archives preserve source references/hashes; this job does not copy the original crime PDFs into Databricks. Seven current normalized datasets contain 2,067 records: crime719, lighting1,179, activity4, construction14, emergency equipment65, notices20 and weather66. Counts describe a snapshot, not real-time completeness.

`node --test databricks/native-public-import.test.mjs databricks/public-evidence.test.mjs` checks bundle identity, exact row counts, generated Python syntax and failure-before-completion behavior. See [live evidence](../docs/DATABRICKS_LIVE_EVIDENCE.md) for the actual run.

## Refresh the practical walking demo

Before a later demo, refresh official construction/weather, rebuild the dated detour, and upload the small route table:

```sh
python3 databricks/ingest/public_sources.py --datasets closures,weather
python3 databricks/ingest/route_data.py --offline --avoid-construction
node databricks/run.mjs setup --data-only --datasets route-evidence --apply --profile YOUR-PROFILE
```

The route retains the map's original capture time; a new calculation cannot make old geometry fresh. Construction validity lasts at most one hour from its actual source capture and can end sooner when an area date changes. Expired detours are omitted until refreshed; neither repeated trip requests nor an old cloud route renews them. Restart the local server/rebuild a deployed app to consume changed checked-in research snapshots. Re-run the native import to archive the new research bundle; the exact-import acceptance command expects the currently checked-in bundle to be loaded.

The separate existing native refresh job maintains managed weather/transit/phones/fare, **not these construction-derived route files**. No new recurring automation is implied by these commands.
