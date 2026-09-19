# Public research snapshots in Databricks

`databricks/public-evidence.mjs` previews a versioned import of every JSON document under `data/campus/research`. It is separate from the existing setup script and uses additive tables. **No cloud import has been run or verified for this change.** Local preview, reconstruction, identity, transport-size, provenance, and execution-order tests pass.

```bash
# Read-only local preview; no credentials or cloud calls required.
node databricks/public-evidence.mjs

# Run the standalone regression tests.
node --test databricks/public-evidence.test.mjs

# Explicit cloud write, only after authenticating to the intended workspace.
node databricks/public-evidence.mjs --apply --profile your-chosen-profile
```

The loader follows the existing `.env.local` and environment-variable convention, with process values taking precedence. It reuses `setup.schemaName` to validate the catalog/schema and `build.compileTrack` to load the existing Databricks Statement Execution client. `--apply` requires `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, and either an existing server-side `DATABRICKS_TOKEN` or an explicitly selected OAuth profile. A short-lived CLI OAuth token is kept in memory; this command does not persist or print it. Existing profiles are not guessed. `--directory` selects another local research-snapshot folder.

## Preview result for the captured research bundle

The current snapshot contains 22 JSON documents, 3,029,488 original JSON bytes, 3,510 indexed values, 386 original-file parts, and 3,524 indexed-value parts. The plan contains 282 bounded statements, including schema/table declarations and its final completion marker. These counts describe stored representations, **not** unique real-world events: raw OSM elements and their normalized observations are intentionally separate representations.

The preview includes all 719 accepted crime rows, the quarantined crime row in the crime manifest, 72 weather context records, 72 hourly forecasts, and an explicit empty `alerts` collection. It also includes 1,179 lighting observations, their raw source response and licensing/provenance, four historical pedestrian statistics, 14 closure records, 65 emergency-equipment records, 20 notices, all source lists, notes, limitations, and gaps. The crime source coverage remains partial; a completed database import cannot change that fact.

## Additive tables

| Table | Purpose | Identity |
| --- | --- | --- |
| `public_research_snapshots` | Exact original JSON bytes in base64 parts; per-file SHA-256 and provenance references | Import ID, relative document path, part index |
| `public_research_items` | Root-array entries and each top-level object field/array entry, located by JSON Pointer; large values are split into parts | Import ID, row ID, part index |
| `public_research_imports` | Completion marker and manifest, written only after every preceding statement succeeds | Import ID |

The original files can be reconstructed byte for byte by selecting a single import and document, ordering by `part_index`, decoding each `payload_base64` part, concatenating the resulting **bytes**, and checking `snapshot_hash`. Do not concatenate independent base64 strings before decoding; do not decode individual byte parts as UTF-8 before concatenation. A multibyte character can span a part boundary.

An indexed item uses the same reconstruction process; its decoded bytes are a JSON value and its checksum is `item_hash`. `json_pointer` identifies the value's original location, for example `/hourly/0`, `/gaps/0`, `/sources/0`, or `/0` for the first root-array record. An empty array has its own item, so an empty captured alert list is distinguishable from a missing field. Non-array object values retain their full nested JSON. The original-file representation preserves whitespace and every original field even when the indexed representation has different JSON formatting.

Each row carries a JSON provenance reference to the source document and any companion provenance document. Those full provenance documents are also imported. All direct source fields, source hashes, source capture times, record IDs, status histories, uncertainty notes, and quarantine cells remain in their original JSON. No file is dropped merely because its provenance is incomplete.

## Provenance and completion rules

`provenance_status` is `recorded`, `missing`, `invalid`, or `metadata`. `recorded` means the expected metadata has valid structure; referenced local files are hash-checked when present in the declared provenance. It does **not** certify a current condition, the correctness of every source assertion, or comprehensive source coverage. The loader verifies retained crime PDF bytes against the decompressed PDF hash, checks source-index HTML and companion-file hashes, and propagates a mismatched PDF/hash to records citing that source. Missing or invalid provenance remains explicitly labeled for quarantine. `refresh-status.json` is operational metadata.

Malformed JSON or UTF-8 aborts plan construction before any statements are executed. Symlinked inputs are rejected. Source PDFs and other binary attachments remain local; their paths, byte counts and hashes are recorded in the completion manifest, with `storage: local_source_attachment_not_uploaded`. They are not silently represented as uploaded PDF content.

Readers must select an import ID that exists in `public_research_imports`, then join its snapshot/item rows by `import_id`. If execution fails or reaches its run limit, earlier statements may have inserted parts, but the completion marker is absent. Rerunning the same unchanged bundle resumes the same identities. A completed import means the planned rows were submitted successfully; source-level gaps and uncertainties remain intact. Filter missing/invalid provenance and inspect source coverage before treating a value as evidence.

## Bounds and idempotence

All data values travel in named `:rows` parameters; only identifiers validated by `schemaName` enter SQL text. Each data statement is an insert-only `MERGE`: there are no matched-row updates, deletes, truncations, replacements, or destructive table resets. Existing application tables and the 12-row incident sample are untouched.

The bundle ID hashes the format version and sorted relative paths plus hashes of all local input files. Changing bytes creates a new version and retains older imports. Row IDs derive from document path, file hash, and JSON Pointer, so repeated source case IDs are preserved as distinct published rows. Sequential retries of an identical bundle use the same merge keys. Delta table key uniqueness is not enforced here; avoid concurrent apply processes for the same bundle rather than assuming exactly-once behavior under races.

Limits are 128 JSON files, 32 MB of total local input, 20,000 indexed-value parts, 1,500 statements, 8,192 decoded bytes per payload part, at most 100 rows and approximately 40 KB of row JSON per batch, and under 60 KB for each planned request. Each SQL call is bounded to 60 seconds and the whole apply attempt to 15 minutes. Large documents and fields are split predictably; an oversized manifest or unexpected input fails before cloud execution.

Tests exercise the actual local bundle counts, default CLI preview without credentials, repeatable identities and duplicate source IDs, exact reconstruction across Unicode/escaping boundaries, parameterization, malformed JSON, missing/invalid provenance, local source hash mismatches, statement bounds, and final-marker ordering on success/failure. SQL/cloud behavior still needs a real authenticated run; local tests do not claim it happened.
