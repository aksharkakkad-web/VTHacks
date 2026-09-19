import unittest
import json
import hashlib
import io
import tempfile
from contextlib import redirect_stdout
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import patch

from route_data import build_graph, shortest_path, named_place_path, distance_to_path, lighting_summary, nearby_phones, match_reports, build_evidence, prepare_construction, intersects_construction, construction_polygons, main

SOURCE = "https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0/query?f=geojson"
AT = "2026-09-19T15:15:00Z"


def closure_snapshot(geometry, **changes):
    return {"schema_version": 1, "dataset": "closures", "captured_at": "2026-09-19T15:00:00Z", "records": [
        {"id": "areas:1", "kind": "area", "source_url": SOURCE, "starts_at": "2026-09-01T00:00:00Z", "ends_at": "2026-10-01T00:00:00Z", "geometry": geometry}],
        "sources": [{"url": SOURCE, "captured_at": "2026-09-19T15:00:00Z", "sha256": "a"*64, "coverage": "published construction areas"}], **changes}


def network_fixture():
    a, b, c, d = (-80.42, 37.22), (-80.419, 37.22), (-80.42, 37.221), (-80.419, 37.221)
    geometry = {"type": "Polygon", "coordinates": [[[-80.4197,37.2199],[-80.4193,37.2199],[-80.4193,37.2201],[-80.4197,37.2201],[-80.4197,37.2199]]]}
    return {"features": [feature([a,b]), feature([a,c,d,b], oid=2)], "source_version": "b"*64, "captured_at": "2026-09-19T06:00:00Z",
        "buildings": [{"attributes": {"name": name, "longitude": point[0], "latitude": point[1]}} for name,point in [("Newman Library",a),("Eggleston Hall - East Wing",a),("Pritchard Hall",b)]]}, closure_snapshot(geometry)


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

    def test_construction_detour_retains_original_endpoints_and_existing_edges(self):
        network, snapshot = network_fixture()
        original = build_evidence(network, [], [])
        detours = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=snapshot, evaluated_at=AT)
        graph = build_graph(network["features"])
        polygons, meta = prepare_construction(snapshot, AT)
        self.assertEqual(meta["status"], "applied")
        self.assertEqual(meta["valid_until"], "2026-09-19T16:00:00Z")
        for before, after in zip(original[:2], detours[:2]):
            points = [tuple(p) for p in after["geometry"]["coordinates"]]
            self.assertEqual(points[0], tuple(before["geometry"]["coordinates"][0]))
            self.assertEqual(points[-1], tuple(before["geometry"]["coordinates"][-1]))
            self.assertTrue(all(b in graph[a] for a,b in zip(points,points[1:])))
            self.assertFalse(intersects_construction(points, polygons))
            self.assertGreater(after["distance_meters"], before["distance_meters"])
            self.assertNotEqual(after["source_version"], before["source_version"])
            self.assertEqual(after["captured_at"], network["captured_at"])
            self.assertEqual(after["endpoint_offsets_meters"], before["endpoint_offsets_meters"])
        self.assertEqual(build_evidence(network, [], []), original)

    def test_missing_stale_or_invalid_construction_snapshot_does_not_claim_avoidance(self):
        network, snapshot = network_fixture()
        for value in [None, {**snapshot,"captured_at":"2026-09-19T13:00:00Z"}, {**snapshot,"captured_at":"2026-09-19T16:00:00Z"}, {**snapshot,"sources":[]}]:
            rows = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=value, evaluated_at=AT)
            self.assertTrue(all(r["status"] == "unsupported" and r["geometry"] is None for r in rows))
            self.assertTrue(all(r["construction_avoidance"]["status"] == "unavailable" for r in rows))
            self.assertTrue(all(not any("Conservatively avoids" in x for x in r["limitations"]) for r in rows))

    def test_no_connected_detour_does_not_fall_back_through_work_area(self):
        network, snapshot = network_fixture()
        network["features"] = network["features"][:1]
        self.assertEqual(build_evidence(network, [], [])[0]["status"], "supported")
        row = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=snapshot, evaluated_at=AT)[0]
        self.assertEqual(row["status"], "unsupported")
        self.assertIsNone(row["geometry"])

    def test_polygon_holes_and_crossing_segments(self):
        outer = [[0,0],[4,0],[4,4],[0,4],[0,0]]
        hole = [[1,1],[3,1],[3,3],[1,3],[1,1]]
        polygons = construction_polygons({"type":"Polygon","coordinates":[outer,hole]})
        self.assertFalse(intersects_construction([(1.5,2),(2.5,2)],polygons))
        self.assertTrue(intersects_construction([(-1,2),(5,2)],polygons))
        self.assertTrue(intersects_construction([(1,1),(2,1)],polygons))

    def test_next_construction_change_bounds_validity_and_provenance_changes_version(self):
        network, snapshot = network_fixture()
        future = {**snapshot["records"][0],"id":"areas:2","starts_at":"2026-09-19T15:30:00Z"}
        snapshot["records"].append(future)
        rows = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=snapshot, evaluated_at=AT)
        self.assertEqual(rows[0]["construction_avoidance"]["valid_until"], "2026-09-19T15:30:00Z")
        snapshot["sources"][0]["sha256"] = "c"*64
        changed = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=snapshot, evaluated_at=AT)
        self.assertNotEqual(rows[0]["source_version"], changed[0]["source_version"])

    def test_real_snapshot_detours_avoid_all_current_areas_without_changing_network(self):
        directory = Path(__file__).resolve().parents[2] / "data/campus"
        path = directory / "walking-network.json"
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        network = json.loads(path.read_text())
        snapshot = json.loads((directory / "research/closures.json").read_text())
        now = (datetime.fromisoformat(snapshot["captured_at"].replace("Z","+00:00")) + timedelta(seconds=1)).isoformat()
        rows = build_evidence(network, [], [], avoid_construction=True, construction_snapshot=snapshot, evaluated_at=now)
        polygons, metadata = prepare_construction(snapshot, now)
        self.assertEqual(metadata["status"], "applied")
        self.assertEqual([r["distance_meters"] for r in rows], [1077.34,626.55,None])
        for row in rows[:2]:
            self.assertFalse(intersects_construction(row["geometry"]["coordinates"], polygons))
            self.assertEqual(row["captured_at"], network["captured_at"])
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)

    def test_offline_cli_never_rewrites_original_network_bytes(self):
        network, snapshot = network_fixture()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / "data/campus"
            (directory / "research").mkdir(parents=True)
            original = ("  " + json.dumps(network, indent=4) + "\n\n").encode()
            (directory / "walking-network.json").write_bytes(original)
            (directory / "emergency-phones.json").write_text("[]")
            (directory / "incident-reports.json").write_text("[]")
            (directory / "research/closures.json").write_text(json.dumps(snapshot))
            with patch("route_data.ROOT", root), patch("sys.argv", ["route_data.py","--offline","--avoid-construction"]), redirect_stdout(io.StringIO()):
                main()
            self.assertEqual((directory / "walking-network.json").read_bytes(), original)
            self.assertEqual(json.loads((directory / "route-evidence.json").read_text())[0]["captured_at"], network["captured_at"])


if __name__ == "__main__":
    unittest.main()
