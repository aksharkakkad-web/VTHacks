"""Small offline checks for official snapshots and GTFS service logic."""
import json
import unittest
from datetime import date, datetime

from refresh_campus import OUT, expand_departures, gtfs_seconds, service_active


class ScheduleTests(unittest.TestCase):
    def test_overnight_gtfs_time(self):
        self.assertEqual(gtfs_seconds("25:10:00"), 90600)
        with self.assertRaises(ValueError):
            gtfs_seconds("20:75:00")

    def test_exceptions_override_weekly_calendar(self):
        calendar = [{"service_id": "A", "start_date": "20260101", "end_date": "20261231", "saturday": "1"}]
        day = date(2026, 9, 19)
        self.assertTrue(service_active("A", day, calendar, []))
        self.assertFalse(service_active("A", day, calendar, [{"service_id": "A", "date": "20260919", "exception_type": "2"}]))
        self.assertTrue(service_active("A", day, [], [{"service_id": "A", "date": "20260919", "exception_type": "1"}]))

    def test_overnight_departure_moves_to_next_date(self):
        snapshot = {"agency_timezone": "America/New_York", "calendar": [],
                    "calendar_dates": [{"service_id": "A", "date": "20260919", "exception_type": "1"}],
                    "route": {"route_long_name": "Test fixture"}, "feed_info": {"feed_version": "fixture"},
                    "patterns": [{"trip_id": "T", "route_id": "CAS", "service_id": "A", "departure_time": "25:10:00", "arrival_time": "25:20:00"}]}
        result = expand_departures(snapshot, [date(2026, 9, 19)])
        self.assertEqual(result[0]["departure_at"], "2026-09-20T05:10:00Z")
        self.assertEqual(result[0]["travel_minutes"], 10)


class RealSnapshotTests(unittest.TestCase):
    @staticmethod
    def load(name):
        return json.loads((OUT / name).read_text())

    def test_provenance_complete(self):
        rows = self.load("source-manifest.json")
        self.assertEqual(len({r["source_id"] for r in rows}), len(rows))
        self.assertTrue({"bt-gtfs", "bt-fare", "vt-emergency-phones", "vt-crime-september-sample", "nws-hourly", "nws-alerts"}.issubset({r["source_id"] for r in rows}))
        for row in rows:
            self.assertRegex(row["sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(row["source_url"].startswith("https://"))
            datetime.fromisoformat(row["captured_at"])

    def test_crime_sample_is_not_risk_score(self):
        rows = self.load("incident-reports.json")
        self.assertEqual(len(rows), 12)
        self.assertEqual(len({r["report_id"] for r in rows}), len(rows))
        self.assertTrue(all(r["coverage_note"].startswith("Selected 12 records") for r in rows))
        self.assertTrue(any("Unfounded" in r["disposition"] for r in rows))
        self.assertTrue(all("risk_score" not in r and "latitude" not in r and "name" not in r for r in rows))
        for row in rows:
            self.assertLessEqual(row["occurrence_start"], row["occurrence_end"])
            self.assertLessEqual(row["source_page"], 2)

    def test_phones_are_valid_campus_points_not_availability(self):
        phones = self.load("emergency-phones.json")
        self.assertGreater(len(phones), 10)
        for phone in phones:
            self.assertTrue(-81 < phone["longitude"] < -80)
            self.assertTrue(37 < phone["latitude"] < 38)
            self.assertEqual(phone["operational_status"], "unknown")

    def test_route_unknowns_are_not_safe_defaults(self):
        for row in self.load("route-context.json"):
            self.assertEqual(row["lighting"], "unknown")
            self.assertIsNone(row["walking_path_closed"])
            self.assertIsNone(row["active_official_alert"])
            self.assertIsNone(row["historical_report_count"])
            self.assertIn(row["weather"], ("clear", "rain", "unknown"))

    def test_real_direct_trip_order_and_times(self):
        snapshot = self.load("transit-snapshot.json")
        self.assertEqual({s["stop_id"] for s in snapshot["stops"]}, {"1100", "1143", "1146"})
        self.assertTrue(all(p["board_sequence"] < p["alight_sequence"] for p in snapshot["patterns"]))
        departures = self.load("transit-departures.json")
        self.assertGreater(len(departures), 0)
        for row in departures:
            travel = (datetime.fromisoformat(row["arrival_at"]) - datetime.fromisoformat(row["departure_at"])).total_seconds() / 60
            self.assertGreater(travel, 0)
            self.assertAlmostEqual(row["travel_minutes"], travel, places=5)
            self.assertIn(row["corridor_id"], ("newman-pritchard", "eggleston-pritchard"))

    def test_fare_has_official_source(self):
        row = self.load("transit-fares.json")[0]
        self.assertEqual(row["cost"], 0)
        self.assertEqual(row["source_url"], "https://ridebt.org/fare-information")


if __name__ == "__main__":
    unittest.main()
