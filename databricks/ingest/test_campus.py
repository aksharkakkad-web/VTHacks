"""Small offline checks for official snapshots and GTFS service logic."""
import json
import unittest
from datetime import date, datetime

from refresh_campus import OUT, expand_departures, gtfs_seconds, service_active, weather_context


class ScheduleTests(unittest.TestCase):
    def test_weather_hour_windows_and_severe_alert(self):
        from datetime import timezone
        now = datetime(2026, 9, 19, 12, 10, tzinfo=timezone.utc)
        periods = [{"start_at": f"2026-09-19T{hour:02d}:00:00Z", "end_at": f"2026-09-19T{hour+1:02d}:00:00Z",
                    "short_forecast": "Sunny", "precipitation_probability": 0} for hour in range(12, 20)]
        alerts = [{"severity": "Severe", "onset": "2026-09-19T13:00:00Z", "expires": "2026-09-19T14:00:00Z"}]
        rows = weather_context(periods, alerts, now, "https://api.weather.gov/forecast", "abc", now)
        one = [r for r in rows if r["corridor_id"] == "newman-pritchard"]
        self.assertEqual(len(one), 8)
        self.assertEqual(one[0]["weather"], "clear")
        self.assertEqual(one[1]["weather"], "severe")
        self.assertTrue(one[1]["active_official_alert"])
        self.assertEqual(one[-1]["valid_until"], "2026-09-19T20:00:00Z")
        self.assertEqual(one[1]["valid_from"], "2026-09-19T13:00:00Z")
        self.assertEqual(one[1]["updated_at"], "2026-09-19T12:10:00Z")
        with self.assertRaisesRegex(ValueError, "stale"):
            weather_context(periods, alerts, now, "https://api.weather.gov/forecast", "abc",
                            datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc))

    def test_partial_hour_severe_alert_splits_validity(self):
        from datetime import timezone
        now = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)
        periods = [{"start_at": "2026-09-19T12:00:00Z", "end_at": "2026-09-19T13:00:00Z",
                    "short_forecast": "Sunny", "precipitation_probability": 0}]
        alerts = [{"severity": "Severe", "onset": "2026-09-19T12:30:00Z", "expires": "2026-09-19T12:45:00Z"}]
        rows = weather_context(periods, alerts, now, "https://api.weather.gov/forecast", "forecastsha", now,
                               "alertsha")
        one = [r for r in rows if r["corridor_id"] == "newman-pritchard"]
        self.assertEqual([(r["valid_from"], r["valid_until"], r["weather"]) for r in one], [
            ("2026-09-19T12:00:00Z", "2026-09-19T12:30:00Z", "clear"),
            ("2026-09-19T12:30:00Z", "2026-09-19T12:45:00Z", "severe"),
            ("2026-09-19T12:45:00Z", "2026-09-19T13:00:00Z", "clear")])
        later = weather_context(periods, [], now.replace(minute=5), "https://api.weather.gov/forecast",
                                "forecastsha", now, "newalertsha")
        self.assertNotEqual(one[1]["context_version"], later[0]["context_version"])
        self.assertTrue(one[1]["context_version"].startswith("nws-forecastsha-alertsha-"))
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

    def test_real_feed_hash_versions_departures(self):
        snapshot = {"agency_timezone": "America/New_York", "calendar": [],
                    "calendar_dates": [{"service_id": "A", "date": "20260919", "exception_type": "1"}],
                    "route": {"route_long_name": "Test"}, "feed_info": {"feed_version": "v42"},
                    "source_sha256": "abcdef123456" + "0" * 52,
                    "patterns": [{"trip_id": "T", "route_id": "CAS", "service_id": "A",
                                  "departure_time": "25:10:00", "arrival_time": "25:20:00"}]}
        rows = expand_departures(snapshot, [date(2026, 9, 19)])
        self.assertEqual(rows[0]["source_version"], "v42:abcdef123456")


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
