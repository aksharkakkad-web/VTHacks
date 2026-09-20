# Route safety evidence sidecar

`src/lib/decision-client/safety-evidence.ts` adds a pure public-evidence response for
the app's explanation panel. It joins validated existing snapshot inputs and
mapped route conditions. It does not fetch sources, change the recommendation,
draw a map, book transport, or receive student identity, GPS or contact details.
The trip integration owns attaching this additive response to its existing API.

## Integration contract

```ts
buildSafetyEvidence({
  corridorId: "eggleston-pritchard",
  evaluatedAt, // Server-captured, timezone-qualified ISO instant.
  expectedRouteVersion, // The mapped walking candidate's sourceVersion.
  routeConditions, // Existing routeConditions(corridorId, Date.parse(evaluatedAt)).
  campusDatasets, // Partial object of existing loadDataset(name) results.
});
```

Supported IDs are `newman-pritchard`, `eggleston-pritchard` and
`downtown-pritchard`. The last has no supported mapped walking geometry. Load each
snapshot once at the server boundary, then pass it here. Missing or invalid
datasets remain explicitly unavailable. An invalid corridor or evaluation time
throws; no external action is performed. No changes to `CandidatePlan`,
`Recommendation`, permissions or provider APIs are needed.

The response has `schemaVersion: "beacon-safety-evidence-v1"` and includes:

- `coverage`, `freshness` and `sourceProvenance`: what was captured, when, source
  URLs and hashes, normalized dataset versions and source coverage limitations.
- `routeSource` and `routeVersion`: mapped geometry provenance kept separate from
  public dataset file versions; `routeSource.validUntil` includes any shorter
  construction-derived route deadline.
- `hardBlocks`: independently bounded walking-closure and severe-weather flags,
  applicable only to walking-only travel, with a validity deadline and matching
  closure IDs. `null` means no established block, not a confirmed clear route.
- `incidents`: imported publication-row count, exact named-endpoint matches,
  source links, reported dates and dispositions. A match is not a crime along the
  full path. Unknown route coverage returns a null match count, not zero.
- `lighting` and `activity`: clearly labeled community and historical context;
  measured route coverage remains null. Show the returned OpenStreetMap
  attribution whenever presenting its layer.
- `warnings`, `missingSignals`, and an unavailable `routeExposureScore`.

`confidence: "partial"` means some validated context exists; it is not statistical
confidence, current-condition certification or an assessment that travel is safe.
`historical_snapshot` means the imported source can be viewed as captured context;
even a newly downloaded 2015 pedestrian study is not current activity. Similarly,
`current_snapshot` means a file is within the source freshness policy; consult
`weather.status` for whether its time window actually covers the request.

## Checks before a block can be returned

The builder validates schema, bounded records, HTTPS provenance, source hashes,
non-future timezone-qualified capture times, normalized dataset versions and row
source membership. Crime manifests mark the beginning of a multi-document import,
so individual PDF capture times may be later than the manifest; both must precede
the evaluation time. Hash syntax and row-to-manifest hash membership are checked;
the trusted importer/loader owns verification against captured source bytes. The
builder never renews source validity merely because another file
has a newer packaging timestamp.

A walking closure additionally requires:

1. Supported, internally consistent route geometry, captured less than seven days
   ago, with the requested corridor and the walking candidate's exact map version.
2. An official VT Facilities closure snapshot and source captures less than one
   hour old, with explicit source start/end dates covering the evaluation instant.
3. An actual geometry intersection between that line and an official closure
   area. An unrelated road delay cannot stand in for a pedestrian closure.

The closure expires at the earliest relevant source, closure-end or map-validity
deadline. No overlap returns null. A missing or mismatched walking version prevents
applying the closure to a candidate. A precomputed `blocked: true` field in input
conditions cannot manufacture a block; intersections are recomputed from the
validated dataset. The original two mapped campus corridors intersected source
area 20306 in the September 19 captured data. New route versions are independently
rechecked; this builder never invents a detour around a closure.

If route metadata contains `construction_avoidance`, an applied derivation is
usable only from its `evaluated_at` through (but excluding) `valid_until`. Its
shorter deadline also caps route evidence and any closure block. Expired
construction-derived geometry is not displayed as currently supported merely
because the original pathway source is less than seven days old.

Weather must come from NWS, belong to the same named corridor, have a valid context
version and issue/validity interval, and remain within the 24-hour source/issue
limits. Only a current `severe` condition produces the severe-weather block.
Expired, absent or malformed weather stays unknown. Weather is a campus-area
forecast, not a sensor reading on every segment. This sidecar's signals must still
be passed through the existing evaluator; displaying the sidecar alone does not
prove SQL eligibility or trip integration occurred.

## Why the numerical exposure score is null

All current responses return `routeExposureScore: null`,
`scoreStatus: "unavailable"`, and an explanation of the missing evidence. There is
no implemented measured-exposure formula or threshold in this version. Merely
filling `known_meters` in a route object cannot create a score: that field has no
measurement timestamp, survey method or independently verified segment provenance.
The existing route parser still enforces length bounds and consistent totals.

The [VT Police publications](https://police.vt.edu/crime-stats/crime-logs.html)
provide partial reported history, including dispositions; they are not an
occurrence census or route safety probability. The imported
[OpenStreetMap assertions](https://www.openstreetmap.org/copyright) do not measure
illumination or current lamp operation. The
[USDOT-hosted pedestrian study](https://rosap.ntl.bts.gov/view/dot/34766) describes
2015 site observations, without verified exact matching to these walking paths.
These inputs support honest context but do not meet measured route coverage.

Future scoring needs an explicitly reviewed measurement contract with segment
boundaries, same-route version, observation times, units, source provenance and
minimum measured coverage. It would remain an exposure index, never a probability
of being harmed. This implementation makes no fabricated measurements, live people
counts or observed provider history. The separate provider-outcomes work may later
supply verified provider performance; it is not inferred from public crime data.

## Verification

Run `node databricks/run.mjs test`. The builder's 12 tests exercise actual imported
datasets, fresh official intersection, same-route/version checks, unsupported
geometry, expiry, old source bytes in newly packaged snapshots, malformed and
future metadata, false precomputed flags, severe weather, report provenance,
disposition retention, construction-derived geometry expiry and missing
measurements. Synthetic intersection and severe-weather cases prove policy behavior, not an
assertion that severe weather existed during the demo.

Data collection and refresh procedures remain in
[public campus evidence](PUBLIC_CAMPUS_EVIDENCE.md). This file documents a local
backend contract; deployment and live Databricks evidence must be established by
the integrated team flow.
