# Official public crime-log import

The importer captures the **2026 Blacksburg publication section** of the [Virginia Tech Police daily-log index](https://police.vt.edu/crime-stats/crime-logs.html), for January through the September 19, 2026 capture. It excludes the separate DC/Innovation and Carilion documents. The publication section is not a geographic boundary: some listed locations are off campus or study abroad.

The captured documents contain **720 published rows across 9 PDFs and 79 pages**. The normalized artifact has **719 rows**; one incomplete source row is quarantined with its original cells in the manifest. Coverage is deliberately `partial`. These are historical reported-log rows, not a count of crimes that occurred, an alert feed, a conviction record, or a safety metric.

| Published month | PDF pages | Accepted rows | Quarantined rows |
| --- | ---: | ---: | ---: |
| January | 7 | 68 | 0 |
| February | 13 | 110 | 0 |
| March | 12 | 112 | 0 |
| April | 12 | 108 | 0 |
| May | 6 | 57 | 1 |
| June | 3 | 19 | 0 |
| July | 2 | 17 | 0 |
| August | 10 | 94 | 0 |
| September | 14 | 134 | 0 |

The index was captured at `2026-09-19T13:48:55.773751Z`; each PDF has its own capture time and SHA-256. Of the accepted rows, 713 have printed reported dates inside January 1–September 19, 2026, and 6 lie outside that range. The most recent valid reported date within the scope is September 17. Publication completeness does **not** establish coverage through September 19. No missing row or date means “no crime.”

## Artifacts and replay

- `data/campus/research/crime-records-2026.json`: one object per accepted published row. It preserves the case number, multiline offense, public location, printed dates and times, full disposition history, source URL, one-based page(s), PDF hash, capture time, extraction method, coverage note, and date-quality flags.
- `data/campus/research/crime-manifest-2026.json`: scope, per-document and per-page row accounting, hashes, counts, coverage, gaps, and limitations.
- `data/campus/research/crime-source-index-2026.json`: retained official index HTML and its hash.
- `data/campus/research/crime-2026-MM.pdf.gz` and `crime-2026-MM-source.json`: byte-exact original PDFs compressed with gzip, and metadata. SHA-256 applies to the **decompressed original PDF**, not the gzip file. Archives total approximately 5.8 MB.

From the repository root, using Python with `pdfplumber` installed:

```bash
python3 databricks/ingest/public_crime.py --as-of 2026-09-19
python3 -m unittest discover -s databricks/ingest -p test_public_crime.py -v
```

The default command replays retained source bytes without network requests and verifies hashes. `--refresh` fetches the official index and its linked PDFs before replacing this bounded snapshot. Use `--output /path/to/new-snapshot` to keep a refresh separate. Only HTTPS `police.vt.edu` URLs matching the Blacksburg filename pattern are selected; source requests have timeouts and a size limit. A partial import writes the usable records and exact gaps, then exits **2**; a complete published-document extraction exits **0**. The checked-in source currently produces exit 2 by design.

The script does not modify `incident-reports.json`, app runtime code, Databricks tables, credentials, or the existing 12-row sample. A consumer should treat `report_id` as non-unique and use `record_id` for each published row. Do not silently overwrite historical disposition versions or combine multiple offenses into an invented incident count.

## Known source limitations

May page 1 publishes case **2026-8058** twice. The first row has blank occurrence-time and disposition cells; the later row is populated and has slightly different printed location/date text. The first row's seven original cells remain in `manifest.gaps`, including the blanks. The importer does not fill those blanks from the later row or collapse the two source rows. This source gap prevents a complete-coverage claim.

The accepted dataset contains 717 distinct case numbers; two case numbers appear in two accepted rows each. Multiplicity text such as `X 6` and multiple offense lines remains as printed. There are 17 rows with date-quality flags and 7 rows whose disposition history includes `Unfounded`. An anomalous printed reported date of `03/30/3036` is preserved and flagged; a two-digit occurrence year `04/16/26` stays in the raw field with a null normalized occurrence date. Reversed or later-than-reported occurrence dates are preserved and flagged. **Do not replace source values with plausible guesses.**

The VT index explains that fields may be withheld, statuses may be updated, and crime-log definitions differ from annual Clery-report statistics. These captured rows should not be joined to annual totals as if they were the same measure. No victim identities, inferred coordinates, geocoding, danger scores, or predicted safety claims are added.

## Extraction and verification

The parser uses PDF words positioned under the seven printed columns. It accounts for wrapped cells and page continuations; the shaded table backgrounds are unsuitable for default rectangle-based table extraction. It supports the centered date heading in earlier months, shifted January conduct rows, the July graphic letterhead, numeric and alphanumeric case IDs, and duplicate case IDs. Unknown headers, missing months/pages, unexpected cells, and incomplete rows produce explicit gaps.

Verification included visual inspection of September page 1, July page 2, and May page 1; the May blank cells were checked in the rendered source. An independent per-page scan of case tokens reconciled all **720** source rows against accepted rows plus quarantined cells. The regression suite covers multiline fields, page boundaries, duplicate IDs, wrapped IDs, malformed/reversed/future dates, missing/unrecognized cells, actual January/July PDF formats, and missing-month/page coverage. This verifies the captured format, not all possible future PDF layouts.
