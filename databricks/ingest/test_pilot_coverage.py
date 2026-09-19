"""Contract tests for offline, geometry-honest pilot coverage."""
import unittest

from pilot_coverage import build_matrix, eligible_town_features, validate_feature, validate_zones


def line(points, kind="Sidewalk", status="Existing"):
    return {"attributes": {"OBJECTID": 1, "Type": kind, "Status": status},
            "geometry": {"paths": [points]}}


class PilotCoverageTests(unittest.TestCase):
    def setUp(self):
        self.a = [-80.420, 37.230]
        self.b = [-80.419, 37.230]
        self.c = [-80.418, 37.230]
        self.departures = [{"id": f"d{i}", "name": f"Departure {i}", "stop_id": str(i),
                            "coordinate": [self.a[0] + i * 0.000001, self.a[1]] if i < 4 else [-81, 37.23]} for i in range(5)]
        self.destinations = [{"id": f"h{i}", "name": f"Home {i}", "stop_id": str(i+5),
                              "coordinate": [self.c[0] + i * 0.000001, self.c[1]]} for i in range(5)]
        self.zones = {"status": "DRAFT_PROPOSED_UNAPPROVED", "departures": self.departures,
                      "destinations": self.destinations}

    def test_all_50_directions_and_reverse_exact_geometry(self):
        result = build_matrix(self.zones, [line([self.a, self.b, self.c])], [],
                              {"town": "abc", "vt": "def"})
        self.assertEqual(len(result["results"]), 50)
        self.assertEqual(result["supported_count"], 40)
        forward = next(r for r in result["results"] if r["from_id"] == "d0" and r["to_id"] == "h0")
        reverse = next(r for r in result["results"] if r["from_id"] == "h0" and r["to_id"] == "d0")
        self.assertEqual(forward["path"], [self.a, self.b, self.c])
        self.assertEqual(reverse["path"], [self.c, self.b, self.a])
        self.assertGreater(forward["distance_meters"], 0)
        self.assertEqual(forward["distance_meters"], reverse["distance_meters"])
        self.assertEqual(forward["source_hashes"], {"town": "abc", "vt": "def"})

    def test_disconnected_and_out_of_range_have_no_fabricated_path(self):
        far = [-80.416, 37.23]
        destinations = [dict(row, coordinate=[far[0] + i * 0.000001, far[1]])
                        for i, row in enumerate(self.destinations)]
        zones = dict(self.zones, destinations=destinations)
        result = build_matrix(zones, [line([self.a, self.b]), line([far, [-80.415, 37.23]])], [], {})
        for row in result["results"]:
            self.assertEqual(row["status"], "unsupported")
            self.assertIsNone(row["path"])
            self.assertIsNone(row["distance_meters"])
            self.assertIsNone(row["walking_minutes"])
        self.assertEqual(result["supported_count"], 0)

    def test_rejects_invalid_anchor_sets(self):
        variants = [dict(self.zones, departures=self.departures[:4]),
                    dict(self.zones, destinations=self.destinations + [self.destinations[0]]),
                    dict(self.zones, departures=self.departures[:4] + [dict(self.departures[4], coordinate=[181, 37])]),
                    dict(self.zones, departures=self.departures[:4] + [dict(self.departures[4], stop_id="0")]),
                    dict(self.zones, departures=self.departures[:4] + [dict(self.departures[4], coordinate=self.a)])]
        for zones in variants:
            with self.subTest(zones=zones):
                with self.assertRaises(ValueError):
                    validate_zones(zones)

    def test_rejects_bike_only_unknown_and_proposed_town_edges(self):
        features = [line([self.a, self.b], "Bike Lane"), line([self.a, self.b], "Trail", "Proposed"),
                    line([self.a, self.b], "Unknown"), line([self.a, self.b], "Sidewalk"),
                    line([self.b, self.c], "Trail")]
        self.assertEqual(len(eligible_town_features(features)), 2)
        result = build_matrix(self.zones, features[:3], [], {})
        self.assertEqual(result["supported_count"], 0)

    def test_rejects_swapped_or_untransformed_source_coordinates(self):
        for points in ([[37.23, -80.42], [37.23, -80.41]], [[10900000, 3590000], [10900001, 3590001]]):
            with self.subTest(points=points):
                with self.assertRaises(ValueError):
                    validate_feature(line(points))


if __name__ == "__main__":
    unittest.main()
