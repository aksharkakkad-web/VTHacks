#!/usr/bin/env python3
"""Refresh bounded official campus snapshots. Python 3.10+, standard library only.

Generated files are public source data, not student locations. No Databricks
credentials are needed here; the deployment script imports these JSON arrays.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "campus"
GTFS_URL = "https://www.bt4uclassic.org/gtfs/google_transit.zip"
CRIME_URL = "https://police.vt.edu/content/dam/police_vt_edu/crime-logs/2026/file_202609.pdf"
CRIME_SHA = "400db6da96ee7fe8c85d976b009864cfcdab10e5e53ec64bc64c721b6bc32e96"
GIS_URL = "https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/EmergencyAccessMappingLayers/FeatureServer/2/query"
NWS_URL = "https://api.weather.gov/points/37.2296,-80.4139"
ALERT_URL = "https://api.weather.gov/alerts/active?point=37.2296,-80.4139"
FARE_URL = "https://ridebt.org/fare-information"
UTC = timezone.utc


def iso(value):
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "BeaconCampusDemo/1.0 (public campus data research)"})
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read(15_000_001)
    if len(raw) > 15_000_000:
        raise ValueError("Source exceeds bounded 15 MB import")
    return raw


def write_json(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def manifest(source_id, title, url, raw, kind, count, coverage, limitations):
    return {"source_id": source_id, "title": title, "source_url": url,
            "captured_at": iso(datetime.now(UTC)), "sha256": hashlib.sha256(raw).hexdigest(),
            "source_kind": kind, "row_count": count, "coverage": coverage,
            "license_note": "Public official source; attribution retained. No endorsement. See source terms before redistribution beyond this demo.",
            "limitations": limitations}


def gtfs_seconds(value):
    parts = value.split(":")
    if len(parts) != 3 or any(not p.isdigit() for p in parts):
        raise ValueError("Invalid GTFS time")
    hour, minute, second = map(int, parts)
    if minute > 59 or second > 59 or hour > 47:
        raise ValueError("Invalid GTFS time")
    return hour * 3600 + minute * 60 + second


def service_active(service_id, service_date, calendars, exceptions):
    day = service_date.strftime("%Y%m%d")
    exception = next((r for r in exceptions if r["service_id"] == service_id and r["date"] == day), None)
    if exception:
        return exception["exception_type"] == "1"
    weekday = service_date.strftime("%A").lower()
    return any(r["service_id"] == service_id and r["start_date"] <= day <= r["end_date"]
               and r[weekday] == "1" for r in calendars)


def expand_departures(snapshot, service_dates):
    departures = []
    tz = ZoneInfo(snapshot["agency_timezone"])
    for day in service_dates:
        # GTFS defines service-day time from local noon minus twelve hours,
        # preserving elapsed time across DST transitions and >24:00 trips.
        noon = datetime.combine(day, datetime.min.time(), tzinfo=tz).replace(hour=12)
        start = noon.astimezone(UTC) - timedelta(hours=12)
        for trip in snapshot["patterns"]:
            if not service_active(trip["service_id"], day, snapshot["calendar"], snapshot["calendar_dates"]):
                continue
            departure = gtfs_seconds(trip["departure_time"])
            arrival = gtfs_seconds(trip["arrival_time"])
            if arrival < departure:
                raise ValueError("GTFS arrival precedes boarding")
            departures.append({"corridor_id": trip.get("corridor_id", "newman-pritchard"), "trip_id": trip["trip_id"],
                               "route_id": trip["route_id"], "route_name": trip.get("route_name", snapshot["route"]["route_long_name"]),
                               "service_date": day.isoformat(), "departure_at": iso(start + timedelta(seconds=departure)),
                               "arrival_at": iso(start + timedelta(seconds=arrival)),
                               "travel_minutes": round((arrival - departure) / 60, 6),
                               "from_stop_id": trip.get("from_stop_id", "1100"), "to_stop_id": "1146", "source_id": "bt-gtfs",
                               "source_version": snapshot["feed_info"]["feed_version"] +
                               (":" + snapshot["source_sha256"][:12] if snapshot.get("source_sha256") else "")})
    return sorted(departures, key=lambda r: (r["departure_at"], r["trip_id"]))


def load_transit(service_dates):
    raw = fetch(GTFS_URL)
    archive = zipfile.ZipFile(io.BytesIO(raw))
    def rows(name):
        if name not in archive.namelist():
            return []
        if archive.getinfo(name).file_size > 30_000_000:
            raise ValueError("GTFS member exceeds import limit")
        return list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))
    stops = {r["stop_id"]: r for r in rows("stops.txt")}
    routes = {r["route_id"]: r for r in rows("routes.txt")}
    trips = {r["trip_id"]: r for r in rows("trips.txt")}
    groups = defaultdict(list)
    stop_times = rows("stop_times.txt")
    for r in stop_times:
        if r["stop_id"] in ("1100", "1143", "1146"):
            groups[r["trip_id"]].append(r)
    patterns = []
    for trip_id, stop_rows in groups.items():
        ordered = sorted(stop_rows, key=lambda r: int(r["stop_sequence"]))
        for board in ordered:
            if board["stop_id"] not in ("1100", "1143") or board.get("pickup_type", "0") == "1":
                continue
            alight = next((r for r in ordered if r["stop_id"] == "1146"
                           and int(r["stop_sequence"]) > int(board["stop_sequence"])
                           and r.get("drop_off_type", "0") != "1"), None)
            if alight:
                route_id = trips[trip_id]["route_id"]
                corridor = "newman-pritchard" if board["stop_id"] == "1100" else "eggleston-pritchard"
                if any(p["trip_id"] == trip_id and p["corridor_id"] == corridor for p in patterns):
                    continue
                patterns.append({"trip_id": trip_id, "route_id": route_id,
                                 "route_name": routes[route_id]["route_long_name"], "corridor_id": corridor,
                                 "from_stop_id": board["stop_id"],
                                 "service_id": trips[trip_id]["service_id"], "departure_time": board["departure_time"],
                                 "arrival_time": alight["arrival_time"], "board_sequence": int(board["stop_sequence"]),
                                 "alight_sequence": int(alight["stop_sequence"])})
    if not patterns or not {p["route_id"] for p in patterns}.issubset({"CAS", "HXS"}):
        raise ValueError("Expected direct CAS/HXS corridors changed; review before import")
    agency = rows("agency.txt")[0]
    snapshot = {"agency_timezone": agency["agency_timezone"], "agency_name": agency["agency_name"],
                "feed_info": rows("feed_info.txt")[0], "route": next(r for r in rows("routes.txt") if r["route_id"] == "CAS"),
                "stops": [stops[s] for s in ("1100", "1143", "1146")], "calendar": rows("calendar.txt"),
                "calendar_dates": rows("calendar_dates.txt"), "patterns": sorted(patterns, key=lambda p: p["trip_id"]),
                "source_url": GTFS_URL, "source_sha256": hashlib.sha256(raw).hexdigest(),
                "source_counts": {"stops": len(stops), "routes": len(rows("routes.txt")), "stop_times": len(stop_times)},
                "coverage_note": "Direct Newman Library or East Eggleston Hall stops to Pritchard Hall stop; not downtown walking routes. Scheduled, not live arrivals."}
    departure_rows = expand_departures(snapshot, service_dates)
    write_json("transit-snapshot.json", snapshot)
    write_json("transit-departures.json", departure_rows)
    return manifest("bt-gtfs", "Blacksburg Transit GTFS", GTFS_URL, raw, "scheduled", len(departure_rows),
                    json.dumps(snapshot["feed_info"]), snapshot["coverage_note"])


def load_phones():
    url = GIS_URL + "?" + urllib.parse.urlencode({"where": "1=1", "outFields": "objectid,location,id",
              "returnGeometry": "true", "outSR": "4326", "f": "geojson", "resultRecordCount": "2000"})
    raw = fetch(url)
    document = json.loads(raw)
    if document.get("exceededTransferLimit") or not document.get("features"):
        raise ValueError("Phone layer empty or incomplete")
    result = [{"phone_id": str(f["properties"]["objectid"]), "location": f["properties"].get("location"),
               "longitude": f["geometry"]["coordinates"][0], "latitude": f["geometry"]["coordinates"][1],
               "operational_status": "unknown", "source_id": "vt-emergency-phones"} for f in document["features"]]
    write_json("emergency-phones.json", result)
    return manifest("vt-emergency-phones", "VT public emergency-phone map", url, raw, "official_snapshot", len(result),
                    "Public facilities layer, WGS84 coordinates; campus inventory snapshot", "Map positions do not establish availability, working condition, or a safe route.")


def load_crime():
    raw = fetch(CRIME_URL)
    if hashlib.sha256(raw).hexdigest() != CRIME_SHA:
        raise ValueError("Crime PDF changed since manual review; preserve existing sample until re-reviewed")
    # Selected public facts reviewed against official source text, PDF pages 1–2.
    records = [
        ("2026-15058", "2026-09-01", "Obtaining money by false pretenses", "Johnson Hall", "2026-08-24", "2026-08-24", "Active", 1),
        ("2026-15047", "2026-09-01", "Petit larceny", "Outside Litton Reeves", "2026-01-05", "2026-01-05", "Inactive", 1),
        ("2026-15077", "2026-09-01", "Obtaining money by false pretenses", "Johnson Hall", "2026-08-24", "2026-08-24", "Active", 1),
        ("2026-15071", "2026-09-01", "Hit and run: unattended vehicle", "Outside McComas Hall", "2026-09-01", "2026-09-01", "Inactive", 1),
        ("2026-15065", "2026-09-01", "Grand larceny: bicycle", "Outside Miles Hall", "2026-08-30", "2026-09-01", "Inactive", 1),
        ("2026-15210", "2026-09-02", "Petit larceny", "Rec Sports Field House", "2026-09-02", "2026-09-02", "Active", 1),
        ("2026-15198", "2026-09-02", "Obtain money by false pretense", "Hoge Hall", "2026-09-02", "2026-09-02", "Active", 1),
        ("2026-15178", "2026-09-02", "Petit larceny", "War Memorial Gym", "2026-09-02", "2026-09-02", "Unfounded 2026-09-04", 1),
        ("2026-15145", "2026-09-02", "Destruction of property, value at least $1000", "Inn at Virginia Tech parking lot", "2026-08-31", "2026-08-31", "Inactive", 1),
        ("2026-15271", "2026-09-03", "Petit larceny: building", "Newman Library", "2023-11-01", "2026-09-01", "Active", 2),
        ("2026-15354", "2026-09-04", "Petit larceny", "Pritchard Hall", "2026-09-02", "2026-09-04", "Inactive", 2),
        ("2026-15456", "2026-09-05", "Weapons violation", "207 West Roanoke Street parking lot", "2026-09-05", "2026-09-05", "Inactive", 2),
    ]
    keys = ("report_id", "reported_date", "offense", "location", "occurrence_start", "occurrence_end", "disposition", "source_page")
    result = [dict(zip(keys, row), source_id="vt-crime-september-sample", source_url=CRIME_URL,
                   extraction_method="manually_reviewed_public_source_text",
                   coverage_note="Selected 12 records, not complete crime coverage. Reports are not predictions; Active is case disposition, not a live alert.") for row in records]
    write_json("incident-reports.json", result)
    return manifest("vt-crime-september-sample", "VT September 2026 public crime-log sample", CRIME_URL, raw,
                    "historical_sample", len(result), "Selected reports dated September 1–5, 2026; occurrence dates differ",
                    "Incomplete selected sample. Includes an unfounded report, kept explicitly labeled. No route-risk score or active threat inference.")


def weather_context(periods, alerts, captured_at, source_url, source_hash, forecast_updated_at, alerts_hash="fixture"):
    """Time-selectable forecast rows, bounded to 24 hours from the successful fetch."""
    if forecast_updated_at > captured_at + timedelta(minutes=5) or forecast_updated_at <= captured_at - timedelta(hours=24):
        raise ValueError("NWS forecast issue time is future or stale")
    horizon = min(captured_at + timedelta(hours=24), forecast_updated_at + timedelta(hours=24))
    rows = []
    for period in periods:
        start = datetime.fromisoformat(period["start_at"])
        end = min(datetime.fromisoformat(period["end_at"]), horizon)
        if end <= captured_at or start >= horizon or end <= start:
            continue
        effective = max(captured_at, start)
        severe_windows = []
        for alert in alerts:
            if alert.get("severity", "").lower() not in ("severe", "extreme"):
                continue
            # A missing onset on an active alert means only "known at capture",
            # never an invented earlier start.
            onset = datetime.fromisoformat(alert["onset"]) if alert.get("onset") else captured_at
            expires = datetime.fromisoformat(alert["expires"])
            if onset < end and expires > effective:
                severe_windows.append((max(onset, effective), min(expires, end)))
        summary = period["short_forecast"].lower()
        baseline = "unknown"
        if re.search(r"rain|showers|thunderstorm", summary) and (period["precipitation_probability"] or 0) >= 40:
            baseline = "rain"
        elif re.fullmatch(r"(mostly |partly )?(clear|sunny|cloudy)", summary):
            baseline = "clear"
        boundaries = sorted({effective, end, *(edge for window in severe_windows for edge in window)})
        for left, right in zip(boundaries, boundaries[1:]):
            severe = any(onset <= left and right <= expires for onset, expires in severe_windows)
            for corridor in ("newman-pritchard", "eggleston-pritchard", "downtown-pritchard"):
                rows.append({"corridor_id": corridor,
                             "context_version": f"nws-{source_hash[:12]}-{alerts_hash[:12]}-{iso(left)}",
                             "updated_at": iso(forecast_updated_at), "valid_from": iso(left), "valid_until": iso(right),
                             "weather": "severe" if severe else baseline,
                             "lighting": "unknown", "walking_path_closed": None,
                             "active_official_alert": True if severe else None,
                             "historical_report_count": None, "history_lookback_days": None,
                             "source_url": source_url})
    if not rows:
        raise ValueError("NWS forecast contains no currently valid periods")
    return rows


def forecast_horizon(periods, captured_at, hours=72):
    """Retain a contiguous forecast covering the next 72 hours, not 72 old rows."""
    horizon = captured_at + timedelta(hours=hours)
    selected, covered_until = [], captured_at
    for period in periods:
        start = datetime.fromisoformat(period["start_at"])
        end = datetime.fromisoformat(period["end_at"])
        if start.tzinfo is None or end.tzinfo is None or end <= start:
            raise ValueError("Invalid forecast interval")
        if end <= captured_at:
            continue
        if start > covered_until or (selected and start < covered_until):
            raise ValueError("Forecast horizon has a gap or overlapping periods")
        selected.append(period)
        covered_until = end
        if covered_until >= horizon:
            return selected
    raise ValueError("NWS forecast does not cover the next 72 hours")


def load_weather():
    points = json.loads(fetch(NWS_URL))
    hourly_url = points["properties"]["forecastHourly"]
    raw = fetch(hourly_url)
    forecast = json.loads(raw)
    alerts_raw = fetch(ALERT_URL)
    alerts = json.loads(alerts_raw)
    now = datetime.now(UTC)
    periods = [{"start_at": p["startTime"], "end_at": p["endTime"], "temperature": p["temperature"],
                "temperature_unit": p["temperatureUnit"], "precipitation_probability": p["probabilityOfPrecipitation"]["value"],
                "short_forecast": p["shortForecast"], "wind_speed": p["windSpeed"], "is_daytime": p["isDaytime"],
                "source_id": "nws-hourly"} for p in forecast["properties"]["periods"]]
    periods = forecast_horizon(periods, now)
    alert_rows = [{"alert_id": f["id"], "event": f["properties"]["event"], "severity": f["properties"]["severity"],
                   "onset": f["properties"].get("onset"), "expires": f["properties"]["expires"],
                   "headline": f["properties"].get("headline"), "source_id": "nws-alerts"} for f in alerts["features"]]
    context = weather_context(periods, alert_rows, now, hourly_url, hashlib.sha256(raw).hexdigest(),
                              datetime.fromisoformat(forecast["properties"]["updateTime"]),
                              hashlib.sha256(alerts_raw).hexdigest())
    write_json("weather-hourly.json", periods)
    write_json("weather-alerts.json", alert_rows)
    write_json("route-context.json", context)
    return [manifest("nws-hourly", "NWS Blacksburg hourly forecast", hourly_url, raw, "forecast_snapshot", len(periods),
                     "NWS RNK grid58,66 near campus; forecast periods explicitly timestamped", "Area forecast, not exact path conditions. Refresh before demo. Clear means no rain penalty, not guaranteed conditions."),
            manifest("nws-alerts", "NWS weather-alert snapshot", ALERT_URL, alerts_raw, "official_snapshot", len(alert_rows),
                     "Active weather alerts for public campus reference point at capture time", "Not a campus crime-alert feed. Empty snapshot means no weather alert returned at capture, not a guarantee of safety.")]


def load_fare():
    raw = fetch(FARE_URL)
    text = re.sub(r"<[^>]*>", " ", raw.decode("utf-8"))
    if not re.search(r"Fare-Free on all vehicles", text, re.IGNORECASE):
        raise ValueError("Fare-free statement changed; review before applying zero fare")
    write_json("transit-fares.json", [{"agency": "Blacksburg Transit", "cost": 0, "currency": "USD",
                                      "applies_to": "All Blacksburg and Christiansburg BT services", "source_id": "bt-fare", "source_url": FARE_URL}])
    return manifest("bt-fare", "Official Blacksburg Transit fares", FARE_URL, raw, "official_snapshot", 1,
                    "Agency fare policy at capture", "Recheck official page before demo; not a third-party ride fare.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-date", type=date.fromisoformat,
                        default=datetime.now(ZoneInfo("America/New_York")).date() - timedelta(days=1))
    parser.add_argument("--days", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.days <= 14:
        parser.error("--days must be 1–14")
    service_dates = [args.start_date + timedelta(days=i) for i in range(args.days)]
    existing = OUT / "source-manifest.json"
    sources = {r["source_id"]: r for r in json.loads(existing.read_text())} if existing.exists() else {}
    failures = []
    for name, loader in [("transit", lambda: load_transit(service_dates)), ("phones", load_phones),
                         ("crime", load_crime), ("weather", load_weather), ("fare", load_fare)]:
        try:
            result = loader()
            for row in result if isinstance(result, list) else [result]:
                sources[row["source_id"]] = row
                print(f"{row['source_id']}: {row['row_count']} records")
        except Exception as error:
            failures.append({"source": name, "error": str(error)})
            print(f"{name}: refresh failed; prior snapshot retained: {error}")
    write_json("source-manifest.json", list(sources.values()))
    write_json("refresh-status.json", {"attempted_at": iso(datetime.now(UTC)), "failures": failures})
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
