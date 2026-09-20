"""Bounded, auditable import of VT's published Blacksburg monthly crime logs.

No geocoding, risk calculation, victim enrichment, or application table mutation.
Run --refresh to fetch official sources; subsequent runs replay retained PDF bytes.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
from collections import Counter
from datetime import date, datetime, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

INDEX_URL = "https://police.vt.edu/crime-stats/crime-logs.html"
METHOD = "pdfplumber-positional-columns-v1"
NOTE = ("Published Blacksburg monthly log row, not a crime occurrence census or a "
        "safety measure. Dates, offense wording, and disposition history are retained "
        "as published; source data may be incomplete, delayed, or erroneous.")
FIELDS = ["report_id", "reported_date", "offense", "location", "occurrence_dates",
          "occurrence_times", "disposition"]
CASE_START = re.compile(r"^(?:\d{4}-\d+|\d{8,}|IR\d+)(?:-\d+)*-?$")
CASE_FULL = re.compile(r"^(?:\d{4}-\d+|\d{8,}|IR\d+)(?:-\d+)*$")
DATE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def discover_pdfs(html, year, through_month):
    """Accept the exact Blacksburg filenames linked by the official index only."""
    links = {}
    pattern = re.compile(rf"^/content/dam/police_vt_edu/crime-logs/{year}/file_{year}(\d{{2}})\.pdf$")

    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            if tag != "a":
                return
            href = dict(attrs).get("href", "")
            url = urllib.parse.urljoin(INDEX_URL, href)
            parsed = urllib.parse.urlparse(url)
            match = pattern.fullmatch(parsed.path)
            if parsed.hostname == "police.vt.edu" and match and 1 <= int(match[1]) <= through_month:
                month = f"{year}-{match[1]}"
                links[month] = {"month": month, "source_url": url}

    Links().feed(html)
    return [links[k] for k in sorted(links)]


def date_values(raw, label, flags):
    """Normalize only valid printed dates; never repair source typos."""
    values = []
    matches = DATE.findall(raw)
    remainder = DATE.sub("", raw).strip(" \n\t-/–—")
    if not matches or remainder or len(matches) > 2:
        flags.append(f"unparsed_{label}_date")
    for value in matches:
        try:
            values.append(datetime.strptime(value, "%m/%d/%Y").date().isoformat())
        except ValueError:
            flags.append(f"invalid_{label}_date")
            values.append(None)
    return values


def parse_table_pages(pages, source, page_count):
    """Account for every extracted table line, preserving row continuation."""
    records, gaps, page_stats = [], [], []
    pending = None
    seen_pages = set()
    ordinal = 0

    def finish():
        nonlocal pending
        if pending is None:
            return
        cells = pending["cells"]
        first_page = pending["pages"][0]
        gap_base = {"page": first_page, "source_pages": pending["pages"], "cells": cells}
        report_id = re.sub(r"\s+", "", cells[0])
        if not CASE_FULL.fullmatch(report_id):
            gaps.append(dict(gap_base, kind="unrecognized_report_id"))
        elif any(not cell.strip() for cell in cells):
            gaps.append(dict(gap_base, kind="missing_cells", missing=[FIELDS[i] for i, x in enumerate(cells) if not x.strip()]))
        else:
            flags = []
            reported = date_values(cells[1], "reported", flags)
            occurred = date_values(cells[4], "occurrence", flags)
            reported_date = reported[0] if len(reported) == 1 else None
            start = occurred[0] if occurred else None
            end = occurred[-1] if occurred else None
            if start and end and end < start:
                flags.append("occurrence_end_before_start")
            if reported_date and start and start > reported_date:
                flags.append("occurrence_start_after_reported_date")
            if reported_date and end and end > reported_date:
                flags.append("occurrence_end_after_reported_date")
            if reported_date and reported_date > source["captured_at"][:10]:
                flags.append("reported_date_after_capture")
            record = {
                "record_id": f"{source['month']}:p{first_page}:r{pending['ordinal']}:{report_id}",
                "report_id": report_id, "reported_date": reported_date,
                "offense": cells[2], "location": cells[3],
                "occurrence_start": start, "occurrence_end": end,
                "disposition": cells[6],
                "reported_date_raw": cells[1], "occurrence_dates_raw": cells[4],
                "occurrence_times_raw": cells[5], "report_id_raw": cells[0],
                "source_url": source["source_url"], "source_page": first_page,
                "source_pages": pending["pages"], "source_month": source["month"],
                "source_hash": source["source_hash"], "captured_at": source["captured_at"],
                "extraction_method": METHOD, "coverage_note": NOTE,
                "data_quality_flags": sorted(set(flags)),
            }
            records.append(record)
        pending = None

    for page in pages:
        number = page["page"]
        if number in seen_pages:
            gaps.append({"kind": "duplicate_page", "page": number})
            continue
        seen_pages.add(number)
        lines = page["lines"]
        stat = {"page": number, "table_lines": len(lines), "candidate_rows": 0}
        page_stats.append(stat)
        if not lines:
            gaps.append({"kind": "empty_page", "page": number})
        for cells in lines:
            cells = [str(x or "").strip() for x in cells]
            if len(cells) != 7:
                finish()
                gaps.append({"kind": "unexpected_column_count", "page": number, "cells": cells})
                continue
            # A case-number token or a populated reported-date column starts a row.
            # Short numeric fragments with no date continue a wrapped case number.
            is_start = bool(CASE_START.fullmatch(cells[0]) or cells[1])
            if is_start:
                finish()
                ordinal += 1
                stat["candidate_rows"] += 1
                pending = {"cells": cells, "pages": [number], "ordinal": ordinal}
            elif pending:
                for i, value in enumerate(cells):
                    if value:
                        pending["cells"][i] += ("\n" if pending["cells"][i] else "") + value
                if number not in pending["pages"]:
                    pending["pages"].append(number)
            elif any(cells):
                gaps.append({"kind": "orphaned_cells", "page": number, "cells": cells})
    finish()
    for number in sorted(set(range(1, page_count + 1)) - seen_pages):
        gaps.append({"kind": "missing_page", "page": number})
    for number in sorted(seen_pages - set(range(1, page_count + 1))):
        gaps.append({"kind": "unexpected_page", "page": number})
    return {"records": records, "gaps": gaps, "pages": page_stats, "page_count": page_count}


def extract_pdf(raw, source):
    """Read seven columns by their printed headers, not fragile shaded rectangles."""
    import pdfplumber

    pages, extraction_gaps = [], []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        first_words = pdf.pages[0].extract_words(x_tolerance=2, y_tolerance=2)
        labels = ["Case", "Date", "Criminal", "Location", "Date(s)", "Time(s)", "Disposition"]
        header = []
        for label in labels:
            found = [w for w in first_words if w["text"] == label and 105 < w["top"] < 200]
            if len(found) != 1:
                return {"records": [], "gaps": [{"kind": "unrecognized_table_header", "page": 1, "label": label}], "pages": [], "page_count": len(pdf.pages)}
            header.append(found[0])
        anchors = [w["x0"] for w in header]
        # Older documents center 'Date Reported' within its cell. Read the
        # actual date baseline, which is left aligned, instead of the label.
        first_cutoff = max(w["bottom"] for w in header)
        report_dates = [w["x0"] for w in first_words if w["top"] > first_cutoff and DATE.fullmatch(w["text"]) and anchors[0] < w["x0"] < anchors[2]]
        if not report_dates:
            return {"records": [], "gaps": [{"kind": "missing_reported_date_column", "page": 1}], "pages": [], "page_count": len(pdf.pages)}
        anchors[1] = min(report_dates)
        if anchors != sorted(anchors):
            return {"records": [], "gaps": [{"kind": "unordered_columns", "page": 1}], "pages": [], "page_count": len(pdf.pages)}
        bounds = [x - 3 for x in anchors]
        bounds[0] = 0  # A later page can indent long case numbers slightly less.
        # January's appended conduct rows move these two left edges by 6.84
        # and 4.92 points while leaving the later columns in place.
        bounds[1] = anchors[1] - 10
        bounds[2] = anchors[2] - 8
        for number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(x_tolerance=2, y_tolerance=2)
            separator = [w for w in words if re.fullmatch(r"_{30,}", w["text"])]
            site_label = [w for w in words if w["text"] == "police.vt.edu" and w["top"] < 100]
            if len(separator) != 1 and len(site_label) != 1:
                extraction_gaps.append({"kind": "unrecognized_page_header", "page": number})
                continue
            letterhead_bottom = separator[0]["bottom"] if len(separator) == 1 else site_label[0]["bottom"]
            cutoff = first_cutoff if number == 1 else letterhead_bottom
            body = [w for w in words if w["top"] > cutoff - 0.1]
            rows = []
            for word in sorted(body, key=lambda w: (w["top"], w["x0"])):
                if not rows or abs(word["top"] - rows[-1][0]) > 2:
                    rows.append((word["top"], [word]))
                else:
                    rows[-1][1].append(word)
            lines = []
            for _, row in rows:
                cells = [[] for _ in range(7)]
                for word in sorted(row, key=lambda w: w["x0"]):
                    column = bisect_right(bounds, word["x0"]) - 1
                    if column < 0:
                        extraction_gaps.append({"kind": "text_outside_columns", "page": number, "text": word["text"]})
                    else:
                        cells[column].append(word["text"])
                lines.append([" ".join(c) for c in cells])
            pages.append({"page": number, "lines": lines})
        result = parse_table_pages(pages, source, len(pdf.pages))
    result["gaps"].extend(extraction_gaps)
    return result


def build_manifest(documents, expected_months, captured_at, as_of):
    gaps = []
    found = {doc["month"] for doc in documents}
    for month in sorted(set(expected_months) - found):
        gaps.append({"kind": "missing_month", "month": month})
    for doc in documents:
        gaps.extend(dict(gap, month=doc["month"], source_url=doc["source_url"]) for gap in doc["gaps"])
        if not doc.get("pages"):
            gaps.append({"kind": "no_pages_accounted", "month": doc["month"]})
    records = [r for doc in documents for r in doc["records"]]
    dates = [r["reported_date"] for r in records if r["reported_date"]]
    counts = Counter(r["report_id"] for r in records)
    start = expected_months[0] + "-01"
    scoped_dates = [d for d in dates if start <= d <= as_of]
    return {
        "schema_version": 1, "source_index_url": INDEX_URL, "captured_at": captured_at,
        "scope": {"campus": "Blacksburg", "published_months": expected_months,
                  "requested_reported_date_start": start, "requested_reported_date_end": as_of,
                  "selection": "Every row in indexed Blacksburg PDFs for these months. Earlier/later reported dates are retained and counted separately.",
                  "excluded_campuses": ["Greater DC/Innovation Center", "VT Carilion"]},
        "coverage": "partial" if gaps else "complete_published_documents",
        "all_crime_occurrence_coverage": False,
        "coverage_note": NOTE + " Complete refers only to extraction of the captured published documents, not reporting through the capture date.",
        "pdfs": len(documents), "pages": sum(d["page_count"] for d in documents),
        "records": len(records), "unique_report_ids": len(counts),
        "source_candidate_rows": sum(page["candidate_rows"] for doc in documents for page in doc["pages"]),
        "quarantined_rows": sum(g["kind"] in ("missing_cells", "unrecognized_report_id") for g in gaps),
        "duplicate_report_ids": {k: v for k, v in sorted(counts.items()) if v > 1},
        "reported_date_min": min(dates) if dates else None,
        "reported_date_max": max(dates) if dates else None,
        "reported_date_min_within_scope": min(scoped_dates) if scoped_dates else None,
        "reported_date_max_within_scope": max(scoped_dates) if scoped_dates else None,
        "records_within_requested_reported_dates": sum(start <= d <= as_of for d in dates),
        "records_outside_requested_reported_dates": sum(not start <= d <= as_of for d in dates),
        "records_with_date_quality_flags": sum(bool(r["data_quality_flags"]) for r in records),
        "documents": [{k: v for k, v in doc.items() if k not in ("records", "gaps")} | {"records": len(doc["records"]), "gap_count": len(doc["gaps"])} for doc in documents],
        "gaps": gaps,
        "limitations": [
            "This is reported public-log context, not a live alert feed, conviction record, prediction, or safety guarantee.",
            "Publication can lag reporting and fields can be withheld; no empty or absent record establishes that no crime occurred.",
            "One row may list multiple offenses or multiplicities; row counts are not counts of offenses, victims, or unique events.",
            "All published dispositions are retained, including unfounded reports and status history.",
            "Log definitions differ from the annual Clery statistical report; do not combine their counts.",
            "No coordinates or inferred geocoding are added. Public location wording is retained.",
            "Blacksburg is the index publication section, not a geometric filter: published rows can describe off-campus or study-abroad locations.",
        ],
    }


def validate_source_url(url):
    parsed = urllib.parse.urlparse(url)
    if (parsed.scheme != "https" or parsed.hostname != "police.vt.edu"
            or parsed.username is not None or parsed.password is not None
            or parsed.port is not None):
        raise ValueError("Only HTTPS official Virginia Tech Police URLs without credentials or ports are allowed")


class OfficialRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject an unsafe hop before urllib issues its redirected request."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_source_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    validate_source_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": "Beacon-Public-Research/1.0"})
    with urllib.request.build_opener(OfficialRedirectHandler()).open(request, timeout=40) as response:
        validate_source_url(response.url)
        raw = response.read(15_000_001)
    if len(raw) > 15_000_000:
        raise ValueError("Source exceeds the bounded 15 MB limit")
    return raw


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", default=datetime.now(ZoneInfo("America/New_York")).date().isoformat())
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--refresh", action="store_true", help="Download current official sources; default replays captured archives")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "data/campus/research")
    args = parser.parse_args()
    as_of = date.fromisoformat(args.as_of)
    today = datetime.now(ZoneInfo("America/New_York")).date()
    if as_of > today or as_of.year != args.year:
        parser.error("Scope must be within the requested year and not in the future")
    args.output.mkdir(parents=True, exist_ok=True)
    index_path = args.output / f"crime-source-index-{args.year}.json"
    if args.refresh:
        raw_index = fetch(INDEX_URL)
        capture = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        index = {"source_url": INDEX_URL, "captured_at": capture, "source_hash": sha256(raw_index), "html": raw_index.decode("utf-8")}
        write_json(index_path, index)
    else:
        index = json.loads(index_path.read_text())
        if sha256(index["html"].encode()) != index["source_hash"]:
            raise ValueError("Retained index hash mismatch")
    capture = index["captured_at"]
    links = discover_pdfs(index["html"], args.year, as_of.month)
    expected = [f"{args.year}-{m:02}" for m in range(1, as_of.month + 1)]
    documents = []
    for link in links:
        archive = args.output / f"crime-{link['month']}.pdf.gz"
        metadata = args.output / f"crime-{link['month']}-source.json"
        try:
            if args.refresh:
                raw = fetch(link["source_url"])
                if not raw.startswith(b"%PDF-"):
                    raise ValueError("Official link did not return PDF bytes")
                archive.write_bytes(gzip.compress(raw, mtime=0))
                source = dict(link, source_hash=sha256(raw), captured_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), source_bytes=len(raw), archive_file=archive.name)
                write_json(metadata, source)
            else:
                raw = gzip.decompress(archive.read_bytes())
                source = json.loads(metadata.read_text())
                if source["source_hash"] != sha256(raw) or source["source_url"] != link["source_url"]:
                    raise ValueError("Retained source hash or URL mismatch")
            result = extract_pdf(raw, source)
            documents.append(dict(source, **result))
            print(f"{link['month']}: {result['page_count']} pages, {len(result['records'])} rows, {len(result['gaps'])} gaps")
        except Exception as error:
            documents.append(dict(link, records=[], pages=[], page_count=0, gaps=[{"kind": "document_error", "error": str(error)}]))
    manifest = build_manifest(documents, expected, capture, args.as_of)
    manifest["source_index_hash"] = index["source_hash"]
    write_json(args.output / f"crime-records-{args.year}.json", [r for d in documents for r in d["records"]])
    write_json(args.output / f"crime-manifest-{args.year}.json", manifest)
    print(json.dumps({k: manifest[k] for k in ("coverage", "pdfs", "pages", "records", "records_with_date_quality_flags")}, indent=2))
    return 0 if manifest["coverage"] == "complete_published_documents" else 2


if __name__ == "__main__":
    raise SystemExit(main())
