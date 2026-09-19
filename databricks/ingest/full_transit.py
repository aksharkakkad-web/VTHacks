#!/usr/bin/env python3
"""Complete official GTFS capture with bounded service-day indexing and direct journeys."""
import argparse
import csv
import hashlib
import io
import json
import math
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from refresh_campus import GTFS_URL, fetch, gtfs_seconds, service_active

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data' / 'campus' / 'transit-full'
TABLES = ('agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar', 'calendar_dates', 'feed_info')
REQUIRED = ('agency', 'stops', 'routes', 'trips', 'stop_times')


def _iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def _unique(rows, key, table):
    identifiers = [row.get(key, '') for row in rows]
    if not all(identifiers) or len(identifiers) != len(set(identifiers)):
        raise ValueError(f'{table}: missing or duplicate {key}')
    return set(identifiers)


def import_archive(raw, start, days):
    """Validate all rows before producing a compact trip-per-service-date index."""
    if days < 14:
        raise ValueError('At least 14 service dates required')
    if isinstance(start, str):
        start = date.fromisoformat(start)
    if len(raw) > 15_000_000:
        raise ValueError('GTFS source exceeds 15 MB bound')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        members = set(archive.namelist())
        if any(f'{table}.txt' not in members for table in REQUIRED):
            raise ValueError('Missing required GTFS table')
        if not ({'calendar.txt', 'calendar_dates.txt'} & members):
            raise ValueError('Missing service calendar')
        tables = {}
        for table in TABLES:
            name = f'{table}.txt'
            if name not in members:
                tables[table] = []
                continue
            if archive.getinfo(name).file_size > 30_000_000:
                raise ValueError(f'{name} exceeds member limit')
            tables[table] = list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
    agency = tables['agency']
    if not agency or not agency[0].get('agency_timezone'):
        raise ValueError('Missing agency timezone')
    if len(agency) > 1 or any(row.get('agency_id') for row in agency):
        agency_ids = _unique(agency, 'agency_id', 'agency')
    else:
        agency_ids = set()
    tz = ZoneInfo(agency[0]['agency_timezone'])
    stop_ids = _unique(tables['stops'], 'stop_id', 'stops')
    route_ids = _unique(tables['routes'], 'route_id', 'routes')
    for route in tables['routes']:
        route_agency = route.get('agency_id', '')
        if (route_agency and route_agency not in agency_ids) or (len(agency) > 1 and not route_agency):
            raise ValueError('Route has invalid agency reference')
    trip_ids = _unique(tables['trips'], 'trip_id', 'trips')
    for stop in tables['stops']:
        try:
            lat, lon = float(stop['stop_lat']), float(stop['stop_lon'])
        except (KeyError, ValueError) as exc:
            raise ValueError('Invalid stop coordinates') from exc
        if not all(map(math.isfinite, (lat, lon))) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('Non-finite or out-of-range stop coordinates')
    services = {r['service_id'] for r in tables['calendar']} | {r['service_id'] for r in tables['calendar_dates']}
    if not services:
        raise ValueError('No defined services')
    for exception in tables['calendar_dates']:
        if exception['exception_type'] not in ('1', '2'):
            raise ValueError('Invalid calendar exception')
        date.fromisoformat(f"{exception['date'][:4]}-{exception['date'][4:6]}-{exception['date'][6:]}")
    for row in tables['calendar']:
        if date.fromisoformat(f"{row['start_date'][:4]}-{row['start_date'][4:6]}-{row['start_date'][6:]}") > date.fromisoformat(f"{row['end_date'][:4]}-{row['end_date'][4:6]}-{row['end_date'][6:]}"):
            raise ValueError('Invalid calendar date range')
    exceptions = [(r['service_id'], r['date']) for r in tables['calendar_dates']]
    if len(exceptions) != len(set(exceptions)):
        raise ValueError('Duplicate calendar exception')
    for trip in tables['trips']:
        if trip['route_id'] not in route_ids or trip['service_id'] not in services:
            raise ValueError('Trip has invalid route or service reference')
    groups = defaultdict(list)
    for row in tables['stop_times']:
        if row.get('trip_id') not in trip_ids or row.get('stop_id') not in stop_ids:
            raise ValueError('Stop time has invalid trip or stop reference')
        try:
            sequence = int(row['stop_sequence'])
            arrival = gtfs_seconds(row['arrival_time'])
            departure = gtfs_seconds(row['departure_time'])
        except (KeyError, ValueError) as exc:
            raise ValueError('Invalid stop sequence or time') from exc
        if sequence < 0 or departure < arrival or row.get('pickup_type', '0') not in ('', '0', '1', '2', '3') or row.get('drop_off_type', '0') not in ('', '0', '1', '2', '3'):
            raise ValueError('Invalid stop timing or boarding restriction')
        groups[row['trip_id']].append((sequence, arrival, departure, row))
    for trip_id, times in groups.items():
        ordered = sorted(times, key=lambda item: item[0])
        if len({x[0] for x in ordered}) != len(ordered) or any(a[2] > b[1] for a, b in zip(ordered, ordered[1:])):
            raise ValueError(f'Invalid stop sequence or chronology for {trip_id}')
    if set(groups) != trip_ids:
        raise ValueError('Trip missing stop times')
    service_trips = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        # GTFS elapsed service time starts at local noon minus twelve hours.
        epoch = datetime.combine(day, datetime.min.time(), tzinfo=tz).replace(hour=12).astimezone(timezone.utc) - timedelta(hours=12)
        for trip in tables['trips']:
            if service_active(trip['service_id'], day, tables['calendar'], tables['calendar_dates']):
                service_trips.append({'service_date': day.isoformat(), 'trip_id': trip['trip_id'], 'service_start_at': _iso(epoch)})
    return {**tables, 'service_trips': service_trips, 'agency_timezone': agency[0]['agency_timezone'],
            'source_sha256': hashlib.sha256(raw).hexdigest(), 'service_start': start.isoformat(), 'service_days': days}


def direct_journey(data, origin, destination, ready_at, access_minutes=0):
    """Earliest scheduled direct ride; None means no verified feasible direct ride."""
    if origin not in {s['stop_id'] for s in data['stops']} or destination not in {s['stop_id'] for s in data['stops']} or origin == destination:
        return None
    if not isinstance(access_minutes, (int, float)) or not math.isfinite(access_minutes) or access_minutes < 0:
        raise ValueError('Invalid access walking minutes')
    ready = datetime.fromisoformat(ready_at.replace('Z', '+00:00'))
    if ready.tzinfo is None:
        raise ValueError('ready_at must have timezone')
    ready = ready.astimezone(timezone.utc) + timedelta(minutes=access_minutes)
    by_trip = defaultdict(list)
    for row in data['stop_times']:
        by_trip[row['trip_id']].append(row)
    routes = {r['route_id']: r for r in data['routes']}
    trips = {t['trip_id']: t for t in data['trips']}
    choices = []
    for occurrence in data['service_trips']:
        trip_id = occurrence['trip_id']
        epoch = datetime.fromisoformat(occurrence['service_start_at'].replace('Z', '+00:00'))
        rows = sorted(by_trip[trip_id], key=lambda r: int(r['stop_sequence']))
        for board in rows:
            if board['stop_id'] != origin or board.get('pickup_type', '0') in ('1', '2', '3'):
                continue
            depart = epoch + timedelta(seconds=gtfs_seconds(board['departure_time']))
            if depart < ready:
                continue
            for alight in rows:
                if alight['stop_id'] != destination or int(alight['stop_sequence']) <= int(board['stop_sequence']) or alight.get('drop_off_type', '0') in ('1', '2', '3'):
                    continue
                arrival = epoch + timedelta(seconds=gtfs_seconds(alight['arrival_time']))
                choice = {'trip_id': trip_id, 'route_id': trips[trip_id]['route_id'], 'route_name': routes[trips[trip_id]['route_id']].get('route_long_name', ''),
                          'service_date': occurrence['service_date'], 'from_stop_id': origin, 'to_stop_id': destination,
                          'board_sequence': int(board['stop_sequence']), 'alight_sequence': int(alight['stop_sequence']),
                          'departure_at': _iso(depart), 'arrival_at': _iso(arrival), 'access_minutes': access_minutes,
                          'transfers': 0, 'source_kind': 'scheduled', 'source_sha256': data['source_sha256']}
                choices.append((arrival, depart, choice))
    return min(choices, key=lambda item: (item[0], item[1]))[2] if choices else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start-date', type=date.fromisoformat, required=True, help='First agency-local service date, YYYY-MM-DD')
    parser.add_argument('--days', type=int, default=14)
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()
    raw = fetch(GTFS_URL)
    result = import_archive(raw, args.start_date, args.days)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'source.zip').write_bytes(raw)
    for table in TABLES + ('service_trips',):
        (args.out / f'{table}.json').write_text(json.dumps(result[table], separators=(',', ':'), ensure_ascii=False) + '\n')
    counts = {table: len(result[table]) for table in TABLES + ('service_trips',)}
    manifest = {'source_url': GTFS_URL, 'captured_at': _iso(datetime.now(timezone.utc)), 'sha256': result['source_sha256'],
                'source_kind': 'scheduled', 'agency_timezone': result['agency_timezone'], 'counts': counts,
                'service_start': result['service_start'], 'service_end': (args.start_date + timedelta(days=args.days - 1)).isoformat(), 'service_days': args.days,
                'license_note': 'Official public feed; attribution retained. Check BT terms before redistribution beyond this demo.',
                'limitations': 'Scheduled, not live arrivals. Direct same-trip rides only; transfers and walking routes unsupported. Empty service dates remain empty. Refresh/revalidate feed before use.'}
    (args.out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
