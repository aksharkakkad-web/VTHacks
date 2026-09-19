"""Offline, draft-only pilot pedestrian-network coverage from public geometry."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from route_data import build_graph, meters, shortest_path

ROOT = Path(__file__).resolve().parents[2]
TOWN = "https://tobmaps.blacksburg.gov/server/rest/services/transportation/Paths_to_the_Future/FeatureServer/0"
MAX_OFFSET_METERS = 100
WALK_METERS_PER_MINUTE = 80


def valid_coordinate(value):
    return (isinstance(value, (list, tuple)) and len(value) == 2
            and all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in value)
            and -82 < value[0] < -79 and 36 < value[1] < 39)


def validate_zones(zones):
    if zones.get("status") != "DRAFT_PROPOSED_UNAPPROVED":
        raise ValueError("Zones must remain DRAFT_PROPOSED_UNAPPROVED")
    ids, stops, coordinates = set(), set(), set()
    for key in ("departures", "destinations"):
        rows = zones.get(key)
        if not isinstance(rows, list) or len(rows) != 5:
            raise ValueError(f"Exactly five {key} required")
        for row in rows:
            if not isinstance(row, dict) or not all(isinstance(row.get(k), str) and row[k].strip() for k in ("id", "name", "stop_id")):
                raise ValueError("Each anchor needs id, name, and source stop_id")
            if (row["id"] in ids or row["stop_id"] in stops or not valid_coordinate(row.get("coordinate"))
                    or tuple(row["coordinate"]) in coordinates):
                raise ValueError("Duplicate anchor or invalid coordinate")
            ids.add(row["id"])
            stops.add(row["stop_id"])
            coordinates.add(tuple(row["coordinate"]))


def validate_feature(feature):
    attrs = feature.get("attributes", {})
    paths = feature.get("geometry", {}).get("paths")
    if not isinstance(paths, list) or not paths:
        raise ValueError(f"Missing paths for object {attrs.get('OBJECTID')}")
    for path in paths:
        if not isinstance(path, list) or len(path) < 2 or not all(valid_coordinate(p[:2]) for p in path):
            raise ValueError(f"Invalid WGS84 path for object {attrs.get('OBJECTID')}")


def eligible_town_features(features):
    result = []
    for feature in features:
        validate_feature(feature)
        attrs = feature["attributes"]
        if attrs.get("Status") == "Existing" and attrs.get("Type") in ("Sidewalk", "Trail"):
            result.append(feature)
    return result


def components(graph):
    groups = {}
    for start in graph:
        if start in groups:
            continue
        group = len(groups)
        pending = [start]
        while pending:
            node = pending.pop()
            if node in groups:
                continue
            groups[node] = group
            pending.extend(graph[node])
    return groups


def nearest_by_component(graph, groups, coordinate):
    choice = {}
    for node in graph:
        offset = meters(coordinate, node)
        group = groups[node]
        if offset <= MAX_OFFSET_METERS and (group not in choice or (offset, node) < choice[group]):
            choice[group] = (offset, node)
    return choice


def build_matrix(zones, town_features, vt_features, source_hashes):
    validate_zones(zones)
    graph = build_graph(eligible_town_features(town_features) + vt_features)
    groups = components(graph)
    anchors = zones["departures"] + zones["destinations"]
    choices = {row["id"]: nearest_by_component(graph, groups, row["coordinate"]) for row in anchors}
    results = []
    for origin, destination in ((a, b) for a in zones["departures"] for b in zones["destinations"]):
        for start, end, direction in ((origin, destination, "forward"), (destination, origin, "reverse")):
            source_choice, target_choice = choices[start["id"]], choices[end["id"]]
            shared = source_choice.keys() & target_choice.keys()
            path = None
            offsets = None
            if shared:
                group = min(shared, key=lambda g: (source_choice[g][0] + target_choice[g][0], g))
                offsets = [round(source_choice[group][0], 2), round(target_choice[group][0], 2)]
                path = shortest_path(graph, source_choice[group][1], target_choice[group][1])
            distance = round(sum(graph[a][b] for a, b in zip(path, path[1:])), 2) if path else None
            results.append({"from_id": start["id"], "to_id": end["id"], "direction": direction,
                            "status": "supported" if path else "unsupported",
                            "path": [list(p) for p in path] if path else None,
                            "distance_meters": distance,
                            "walking_minutes": round(distance / WALK_METERS_PER_MINUTE, 2) if distance is not None else None,
                            "end_offsets_meters": offsets if path else None,
                            "source_hashes": source_hashes,
                            "limitations": ["Network geometry only; no verified entrance or connector from reference stop to route vertex.",
                                            "Current passability, closures, lighting and accessibility are unknown."]})
    return {"status": "DRAFT_PROPOSED_UNAPPROVED", "scope": "network_coverage_not_operational_clearance",
            "departure_count": 5, "destination_count": 5, "directional_count": 50,
            "supported_count": sum(row["status"] == "supported" for row in results),
            "results": results}


def fetch_json(url, params):
    address = url + "?" + urlencode({**params, "f": "json"})
    with urlopen(Request(address, headers={"User-Agent": "Beacon-public-research/1"}), timeout=30) as response:
        value = json.load(response)
    if "error" in value:
        raise ValueError(f"ArcGIS error: {value['error']}")
    return value


def fetch_town_snapshot():
    meta = fetch_json(TOWN, {})
    if meta.get("name") != "Existing" or meta.get("objectIdField") != "OBJECTID":
        raise ValueError("Unexpected Town layer")
    count = fetch_json(TOWN + "/query", {"where": "1=1", "returnCountOnly": "true"})["count"]
    page_size = min(500, meta.get("maxRecordCount", 500))
    features = []
    for offset in range(0, count, page_size):
        page = fetch_json(TOWN + "/query", {"where": "1=1", "outFields": "*", "outSR": "4326",
                                               "returnGeometry": "true", "orderByFields": "OBJECTID ASC",
                                               "resultOffset": offset, "resultRecordCount": page_size})
        features.extend(page.get("features", []))
    ids = [f["attributes"]["OBJECTID"] for f in features]
    if len(features) != count or len(set(ids)) != count:
        raise ValueError("Incomplete or duplicate Town page retrieval")
    for feature in features:
        validate_feature(feature)
    return {"source_url": TOWN, "layer": "Existing", "spatial_reference": "EPSG:4326",
            "captured_at": datetime.now(timezone.utc).isoformat(), "expected_count": count,
            "features": features}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", action="store_true", help="Read public Town Existing layer and save snapshot")
    parser.add_argument("--offline", action="store_true", help="Build from local snapshots only")
    args = parser.parse_args()
    if args.capture == args.offline:
        parser.error("Choose exactly one of --capture or --offline")
    directory = ROOT / "data/campus/pilot"
    directory.mkdir(parents=True, exist_ok=True)
    town_path = directory / "town-existing-wgs84.json"
    if args.capture:
        snapshot = fetch_town_snapshot()
        town_path.write_text(json.dumps(snapshot, separators=(",", ":")) + "\n")
    else:
        snapshot = json.loads(town_path.read_text())
    vt_path = ROOT / "data/campus/walking-network.json"
    vt = json.loads(vt_path.read_text())
    zones = json.loads((directory / "draft-zones.json").read_text())
    result = build_matrix(zones, snapshot["features"], vt["features"],
                          {"town_sha256": sha256(town_path), "vt_sha256": sha256(vt_path),
                           "bt_stops_sha256": sha256(ROOT / "data/campus/transit-full/stops.json")})
    result["generated_at"] = datetime.now(timezone.utc).isoformat()
    result["town_source_url"] = TOWN
    result["town_captured_at"] = snapshot["captured_at"]
    (directory / "coverage-matrix.json").write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({"source_count": snapshot["expected_count"], "eligible_town_count": len(eligible_town_features(snapshot["features"])),
                      "directional_count": len(result["results"]), "supported_count": result["supported_count"]}))


if __name__ == "__main__":
    main()
