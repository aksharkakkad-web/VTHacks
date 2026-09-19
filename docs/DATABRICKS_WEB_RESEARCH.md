# Bounded public-source research

`src/integrations/databricks/web-research.ts` provides an opt-in server function for
checking official public sources. It retrieves original pages and returns their
metadata and content hashes. It does not turn web prose or search snippets into
route facts, feed a model, alter SQL ranking, or run automatically for every trip.

## Current workspace capability

On September 19 the team's workspace endpoint inventory contained 11 endpoints
covering GPT OSS, Qwen, Llama, Gemma and embeddings. None matched the supported
Gemini/OpenAI GPT-5 web-search models described in the
[Databricks web-search documentation](https://docs.databricks.com/aws/en/machine-learning/model-serving/web-search).
Native Databricks runtime web search is therefore not configured in this build.
No additional model, search vendor, paid service, credentials or environment
variables are enabled by this module. Recheck availability before adding a native
provider; do not label the direct-source reader as Databricks model web search.

## Contract and privacy

```ts
await researchPublicCampusSources({
  corridorId: "eggleston-pritchard",
  topic: "crime",
});
```

Only two input fields are accepted. Corridors are `newman-pritchard`,
`eggleston-pritchard` and `downtown-pritchard`. Topics are `crime`, `lighting`,
`activity`, `closures`, `notices`, `weather` and `transit`. Unknown or additional
fields cause validation failure before any network or search call. No identity,
coordinates, home address, trip ID, trusted contact or arbitrary query is accepted.
Downtown is a public research scope, not a claim of mapped walking coverage.

The default adapter uses fixed pages already documented by the project's imports:

| Topic | Direct official sources |
| --- | --- |
| Crime | VT Police daily logs and crime-alert listing |
| Lighting | Public VT Facilities utility GIS catalog |
| Activity | USDOT landing page for the historical Blacksburg study |
| Closures | VT Facilities closure-layer metadata and campus-impacts listing |
| Notices | VT Police alerts and campus-impacts listing |
| Weather | NWS hourly forecast and alerts for the fixed public campus reference point |
| Transit | BT notices, fare information and Virginia DRPT's GTFS directory |

The NWS reference point is the preexisting public campus point; it is not derived
from a student request. Fetches omit cookies and referrers and carry no account
tokens. Source URLs are fixed or validated leads, never user-provided URLs.

An optional server-injected `SearchProvider` implements:

```ts
search({ query, maxResults, signal }): Promise<readonly { url: string }[]>
```

The query is built internally from the enum's public place names and fixed topic
terms. The provider returns leads only. Snippets, titles or generated answers from
discovery are ignored; each accepted URL must be retrieved independently. No
provider is configured by default. Empty or failed search returns an explicit gap,
without inventing findings or silently asserting coverage.

## Retrieval and provenance

Each call permits at most three sources, two redirects per source, 500,000 response
bytes per source and an eight-second total deadline. URL length is capped at 2,048
characters, path length at 1,024, query length at 512, query keys at 64 and values
at 256, with at most eight parameters. Server tests may lower the deadline; callers
cannot raise it above the bound. No recursive crawling, authentication attempts,
PDF extraction or automatic retry loop is added.

Every initial URL and redirect must use HTTPS, no embedded credentials or custom
port, and an exact approved official hostname. Lookalike domains and off-domain
redirects are rejected. Approved domains are explicitly listed in code: VT Police,
VT Facilities/GIS/news, BT, NWS, USDOT and Virginia DRPT. A source redirect cannot
expand that list. Protected, failed or unsupported pages stay unavailable; this
adapter does not bypass access controls.

`sources` contains the final URL, original lead URL, underlying page title,
retrieval time, available publication/modified/generated timestamp and its kind,
SHA-256 of the retrieved bytes, byte count, `page_metadata_only` extraction label
and a coverage warning. Source timestamps after the retrieval clock are not
accepted. A timestamp is metadata, not proof of an active hazard. The returned
envelope is the provenance record for a caller to inspect or separately persist;
this module has no database writes or automatic storage.

No raw body text, snippets or instructions leave the reader. Title/timestamp are
untrusted page metadata for display, never model instructions. `rankingEligible`
is always `false`. Before an actual fact can affect a recommendation, a dedicated
structured importer must verify its location, time validity, units, source and
coverage under the existing data contract.

## Validation and remaining boundary

Ten tests cover rejection of private/extra fields before network calls, fixed
official sources, public-only queries, ignored search snippets, actual page hash
and metadata, URL bounds, off-domain redirects, approved redirects, explicit
empty/failure gaps, response byte/format/source limits and a hung provider deadline.
They run as part of `node databricks/run.mjs test`.

The tests use controlled responses and do not prove external availability. The
manager's direct-source live check records actual reachable pages separately.
Reading an index does not complete a crime, lighting or activity dataset, and this
module does not claim to have solved the missing measured-route evidence listed in
[the safety sidecar contract](DATABRICKS_SAFETY_EVIDENCE.md).
