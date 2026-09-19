import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import public_sources as sources


class PublicSourcesTest(unittest.TestCase):
    RING = [[-80.42, 37.22], [-80.41, 37.22], [-80.41, 37.23], [-80.42, 37.22]]

    def test_only_official_https_fetch_targets(self):
        for url in ['http://api.weather.gov/points/1,2', 'https://api.weather.gov.evil.test/',
                    'https://user:pass@news.vt.edu/', 'https://localhost/']:
            with self.assertRaises(ValueError):
                sources.validate_url(url)
        self.assertEqual(sources.validate_url('https://news.vt.edu/articles/a.html'), 'https://news.vt.edu/articles/a.html')

    def test_arcgis_rejects_silent_truncation_and_errors(self):
        for doc in [{'type': 'FeatureCollection', 'features': [], 'exceededTransferLimit': True},
                    {'error': {'message': 'Token required'}}]:
            with self.assertRaises(ValueError):
                sources.validate_features(doc)

    def test_closure_preserves_dates_geometry_and_does_not_guess_missing_dates(self):
        feature = {'id': 4, 'properties': {'constructionsite': 'Construction', 'closurestartdate': 1789786800000,
                    'closureenddate': None}, 'geometry': {'type': 'Polygon', 'coordinates': [
                    [[-80.42, 37.22], [-80.41, 37.22], [-80.41, 37.23], [-80.42, 37.22]]]}}
        row = sources.closure_record(feature, 'areas', 'https://arcgis-central.gis.vt.edu/test')
        self.assertIsNone(row['ends_at'])
        self.assertEqual(row['kind'], 'area')
        self.assertEqual(row['geometry'], feature['geometry'])
        feature['properties']['closureenddate'] = 1
        with self.assertRaises(ValueError):
            sources.closure_record(feature, 'areas', 'https://arcgis-central.gis.vt.edu/test')

    def test_geometry_requires_the_nesting_for_its_declared_type(self):
        malformed = [
            ('Point', self.RING),
            ('LineString', self.RING[0]),
            ('LineString', [self.RING]),
            ('MultiLineString', self.RING),
            ('Polygon', self.RING),
            ('Polygon', [[self.RING]]),
            ('MultiPolygon', [self.RING]),
        ]
        for kind, coordinates in malformed:
            with self.subTest(kind=kind, coordinates=coordinates):
                with self.assertRaises(ValueError):
                    sources.geometry({'type': kind, 'coordinates': coordinates}, {kind})

    def test_geometry_rejects_empty_components_short_lines_and_unclosed_rings(self):
        malformed = [
            ('LineString', [self.RING[0]]),
            ('MultiLineString', [self.RING, [self.RING[0]]]),
            ('MultiLineString', []),
            ('Polygon', []),
            ('Polygon', [[]]),
            ('Polygon', [[self.RING[0], self.RING[1], self.RING[0]]]),
            ('Polygon', [[*self.RING[:3], [-80.42, 37.23]]]),
            ('MultiPolygon', [[self.RING], []]),
        ]
        for kind, coordinates in malformed:
            with self.subTest(kind=kind, coordinates=coordinates):
                with self.assertRaises(ValueError):
                    sources.geometry({'type': kind, 'coordinates': coordinates}, {kind})

    def test_geometry_rejects_boolean_nonfinite_and_invalid_coordinate_values(self):
        for coordinates in [[True, 37.22], [-80.42, False], [float('nan'), 37.22],
                            [-80.42, float('inf')], [-181, 37.22], [-80.42, 91],
                            ['-80.42', 37.22], [-80.42, 37.22, 0]]:
            with self.subTest(coordinates=coordinates):
                with self.assertRaises(ValueError):
                    sources.geometry({'type': 'Point', 'coordinates': coordinates}, {'Point'})

    def test_valid_geometry_preserves_polygon_holes_and_multiple_components(self):
        hole = [[-80.412, 37.221], [-80.411, 37.222], [-80.411, 37.221], [-80.412, 37.221]]
        other = [[lon, lat + 0.02] for lon, lat in self.RING]
        shapes = [
            ('Point', self.RING[0]),
            ('LineString', self.RING[:2]),
            ('MultiLineString', [self.RING[:2], self.RING[1:3]]),
            ('Polygon', [self.RING]),
            ('Polygon', [self.RING, hole]),
            ('MultiPolygon', [[self.RING, hole], [other]]),
        ]
        for kind, coordinates in shapes:
            with self.subTest(kind=kind):
                value = {'type': kind, 'coordinates': coordinates}
                self.assertIs(sources.geometry(value, {kind}), value)

    def test_geometry_position_limit_applies_across_all_components(self):
        line = [self.RING[0], self.RING[1]] * 2500
        at_limit = {'type': 'MultiLineString', 'coordinates': [line, line]}
        self.assertIs(sources.geometry(at_limit, {'MultiLineString'}), at_limit)
        over_limit = {'type': 'MultiLineString', 'coordinates': [line, [*line, self.RING[0]]]}
        with self.assertRaises(ValueError):
            sources.geometry(over_limit, {'MultiLineString'})

    def test_malformed_closure_refresh_keeps_previous_file_and_capture(self):
        old = {'dataset': 'closures', 'captured_at': '2026-09-18T01:00:00Z', 'records': [{'id': 'old'}]}
        features = [
            {'id': 1, 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': [self.RING]}},
            {'id': 2, 'properties': {}, 'geometry': {'type': 'Polygon', 'coordinates': self.RING}},
        ]
        with TemporaryDirectory() as directory:
            target = Path(directory) / 'closures.json'
            old_bytes = json.dumps(old).encode()
            target.write_bytes(old_bytes)
            with patch.object(sources, 'OUT', Path(directory)), \
                 patch.object(sources, 'gis_layer', side_effect=[
                     (features, 'https://arcgis-central.gis.vt.edu/areas', b'areas'),
                     ([], 'https://arcgis-central.gis.vt.edu/roads', b'roads')]), \
                 patch('sys.argv', ['public_sources.py', '--datasets', 'closures']), \
                 patch('builtins.print'):
                with self.assertRaises(SystemExit) as exited:
                    sources.main()
            self.assertEqual(exited.exception.code, 1)
            self.assertEqual(target.read_bytes(), old_bytes)
            status = json.loads((Path(directory) / 'refresh-status.json').read_text())
            self.assertEqual(status['failures'][0]['dataset'], 'closures')

    def test_notice_fetches_underlying_metadata_and_never_calls_it_active(self):
        html = '<meta property="og:title" content="Pathway work"><meta name="pubdate" content="2026-09-14T12:00:00Z">'
        row = sources.notice_record(html, 'https://news.vt.edu/notices/a.html', 'campus_impact')
        self.assertEqual(row['title'], 'Pathway work')
        self.assertEqual(row['published_at'], '2026-09-14T12:00:00Z')
        self.assertEqual(row['current_applicability'], 'unknown')
        self.assertEqual(row['ranking_use'], 'display_only')
        with self.assertRaises(ValueError):
            sources.notice_record('<h1>Access Denied</h1>', 'https://news.vt.edu/notices/a.html', 'campus_impact')

    def test_refresh_failure_keeps_last_good_capture(self):
        old = {'dataset': 'closures', 'captured_at': '2026-09-18T01:00:00Z', 'records': [{'id': 'old'}]}
        with patch.object(sources, 'fetch', side_effect=OSError('offline')):
            result, failure = sources.refresh_dataset('closures', sources.load_closures, old)
        self.assertEqual(result, old)
        self.assertEqual(failure['dataset'], 'closures')
        self.assertIsNotNone(failure['attempted_at'])

    def test_forecast_url_is_checked_before_fetch(self):
        with patch.object(sources, 'fetch', return_value=b'{"properties":{"forecastHourly":"https://evil.test/"}}') as call:
            with self.assertRaises(ValueError):
                sources.load_weather()
        self.assertEqual(call.call_count, 1)

    def test_broken_notice_link_is_an_explicit_gap_without_losing_other_notices(self):
        urls = ['https://news.vt.edu/notices/one.html', 'https://news.vt.edu/notices/two.html']
        with patch.object(sources, 'fetch', side_effect=[b'<meta property="og:title" content="Closure">', OSError('gone')]):
            records, provenance, gaps = sources.collect_notices(urls, 'campus_impact')
        self.assertEqual(len(records), 1)
        self.assertEqual(len(provenance), 1)
        self.assertEqual(gaps[0]['source_url'], urls[1])


if __name__ == '__main__':
    unittest.main()
