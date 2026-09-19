import unittest
import json
from pathlib import Path

from route_data import build_graph, shortest_path, named_place_path, distance_to_path, lighting_summary, nearby_phones, match_reports


def feature(points, status="ADA", oid=1):
    return {"attributes": {"OBJECTID": oid, "ada_status": status}, "geometry": {"paths": [points]}}


class RouteTests(unittest.TestCase):
    def test_connected_route_retains_actual_bend(self):
        a, b, c = (-80.42, 37.22), (-80.42, 37.221), (-80.419, 37.221)
        graph = build_graph([feature([a, b, c])])
        self.assertEqual(shortest_path(graph, a, c), [a, b, c])

    def test_disconnected_paths_are_not_joined(self):
        a, b, c, d = (-80.42, 37.22), (-80.42, 37.221), (-80.419, 37.221), (-80.419, 37.222)
        graph = build_graph([feature([a, b]), feature([c, d], oid=2)])
        self.assertIsNone(shortest_path(graph, a, d))

    def test_unknown_or_barrier_path_is_not_certified(self):
        self.assertEqual(build_graph([feature([(-80.42, 37.22), (-80.42, 37.221)], "NotADA")]), {})
        self.assertEqual(lighting_summary(100), {"known_meters": 0, "lit_meters": 0, "unlit_meters": 0, "unknown_meters": 100})

    def test_phone_distance_is_to_segment_not_endpoint(self):
        path = [(-80.42, 37.22), (-80.42, 37.222)]
        self.assertLess(distance_to_path((-80.42, 37.221), path), .01)
        phones = [{"phone_id": "near", "location": "public", "longitude": -80.4199, "latitude": 37.221}, {"phone_id": "far", "location": "public", "longitude": -80.41, "latitude": 37.221}]
        matched = nearby_phones(path, phones)
        self.assertEqual([p["phone_id"] for p in matched], ["near"])
        self.assertAlmostEqual(matched[0]["distance_meters"], 8.85, delta=.1)

    def test_coarse_matches_do_not_invent_geocodes(self):
        reports = [{"report_id": "1", "location": "Newman Library"}, {"report_id": "2", "location": "Newman Hall"}]
        self.assertEqual([r["report_id"] for r in match_reports(reports, ["Newman Library", "Pritchard Hall"])], ["1"])

    def test_named_place_offsets_are_bounded_and_never_inserted(self):
        a, b = (-80.42, 37.22), (-80.42, 37.222)
        graph = build_graph([feature([a,b])])
        path, offsets = named_place_path(graph, [(-80.4201,37.22),b])
        self.assertEqual(path, [a,b])
        self.assertGreater(offsets[0], 8)
        self.assertEqual(named_place_path(graph, [(-81,37.22),b]), (None,None))
        with self.assertRaises(ValueError):
            nearby_phones([a,b],[],radius=101)

    def test_captured_routes_use_only_real_connected_network_edges(self):
        directory = Path(__file__).resolve().parents[2] / "data/campus"
        graph = build_graph(json.loads((directory / "walking-network.json").read_text())["features"])
        rows = json.loads((directory / "route-evidence.json").read_text())
        self.assertEqual([r["status"] for r in rows], ["supported", "supported", "unsupported"])
        for row in rows[:2]:
            points = [tuple(p) for p in row["geometry"]["coordinates"]]
            for a, b in zip(points, points[1:]):
                self.assertIn(b, graph[a])
            self.assertAlmostEqual(sum(graph[a][b] for a,b in zip(points, points[1:])), row["distance_meters"], places=2)
            self.assertEqual(row["lighting"]["unknown_meters"], row["distance_meters"])


if __name__ == "__main__":
    unittest.main()
