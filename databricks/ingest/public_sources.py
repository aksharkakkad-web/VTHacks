#!/usr/bin/env python3
"""Refresh additive public evidence. No credentials, student data, or generic crawler.

Run: python3 databricks/ingest/public_sources.py
Each dataset is replaced atomically only after its full import validates. Failures
are recorded separately; a retained snapshot keeps its original capture timestamp.
"""
import argparse
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from refresh_campus import weather_context

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data' / 'campus' / 'research'
GIS = 'https://arcgis-central.gis.vt.edu/arcgis/rest/services/'
HOSTS = {'arcgis-central.gis.vt.edu', 'news.vt.edu', 'police.vt.edu', 'www.facilities.vt.edu',
         'facilities.vt.edu', 'api.weather.gov', 'www.vt.edu', 'ridebt.org', 'www.bt4uclassic.org'}
MAX_GEOMETRY_POSITIONS = 10_000


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def validate_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port or p.fragment:
        raise ValueError('Only allowlisted public HTTPS sources may be fetched')
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    validate_url(url)
    req = urllib.request.Request(url, headers={'User-Agent': 'BeaconCampusEvidence/1.0 (public research)', 'Accept': 'application/json,text/html,*/*'})
    with urllib.request.build_opener(SafeRedirect()).open(req, timeout=25) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError('Source exceeds 8 MB bound')
    return raw


def provenance(url, raw, count, coverage, limitations):
    return {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'captured_at': now_iso(),
            'row_count': count, 'coverage': coverage, 'limitations': limitations,
            'attribution': 'Public official source. No endorsement; source terms apply.'}


def bundle(name, records, sources, limitations):
    return {'schema_version': 1, 'dataset': name, 'captured_at': now_iso(),
            'records': records, 'sources': sources, 'limitations': limitations}


def validate_features(value):
    if value.get('error') or value.get('exceededTransferLimit') or value.get('properties', {}).get('exceededTransferLimit'):
        raise ValueError('GIS source failed or truncated')
    features = value.get('features')
    if value.get('type') != 'FeatureCollection' or not isinstance(features, list) or len(features) > 2000:
        raise ValueError('Invalid or oversized GIS collection')
    ids = [f.get('id', f.get('properties', {}).get('objectid')) for f in features]
    if any(i is None for i in ids) or len(set(ids)) != len(ids):
        raise ValueError('Missing or duplicate GIS object IDs')
    return features


def gis_layer(path, fields):
    url = GIS + path + '/query?' + urllib.parse.urlencode({'where': '1=1', 'outFields': fields,
        'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson', 'resultRecordCount': '2000'})
    raw = fetch(url)
    features = validate_features(json.loads(raw))
    count_url = GIS + path + '/query?where=1%3D1&returnCountOnly=true&f=json'
    count = json.loads(fetch(count_url))
    if count.get('error') or count.get('count') != len(features):
        raise ValueError('GIS count changed or source was truncated; retry refresh')
    return features, url, raw


def date_ms(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Invalid source timestamp')
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')


def geometry(value, types):
    if not isinstance(value, dict) or value.get('type') not in types:
        raise ValueError('Unexpected GIS geometry')
    count = 0

    def array(coordinates, minimum):
        if not isinstance(coordinates, list) or not minimum <= len(coordinates) <= MAX_GEOMETRY_POSITIONS:
            raise ValueError('Invalid geometry component length')
        return coordinates

    def position(coordinates):
        nonlocal count
        count += 1
        if count > MAX_GEOMETRY_POSITIONS:
            raise ValueError('Geometry exceeds coordinate bound')
        if (not isinstance(coordinates, list) or len(coordinates) != 2 or
                not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in coordinates)):
            raise ValueError('Invalid coordinates')
        # Range comparisons also reject NaN and infinity without converting huge JSON integers to floats.
        if not (-180 <= coordinates[0] <= 180 and -90 <= coordinates[1] <= 90):
            raise ValueError('Coordinates are not WGS84')

    def positions(coordinates, minimum):
        for coordinate in array(coordinates, minimum):
            position(coordinate)

    def polygon(coordinates):
        for ring in array(coordinates, 1):
            positions(ring, 4)
            if ring[0] != ring[-1]:
                raise ValueError('Polygon ring is not closed')

    kind, coordinates = value['type'], value.get('coordinates')
    if kind == 'Point':
        position(coordinates)
    elif kind == 'LineString':
        positions(coordinates, 2)
    elif kind == 'MultiLineString':
        for line in array(coordinates, 1):
            positions(line, 2)
    elif kind == 'Polygon':
        polygon(coordinates)
    elif kind == 'MultiPolygon':
        for component in array(coordinates, 1):
            polygon(component)
    else:
        raise ValueError('Unsupported GIS geometry')
    return value


def closure_record(feature, kind, url):
    p = feature['properties']
    start, end = date_ms(p.get('closurestartdate')), date_ms(p.get('closureenddate'))
    if start and end and end <= start:
        raise ValueError('Closure end precedes start')
    return {'id': f'{kind}:{feature.get("id", p.get("objectid"))}', 'kind': 'area' if kind == 'areas' else 'road',
            'name': p.get('constructionsite') or p.get('label') or 'Unnamed source closure',
            'starts_at': start, 'ends_at': end, 'source_status': p.get('closuredelay'),
            'description': p.get('comments') or p.get('addl_cmmts'), 'source_url': url,
            'geometry': geometry(feature.get('geometry'), {'Polygon', 'MultiPolygon'} if kind == 'areas' else {'LineString', 'MultiLineString'}),
            'ranking_use': 'area_overlap_with_valid_dates_only' if kind == 'areas' else 'display_only'}


def load_closures():
    records, sources = [], []
    specs = [('areas', 'facilities/Construction_Closures/FeatureServer/0', 'objectid,constructionsite,closurestartdate,closureenddate,comments'),
             ('roads', 'facilities/Road_Closures_new/FeatureServer/0', 'objectid,label,closurestartdate,closureenddate,closuredelay,addl_cmmts')]
    limitation = 'Published current closure layers only; missing features do not prove every path is open. Apply source dates and snapshot freshness. Road delays do not establish a pedestrian closure.'
    for kind, path, fields in specs:
        features, url, raw = gis_layer(path, fields)
        records.extend(closure_record(f, kind, url) for f in features)
        sources.append(provenance(url, raw, len(features), path, limitation))
    return bundle('closures', records, sources, [limitation])


def load_resources():
    features, url, raw = gis_layer('facilities/AEDSTBKitLocations/FeatureServer/0',
                                 'objectid,buildingname,kitstatus,kitlocation,floornumber,roomnumber,generaldescription,lastinspectiondate')
    records = []
    for f in features:
        coords = geometry(f.get('geometry'), {'Point'})['coordinates']
        if not (-80.46 <= coords[0] <= -80.38 and 37.19 <= coords[1] <= 37.26):
            continue
        p = f['properties']
        records.append({'id': str(f['id']), 'building': p.get('buildingname'), 'location': p.get('kitlocation'),
                        'floor': p.get('floornumber'), 'room': p.get('roomnumber'), 'description': p.get('generaldescription'),
                        'source_status': p.get('kitstatus'), 'last_inspection_at': date_ms(p.get('lastinspectiondate')),
                        'operational_status': 'unknown', 'access_now': 'unknown', 'geometry': f['geometry'], 'source_url': url})
    limitation = 'Mapped AED/Stop-the-Bleed inventory in the declared Blacksburg bounding box. Source status and old inspection dates are retained; present operation and building access are unverified.'
    return bundle('emergency-equipment', records, [provenance(url, raw, len(records), 'Blacksburg bbox [-80.46,37.19,-80.38,37.26]', limitation)], [limitation])


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.links, self.headline = {}, [], ''
        self.in_headline = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            self.meta[a.get('property', a.get('name', ''))] = a.get('content', '')
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'h2' and a.get('itemprop') == 'headline':
            self.in_headline = True

    def handle_endtag(self, tag):
        if tag == 'h2':
            self.in_headline = False

    def handle_data(self, data):
        if self.in_headline:
            self.headline += data


def notice_record(html, url, category):
    page = Metadata(); page.feed(html)
    title = page.meta.get('og:title') or page.headline.strip()
    if not title or len(title) > 350:
        raise ValueError('Official page did not expose a usable title')
    published = page.meta.get('pubdate') or page.meta.get('article:published_time')
    if published:
        value = datetime.fromisoformat(published.replace('Z', '+00:00'))
        if value.tzinfo is None or value > datetime.now(timezone.utc):
            raise ValueError('Invalid notice publication timestamp')
    return {'id': hashlib.sha256(url.encode()).hexdigest()[:24], 'title': title, 'source_url': url,
            'published_at': published, 'category': category, 'current_applicability': 'unknown', 'ranking_use': 'display_only'}


def collect_notices(urls, category):
    records, sources, gaps = [], [], []
    for url in urls:
        try:
            page = fetch(url)
            row = notice_record(page.decode('utf-8'), url, category)
            records.append(row)
            sources.append(provenance(url, page, 1, 'Metadata verified on the underlying official page', 'Publication time is not an expiry time or evidence of an active threat.'))
        except Exception as error:
            gaps.append({'source_url': url, 'attempted_at': now_iso(), 'error': type(error).__name__})
    return records, sources, gaps


def load_notices():
    specs = [('crime_notice', 'https://police.vt.edu/crime-alerts.html', r'^https://news\.vt\.edu/articles/\d{4}/.*crimealert'),
             ('campus_impact', 'https://www.facilities.vt.edu/campus-impacts.html', r'^https://news\.vt\.edu/notices/facilities/'),
             ('transit_notice', 'https://ridebt.org/news-alerts', r'^https://ridebt\.org/news-alerts/\d')]
    records, sources, gaps = [], [], []
    for category, index, pattern in specs:
        raw = fetch(index)
        parsed = Metadata(); parsed.feed(raw.decode('utf-8'))
        links = sorted({urllib.parse.urljoin(index, link) for link in parsed.links
                        if re.search(pattern, urllib.parse.urljoin(index, link))})
        if not links or len(links) > 40:
            raise ValueError('Notice index layout changed or exceeds bounded scope')
        sources.append(provenance(index, raw, len(links), 'First official listing page, no completeness claim', 'Notices are not a live emergency feed.'))
        page_records, page_sources, page_gaps = collect_notices(links, category)
        records.extend(page_records); sources.extend(page_sources); gaps.extend(page_gaps)
    if not records:
        raise ValueError('No underlying notices could be verified')
    result = bundle('notices', records, sources, ['Official index-linked notices. Verify the linked page for current instructions. No inferred geography, expiry, or all-clear status.'])
    result['gaps'] = gaps
    result['coverage'] = 'partial_listing' if gaps else 'fetched_first_listing_pages_only'
    return result


def load_weather():
    points = json.loads(fetch('https://api.weather.gov/points/37.2296,-80.4139'))
    hourly = validate_url(points['properties']['forecastHourly'])
    if urllib.parse.urlsplit(hourly).hostname != 'api.weather.gov':
        raise ValueError('Invalid NWS forecast host')
    raw = fetch(hourly); forecast = json.loads(raw)
    alert_url = 'https://api.weather.gov/alerts/active?point=37.2296,-80.4139'
    alert_raw = fetch(alert_url); alerts = json.loads(alert_raw)
    periods = [{'start_at': p['startTime'], 'end_at': p['endTime'], 'temperature': p['temperature'],
                'temperature_unit': p['temperatureUnit'], 'precipitation_probability': p['probabilityOfPrecipitation']['value'],
                'short_forecast': p['shortForecast'], 'wind_speed': p['windSpeed'], 'is_daytime': p['isDaytime']}
               for p in forecast['properties']['periods'][:72]]
    alert_rows = [{'alert_id': f['id'], 'event': f['properties']['event'], 'severity': f['properties']['severity'],
                   'onset': f['properties'].get('onset'), 'expires': f['properties']['expires'],
                   'headline': f['properties'].get('headline')} for f in alerts['features']]
    current = datetime.now(timezone.utc)
    context = weather_context(periods, alert_rows, current, hourly, hashlib.sha256(raw).hexdigest(),
                              datetime.fromisoformat(forecast['properties']['updateTime']), hashlib.sha256(alert_raw).hexdigest())
    result = bundle('weather', context,
                    [provenance(hourly, raw, len(periods), 'Campus public reference point area forecast', 'Forecast, not observed conditions on each path.'),
                     provenance(alert_url, alert_raw, len(alert_rows), 'NWS alerts for the campus reference point', 'Not campus crime alerts; empty only at capture time.')],
                    ['Use only overlapping forecast validity windows. No rain penalty does not mean conditions are safe.'])
    result['hourly'] = periods; result['alerts'] = alert_rows
    return result


def refresh_dataset(name, loader, previous):
    try:
        return loader(), None
    except Exception as error:
        return previous, {'dataset': name, 'attempted_at': now_iso(), 'error': type(error).__name__ + ': ' + str(error)[:250]}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.json.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--datasets', default='closures,emergency-equipment,notices,weather')
    args = parser.parse_args()
    loaders = {'closures': load_closures, 'emergency-equipment': load_resources, 'notices': load_notices, 'weather': load_weather}
    names = args.datasets.split(',')
    if any(n not in loaders for n in names):
        parser.error('Unknown dataset')
    failures = []
    for name in names:
        target = OUT / (name + '.json')
        previous = json.loads(target.read_text()) if target.exists() else None
        result, error = refresh_dataset(name, loaders[name], previous)
        if error:
            failures.append(error); print(f'{name}: FAILED; prior snapshot retained ({error["error"]})')
        else:
            atomic_json(target, result); print(f'{name}: imported {len(result["records"])} records')
    atomic_json(OUT / 'refresh-status.json', {'attempted_at': now_iso(), 'datasets_attempted': names, 'failures': failures})
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
