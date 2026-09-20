"""Regression tests for preserving public log rows and honest coverage."""
import importlib.util
import gzip
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch


MODULE = Path(__file__).with_name("public_crime.py")
SPEC = importlib.util.spec_from_file_location("public_crime", MODULE)
crime = importlib.util.module_from_spec(SPEC) if MODULE.exists() else None
if crime:
    SPEC.loader.exec_module(crime)

META = {
    "source_url": "https://police.vt.edu/example.pdf",
    "source_hash": "a" * 64,
    "captured_at": "2026-09-19T12:00:00Z",
    "month": "2026-01",
}
ROW = ["2026-25", "01/02/2026", "Identity Fraud", "1311 South Main Street",
       "01/02/2026", "0100-0605", "Cleared by Arrest"]


class CrimeImportTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(crime, "The bounded public crime importer must exist")

    def parse(self, pages, page_count=None):
        return crime.parse_table_pages(pages, META, page_count or len(pages))

    def test_multiline_offense_and_disposition_are_preserved(self):
        result = self.parse([{"page": 1, "lines": [ROW, ["", "", "Second offense*", "", "", "", "Unfounded 01/03/2026"]]}])
        self.assertEqual(result["records"][0]["offense"], "Identity Fraud\nSecond offense*")
        self.assertIn("Unfounded", result["records"][0]["disposition"])
        self.assertEqual(result["records"][0]["occurrence_start"], "2026-01-02")
        self.assertEqual(result["gaps"], [])

    def test_continuation_across_page_boundary_retains_both_pages(self):
        row = ROW.copy(); row[-1] = "Inactive- Referred"
        result = self.parse([{"page": 1, "lines": [row]}, {"page": 2, "lines": [["", "", "", "", "", "", "to Student Conduct"]]}])
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0]["source_pages"], [1, 2])
        self.assertIn("to Student Conduct", result["records"][0]["disposition"])

    def test_duplicate_case_ids_do_not_erase_distinct_published_rows(self):
        second = ROW.copy(); second[2] = "Public Intoxication"
        result = self.parse([{"page": 1, "lines": [ROW, second]}])
        self.assertEqual(len(result["records"]), 2)
        self.assertEqual(len({r["record_id"] for r in result["records"]}), 2)
        self.assertEqual([r["report_id"] for r in result["records"]], ["2026-25"] * 2)

    def test_wrapped_numeric_case_number_is_not_a_second_record(self):
        row = ROW.copy(); row[0] = "2027848301-"
        result = self.parse([{"page": 1, "lines": [row, ["119235", "", "", "", "", "", ""]]}])
        self.assertEqual(result["records"][0]["report_id"], "2027848301-119235")
        self.assertEqual(result["gaps"], [])

    def test_invalid_and_reversed_source_dates_are_not_corrected(self):
        row = ROW.copy(); row[4] = "12/20/2026-01/28/2026"
        result = self.parse([{"page": 1, "lines": [row]}])
        record = result["records"][0]
        self.assertEqual(record["occurrence_start"], "2026-12-20")
        self.assertEqual(record["occurrence_end"], "2026-01-28")
        self.assertIn("occurrence_end_before_start", record["data_quality_flags"])
        row = ROW.copy(); row[4] = "02/30/2026"
        result = self.parse([{"page": 1, "lines": [row]}])
        self.assertIsNone(result["records"][0]["occurrence_start"])
        self.assertIn("invalid_occurrence_date", result["records"][0]["data_quality_flags"])

    def test_missing_required_cell_is_a_gap_with_original_cells(self):
        row = ROW.copy(); row[3] = ""
        result = self.parse([{"page": 1, "lines": [row]}])
        self.assertEqual(result["records"], [])
        self.assertEqual(result["gaps"][0]["kind"], "missing_cells")
        self.assertEqual(result["gaps"][0]["cells"], row)

    def test_unrecognized_case_cell_is_not_silently_absorbed(self):
        bad = ROW.copy(); bad[0] = "CASE-UNKNOWN"
        result = self.parse([{"page": 1, "lines": [ROW, bad]}])
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["gaps"][0]["kind"], "unrecognized_report_id")

    def test_orphaned_continuation_and_empty_page_are_gaps(self):
        result = self.parse([{"page": 1, "lines": [["", "", "orphan text", "", "", "", ""]]}, {"page": 2, "lines": []}])
        self.assertEqual({g["kind"] for g in result["gaps"]}, {"orphaned_cells", "empty_page"})

    def test_absent_pdf_page_prevents_complete_coverage(self):
        result = self.parse([{"page": 1, "lines": [ROW]}], page_count=2)
        self.assertIn("missing_page", [g["kind"] for g in result["gaps"]])
        manifest = crime.build_manifest([dict(META, **result)], ["2026-01"], META["captured_at"], "2026-09-19")
        self.assertEqual(manifest["coverage"], "partial")

    def test_missing_month_prevents_complete_coverage(self):
        result = self.parse([{"page": 1, "lines": [ROW]}])
        manifest = crime.build_manifest([dict(META, **result)], ["2026-01", "2026-02"], META["captured_at"], "2026-09-19")
        self.assertEqual(manifest["coverage"], "partial")
        self.assertIn("missing_month", [g["kind"] for g in manifest["gaps"]])

    def test_manifest_accounts_for_quarantined_rows_and_scoped_dates(self):
        incomplete = ROW.copy(); incomplete[-1] = ""
        result = self.parse([{"page": 1, "lines": [ROW, incomplete]}])
        manifest = crime.build_manifest([dict(META, **result)], ["2026-01"], META["captured_at"], "2026-09-19")
        self.assertEqual(manifest.get("source_candidate_rows"), 2)
        self.assertEqual(manifest.get("quarantined_rows"), 1)
        self.assertEqual(manifest.get("reported_date_max_within_scope"), "2026-01-02")

    def test_complete_means_published_documents_never_all_crime(self):
        result = self.parse([{"page": 1, "lines": [ROW]}])
        manifest = crime.build_manifest([dict(META, **result)], ["2026-01"], META["captured_at"], "2026-09-19")
        self.assertEqual(manifest["coverage"], "complete_published_documents")
        self.assertFalse(manifest["all_crime_occurrence_coverage"])

    def test_index_excludes_other_campuses_and_deduplicates_links(self):
        base = "/content/dam/police_vt_edu/crime-logs/2026/file_202601"
        html = ''.join(f'<a href="{base}{suffix}.pdf">January 2026</a>' for suffix in ("", "", "_Innovation", "_VT%20Carilion"))
        links = crime.discover_pdfs(html, 2026, 9)
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["month"], "2026-01")

    def test_official_january_centered_date_heading_does_not_merge_columns(self):
        raw = gzip.decompress((MODULE.parents[2] / "data/campus/research/crime-2026-01.pdf.gz").read_bytes())
        result = crime.extract_pdf(raw, META)
        self.assertTrue(result["records"], "Centered header text must not set the data-column edge")
        first = result["records"][0]
        self.assertEqual(first["report_id"], "2026-25")
        self.assertEqual(first["reported_date"], "2026-01-02")

    def test_official_january_late_rows_with_shifted_columns_preserve_case_ids(self):
        raw = gzip.decompress((MODULE.parents[2] / "data/campus/research/crime-2026-01.pdf.gz").read_bytes())
        result = crime.extract_pdf(raw, META)
        last = result["records"][-1]
        self.assertEqual(last["report_id"], "2027848301-119235")
        self.assertEqual(last["reported_date"], "2026-01-31")
        self.assertEqual(last["offense"], "Underage Possession of\nAlcohol*X4")
        self.assertEqual(result["gaps"], [])

    def test_date_accidentally_in_case_cell_is_a_gap(self):
        row = ROW.copy(); row[0] = "2027798504 01/22/2026"; row[1] = "Underage"
        result = self.parse([{"page": 1, "lines": [row]}])
        self.assertEqual(result["records"], [])
        self.assertEqual(result["gaps"][0]["kind"], "unrecognized_report_id")

    def test_future_report_date_is_preserved_but_flagged(self):
        row = ROW.copy(); row[1] = "03/30/3036"
        result = self.parse([{"page": 1, "lines": [row]}])
        self.assertEqual(result["records"][0]["reported_date"], "3036-03-30")
        self.assertIn("reported_date_after_capture", result["records"][0]["data_quality_flags"])

    def test_official_july_graphic_letterhead_is_supported(self):
        raw = gzip.decompress((MODULE.parents[2] / "data/campus/research/crime-2026-07.pdf.gz").read_bytes())
        result = crime.extract_pdf(raw, dict(META, month="2026-07"))
        self.assertTrue(result["records"], "A graphic separator need not contain underscore text")
        self.assertEqual(result["records"][0]["report_id"], "2026-11093")

    def test_official_alphanumeric_case_identifier_is_preserved(self):
        row = ROW.copy(); row[0] = "IR00128916"
        result = self.parse([{"page": 1, "lines": [row]}])
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0]["report_id"], "IR00128916")

    def test_fetch_rejects_credentials_ports_and_insecure_final_url(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.url = "https://police.vt.edu/index.html"
        response.read.return_value = b"public"
        opener = MagicMock(); opener.open.return_value = response
        with patch.object(crime.urllib.request, "urlopen", return_value=response), patch.object(crime.urllib.request, "build_opener", return_value=opener):
            for url in ("https://user@police.vt.edu/index.html", "https://police.vt.edu:443/index.html"):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    crime.fetch(url)
            response.url = "http://police.vt.edu/index.html"
            with self.assertRaises(ValueError):
                crime.fetch("https://police.vt.edu/index.html")

    def test_redirect_targets_are_validated_before_following(self):
        handler_class = getattr(crime, "OfficialRedirectHandler", None)
        self.assertIsNotNone(handler_class, "Every redirect hop needs validation")
        handler = handler_class()
        request = crime.urllib.request.Request("https://police.vt.edu/index.html")
        for url in ("http://police.vt.edu/index.html", "https://127.0.0.1/file", "https://localhost/file", "https://police.vt.edu:8443/file", "https://user@police.vt.edu/file", "https://example.com/file"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                handler.redirect_request(request, None, 302, "Found", {}, url)
        permitted = handler.redirect_request(request, None, 302, "Found", {}, "https://police.vt.edu/new.pdf")
        self.assertEqual(permitted.full_url, "https://police.vt.edu/new.pdf")


if __name__ == "__main__":
    unittest.main()
