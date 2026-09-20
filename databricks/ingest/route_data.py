"""Explicit, dependency-free rebuild of public named-campus route evidence."""
import argparse
import hashlib
import heapq
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

BASE = "https://arcgis-central.gis.vt.edu/arcgis/rest/services/"
PATH_SOURCE = BASE + "facilities/MultimodalRouting_2024_12_13/MapServer/6"
BUILDING_SOURCE = BASE + "vtcampusmap/Buildings/FeatureServer/0"
PHONE_SOURCE = BASE + "facilities/EmergencyAccessMappingLayers/FeatureServer/2"
ROOT = Path(__file__).resolve().parents[2]
AVOIDANCE_VERSION = "official-network-construction-avoidance-v1"
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


def instant(value):
    if not isinstance(value, str):
        raise ValueError("Missing evidence timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Evidence time must have a timezone")
    return result.timestamp()


def iso_time(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def construction_polygons(geometry):
    """Validate and prepare exact source polygons; no inferred buffers or connectors."""
    if not isinstance(geometry, dict) or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("Invalid construction geometry")
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    if not isinstance(polygons, list) or not 1 <= len(polygons) <= 1000:
        raise ValueError("Invalid construction polygon count")
    result = []
    for polygon in polygons:
        if not isinstance(polygon, list) or not 1 <= len(polygon) <= 100:
            raise ValueError("Invalid construction rings")
        rings = []
        for ring in polygon:
            if not isinstance(ring, list) or not 4 <= len(ring) <= 10000:
                raise ValueError("Invalid construction ring")
            for point in ring:
                if not isinstance(point, list) or len(point) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in point) or abs(point[0]) > 180 or abs(point[1]) > 90:
                    raise ValueError("Invalid construction coordinate")
            if ring[0] != ring[-1]:
                raise ValueError("Open construction ring")
            rings.append(ring)
        outer = rings[0]
        bounds = (min(p[0] for p in outer), min(p[1] for p in outer), max(p[0] for p in outer), max(p[1] for p in outer))
        result.append((rings, bounds))
    return result


def intersects_construction(path, polygons):
    def cross(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])

    def on_segment(p, a, b):
        return abs(cross(a, b, p)) <= 1e-12 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])

    def inside(p, ring):
        hit = False
        for a, b in zip(ring, ring[1:]):
            if on_segment(p, a, b):
                return True
            if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:
                hit = not hit
        return hit

    for a, b in zip(path, path[1:]):
        for rings, bounds in polygons:
            if max(a[0], b[0]) < bounds[0] or min(a[0], b[0]) > bounds[2] or max(a[1], b[1]) < bounds[1] or min(a[1], b[1]) > bounds[3]:
                continue
            if any(inside(p, rings[0]) and not any(inside(p, hole) for hole in rings[1:]) for p in (a, b)):
                return True
            for ring in rings:
                for c, d in zip(ring, ring[1:]):
                    if (cross(a, b, c)*cross(a, b, d) < 0 and cross(c, d, a)*cross(c, d, b) < 0) or on_segment(c, a, b) or on_segment(d, a, b) or on_segment(a, c, d) or on_segment(b, c, d):
                        return True
    return False


def prepare_construction(snapshot, evaluated_at):
    """Conservative avoidance of fresh published work areas, not proof of sidewalk closure."""
    now = instant(evaluated_at)
    metadata = {"algorithm_version": AVOIDANCE_VERSION, "status": "unavailable", "evaluated_at": iso_time(now),
                "valid_until": None, "source_snapshot_captured_at": None, "source_snapshot_version": None,
                "excluded_area_ids": [], "sources": [], "reason": "CONSTRUCTION_EVIDENCE_UNAVAILABLE"}
    try:
        if not isinstance(snapshot, dict) or snapshot.get("dataset") != "closures" or snapshot.get("schema_version") != 1:
            raise ValueError("Invalid construction snapshot")
        metadata["source_snapshot_version"] = hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        captured = instant(snapshot["captured_at"])
        metadata["source_snapshot_captured_at"] = snapshot["captured_at"]
        if captured > now or now-captured >= 3600:
            metadata["reason"] = "CONSTRUCTION_EVIDENCE_STALE_OR_FUTURE"
            return [], metadata
        sources = snapshot.get("sources")
        if not isinstance(sources, list) or not 1 <= len(sources) <= 20:
            raise ValueError("Missing construction provenance")
        deadlines, source_urls = [captured + 3600], set()
        for source in sources:
            url = urlparse(source["url"])
            if url.scheme != "https" or url.hostname != "arcgis-central.gis.vt.edu" or url.username or url.password or url.port:
                raise ValueError("Invalid construction source")
            if "/facilities/Construction_Closures/FeatureServer/0/query" != url.path.removeprefix("/arcgis/rest/services"):
                continue  # Road delays are not used to avoid pedestrian paths.
            source_time = instant(source["captured_at"])
            if source_time > now or now-source_time >= 3600 or not re.fullmatch(r"[a-f0-9]{64}", source["sha256"]):
                raise ValueError("Stale or unversioned construction source")
            source_urls.add(source["url"])
            metadata["sources"].append({k: source[k] for k in ("url", "sha256", "captured_at", "coverage")})
            deadlines.append(source_time + 3600)
        if not source_urls or not isinstance(snapshot.get("records"), list) or len(snapshot["records"]) > 10000:
            raise ValueError("Missing construction source records")
        polygons, seen = [], set()
        for row in snapshot["records"]:
            if row.get("kind") != "area":
                continue
            if not isinstance(row.get("id"), str) or row["id"] in seen or row.get("source_url") not in source_urls:
                raise ValueError("Invalid construction record provenance")
            seen.add(row["id"])
            if row.get("starts_at") is None or row.get("ends_at") is None:
                continue  # Undated work does not become current evidence.
            start, end = instant(row["starts_at"]), instant(row["ends_at"])
            if end <= start:
                raise ValueError("Invalid construction interval")
            if start > now:
                deadlines.append(start)
            if start <= now < end:
                polygons.extend(construction_polygons(row["geometry"]))
                metadata["excluded_area_ids"].append(row["id"])
                deadlines.append(end)
        metadata.update(status="applied", reason=None, valid_until=iso_time(min(deadlines)))
        metadata["excluded_area_ids"].sort()
        return polygons, metadata
    except (ValueError, TypeError, KeyError, OverflowError):
        return [], metadata


def avoid_construction_graph(graph, polygons):
    result = {}
    for a, edges in graph.items():
        for b, distance in edges.items():
            if a < b and not intersects_construction([a, b], polygons):
                result.setdefault(a, {})[b] = distance
                result.setdefault(b, {})[a] = distance
    return result


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


def build_evidence(network, phones, reports, *, avoid_construction=False, construction_snapshot=None, evaluated_at=None):
    graph = build_graph(network["features"])
    if not graph:
        raise ValueError("Empty pedestrian network")
    buildings = {row["attributes"]["name"]: row["attributes"] for row in network["buildings"]}
    avoidance = None
    filtered = graph
    if avoid_construction:
        polygons, avoidance = prepare_construction(construction_snapshot, evaluated_at or datetime.now(timezone.utc).isoformat())
        filtered = avoid_construction_graph(graph, polygons) if avoidance["status"] == "applied" else {}
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
        if avoidance:
            # Preserve the original verified graph anchors, rather than quietly moving the pickup/end.
            path = shortest_path(filtered, path[0], path[-1]) if path else None
            row["construction_avoidance"] = dict(avoidance)
            row["limitations"][0] = "Static official campus pathway geometry; current field conditions and access permissions remain unknown."
            if avoidance["status"] == "applied":
                row["limitations"].append("Conservatively avoids currently dated published construction areas only while construction_avoidance.valid_until is current; area descriptions do not prove every intersecting sidewalk is closed.")
                row["limitations"].append("Avoiding published work areas does not prove the remaining path is open, illuminated, accessible or safe.")
            else:
                row["limitations"].append("Construction avoidance requested but fresh source evidence is unavailable; no walking route is supplied.")
        if path and len(path) > 1:
            distance = round(sum(meters(a, b) for a, b in zip(path, path[1:])), 2)
            row.update(status="supported", geometry={"type": "LineString", "coordinates": path},
                       distance_meters=distance, lighting=lighting_summary(distance),
                       nearby_phones=nearby_phones(path, phones), historical_reports=match_reports(reports, [origin, "Pritchard Hall"]),
                       endpoint_offsets_meters=offsets)
        else:
            row["limitations"].append("No verified connected named-endpoint path in this bounded network; no walking route is supplied.")
        if avoidance:
            row["source_version"] = hashlib.sha256(json.dumps({"algorithm": AVOIDANCE_VERSION,
                "network_version": network["source_version"], "construction_snapshot_version": avoidance["source_snapshot_version"],
                "excluded_area_ids": avoidance["excluded_area_ids"], "avoidance_status": avoidance["status"],
                "corridor_id": corridor, "geometry": row["geometry"], "endpoint_offsets_meters": row["endpoint_offsets_meters"]},
                sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Rebuild from the captured walking-network snapshot")
    parser.add_argument("--avoid-construction", action="store_true", help="Avoid currently dated areas from a fresh captured official construction snapshot; unavailable evidence supplies no route")
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
    construction = None
    if args.avoid_construction:
        try:
            construction = json.loads((directory / "research/closures.json").read_text())
        except (OSError, ValueError):
            pass  # Explicit unavailable routes, never silent fallback through work areas.
    evidence = build_evidence(network, phones, reports, avoid_construction=args.avoid_construction, construction_snapshot=construction)
    # All fetches and calculations finish before replacing a previous snapshot.
    outputs = [("route-evidence.json", evidence)]
    if not args.offline:
        outputs.insert(0, ("walking-network.json", network))
    for name, payload in outputs:
        temporary = directory / (name + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n")
        temporary.replace(directory / name)
    for row in evidence:
        print(row["corridor_id"], row["status"], row["distance_meters"], "meters", len(row["nearby_phones"]), "phones")


if __name__ == "__main__":
    main()
