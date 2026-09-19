"""Explicit, dependency-free rebuild of public named-campus route evidence."""
import argparse
import hashlib
import heapq
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "https://arcgis-central.gis.vt.edu/arcgis/rest/services/"
PATH_SOURCE = BASE + "facilities/MultimodalRouting_2024_12_13/MapServer/6"
BUILDING_SOURCE = BASE + "vtcampusmap/Buildings/FeatureServer/0"
PHONE_SOURCE = BASE + "facilities/EmergencyAccessMappingLayers/FeatureServer/2"
ROOT = Path(__file__).resolve().parents[2]
LIMITATIONS = [
    "Static official campus pathway geometry; current closures, permissions and field conditions are unknown.",
    "Paths start/end at existing network vertices near building reference points, not verified entrances; endpoint offsets are excluded from path distance.",
    "No lighting observations. Accessibility and slope routing are not verified; NotADA segments are excluded because that tag may include barriers.",
    "Phone proximity is geometric distance to the path, not a verified accessible detour; operational status is unknown.",
    "Historical reports are a selected incomplete sample matched only to named endpoint buildings, not incidents on the path or a crime risk measure.",
]


def meters(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def build_graph(features):
    graph = {}
    for feature in features:
        # Unknown classification remains unknown, but a known barrier category is excluded.
        if feature["attributes"].get("ada_status") == "NotADA":
            continue
        for path in feature["geometry"]["paths"]:
            points = [tuple(point[:2]) for point in path]
            for a, b in zip(points, points[1:]):
                distance = meters(a, b)
                if distance > 0:
                    graph.setdefault(a, {})[b] = distance
                    graph.setdefault(b, {})[a] = distance
    return graph


def shortest_path(graph, start, end):
    if start not in graph or end not in graph:
        return None
    queue, costs, previous = [(0, start)], {start: 0}, {}
    while queue:
        cost, node = heapq.heappop(queue)
        if cost != costs[node]:
            continue
        if node == end:
            path = [end]
            while path[-1] != start:
                path.append(previous[path[-1]])
            return list(reversed(path))
        for neighbor, weight in sorted(graph[node].items()):
            if cost + weight < costs.get(neighbor, math.inf):
                costs[neighbor] = cost + weight
                previous[neighbor] = node
                heapq.heappush(queue, (cost + weight, neighbor))
    return None


def named_place_path(graph, references):
    """Choose nearest existing vertices in a shared component within 100m per place.

    No offset line is inserted into the path. Building reference points are not entrances.
    """
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
    choices = []
    for reference in references:
        nearest = {}
        for node in graph:
            distance = meters(reference, node)
            group = groups[node]
            if distance <= 100 and (group not in nearest or (distance, node) < nearest[group]):
                nearest[group] = (distance, node)
        choices.append(nearest)
    common = choices[0].keys() & choices[1].keys()
    if not common:
        return None, None
    group = min(common, key=lambda g: (choices[0][g][0] + choices[1][g][0], g))
    offsets = [round(choice[group][0], 2) for choice in choices]
    return shortest_path(graph, choices[0][group][1], choices[1][group][1]), offsets


def distance_to_path(point, path):
    """Local equirectangular point/segment distance, appropriate to this campus extent."""
    if len(path) < 2:
        raise ValueError("A path needs at least two coordinates")
    scale = math.cos(math.radians(point[1]))
    def xy(p):
        return ((p[0]-point[0])*111195.0802*scale, (p[1]-point[1])*111195.0802)
    best = math.inf
    for a, b in zip(path, path[1:]):
        ax, ay = xy(a)
        bx, by = xy(b)
        dx, dy = bx-ax, by-ay
        t = max(0, min(1, -(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        best = min(best, math.hypot(ax+t*dx, ay+t*dy))
    return best


def nearby_phones(path, phones, radius=50):
    if not math.isfinite(radius) or not 0 <= radius <= 100:
        raise ValueError("Phone radius must be 0–100 meters")
    result = []
    for phone in phones:
        distance = distance_to_path((phone["longitude"], phone["latitude"]), path)
        if distance <= radius:
            result.append({"phone_id": phone["phone_id"], "location": phone["location"],
                           "distance_meters": round(distance, 2), "source_url": PHONE_SOURCE,
                           "operational_status": "unknown"})
    return sorted(result, key=lambda item: (item["distance_meters"], item["phone_id"]))


def match_reports(reports, places):
    names = {place.strip().casefold() for place in places}
    return [{**report, "match_method": "exact_named_endpoint_place"} for report in reports
            if report["location"].strip().casefold() in names]


def lighting_summary(distance):
    return {"known_meters": 0, "lit_meters": 0, "unlit_meters": 0, "unknown_meters": distance}


def fetch_features(source, fields, where="1=1"):
    features = []
    for offset in range(0, 20000, 1000):
        url = source + "/query?" + urlencode({"f": "json", "where": where, "outFields": fields,
            "outSR": 4326, "returnGeometry": "true", "resultOffset": offset,
            "resultRecordCount": 1000, "orderByFields": fields.split(",")[0]})
        with urlopen(Request(url, headers={"User-Agent": "BeaconHackathonPublicData/1.0"}), timeout=30) as response:
            payload = json.loads(response.read(15_000_001))
        if "error" in payload or not isinstance(payload.get("features"), list):
            raise ValueError("GIS response failed validation")
        features.extend(payload["features"])
        if not payload.get("exceededTransferLimit"):
            return features
        if not payload["features"]:
            raise ValueError("Truncated GIS response")
    raise ValueError("GIS snapshot exceeded bounded feature count")


def build_evidence(network, phones, reports):
    graph = build_graph(network["features"])
    if not graph:
        raise ValueError("Empty pedestrian network")
    buildings = {row["attributes"]["name"]: row["attributes"] for row in network["buildings"]}
    rows = []
    for corridor, origin in [("newman-pritchard", "Newman Library"), ("eggleston-pritchard", "Eggleston Hall - East Wing"), ("downtown-pritchard", "Downtown Blacksburg")]:
        row = {"schema_version": 1, "corridor_id": corridor, "source_version": network["source_version"],
               "captured_at": network["captured_at"], "source_url": PATH_SOURCE, "status": "unsupported",
               "origin": origin, "destination": "Pritchard Hall", "geometry": None, "distance_meters": None,
               "nearby_phones": [], "historical_reports": [], "lighting": lighting_summary(None),
               "limitations": list(LIMITATIONS), "endpoint_offsets_meters": None}
        references = []
        for name in [origin, "Pritchard Hall"]:
            if name not in buildings:
                break
            building = buildings[name]
            references.append((building["longitude"], building["latitude"]))
        path, offsets = named_place_path(graph, references) if len(references) == 2 else (None, None)
        if path and len(path) > 1:
            distance = round(sum(meters(a, b) for a, b in zip(path, path[1:])), 2)
            row.update(status="supported", geometry={"type": "LineString", "coordinates": path},
                       distance_meters=distance, lighting=lighting_summary(distance),
                       nearby_phones=nearby_phones(path, phones), historical_reports=match_reports(reports, [origin, "Pritchard Hall"]),
                       endpoint_offsets_meters=offsets)
        else:
            row["limitations"].append("No verified connected named-endpoint path in this bounded network; no walking route is supplied.")
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Rebuild from the captured walking-network snapshot")
    args = parser.parse_args()
    directory = ROOT / "data/campus"
    if args.offline:
        network = json.loads((directory / "walking-network.json").read_text())
    else:
        features = fetch_features(PATH_SOURCE, "OBJECTID,ada_status,fieldverified,name")
        buildings = fetch_features(BUILDING_SOURCE, "objectid,name,latitude,longitude",
                                   "name IN ('Newman Library','Eggleston Hall - East Wing','Pritchard Hall')")
        version = hashlib.sha256(json.dumps([features, buildings], sort_keys=True).encode()).hexdigest()
        network = {"schema_version": 1, "source_url": PATH_SOURCE, "building_source_url": BUILDING_SOURCE,
                   "source_version": version, "captured_at": datetime.now(timezone.utc).isoformat(),
                   "attribution": "Virginia Tech campus GIS; public data, no endorsement. Source redistribution terms not established.",
                   "features": features, "buildings": buildings}
    phones = json.loads((directory / "emergency-phones.json").read_text())
    reports = json.loads((directory / "incident-reports.json").read_text())
    evidence = build_evidence(network, phones, reports)
    # All fetches and calculations finish before replacing a previous snapshot.
    for name, payload in [("walking-network.json", network), ("route-evidence.json", evidence)]:
        temporary = directory / (name + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n")
        temporary.replace(directory / name)
    for row in evidence:
        print(row["corridor_id"], row["status"], row["distance_meters"], "meters", len(row["nearby_phones"]), "phones")


if __name__ == "__main__":
    main()
