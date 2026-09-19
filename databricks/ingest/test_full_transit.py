import csv
import io
import unittest
import zipfile
from datetime import date

from full_transit import import_archive, direct_journey


def fixture(overrides=None):
    files = {
        'agency.txt': [{'agency_name': 'Test', 'agency_timezone': 'America/New_York'}],
        'stops.txt': [{'stop_id': x, 'stop_lat': '37.2', 'stop_lon': '-80.4'} for x in ('A', 'B', 'C')],
        'routes.txt': [{'route_id': 'R', 'route_long_name': 'Route'}],
        'trips.txt': [{'trip_id': 'T', 'route_id': 'R', 'service_id': 'S'}],
        'stop_times.txt': [{'trip_id': 'T', 'stop_id': s, 'stop_sequence': str(n), 'arrival_time': t, 'departure_time': t} for n, s, t in [(1, 'A', '24:10:00'), (2, 'B', '24:20:00'), (3, 'A', '24:30:00'), (4, 'C', '25:00:00')]],
        'calendar.txt': [{'service_id': 'S', 'start_date': '20260901', 'end_date': '20260930', **{d: '1' for d in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')}}],
        'calendar_dates.txt': [{'service_id': 'S', 'date': '20260919', 'exception_type': '2'}, {'service_id': 'S', 'date': '20260920', 'exception_type': '1'}],
        'feed_info.txt': [{'feed_version': 'fixture'}],
    }
    files.update(overrides or {})
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for name, rows in files.items():
            if not rows:
                continue
            stream = io.StringIO()
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader(); writer.writerows(rows)
            archive.writestr(name, stream.getvalue())
    return buffer.getvalue()


class FullTransitTests(unittest.TestCase):
    def test_calendar_overnight_loop_and_access(self):
        result = import_archive(fixture(), date(2026, 9, 19), 14)
        self.assertEqual(len(result['stops']), 3)
        self.assertEqual(len(result['stop_times']), 4)
        self.assertFalse(any(x['service_date'] == '2026-09-19' for x in result['service_trips']))
        self.assertTrue(any(x['service_date'] == '2026-09-20' for x in result['service_trips']))
        trip = direct_journey(result, 'A', 'C', '2026-09-21T04:25:00Z', 5)
        self.assertEqual(trip['board_sequence'], 3)
        self.assertEqual(trip['arrival_at'], '2026-09-21T05:00:00Z')
        self.assertEqual(direct_journey(result, 'A', 'C', '2026-09-21T04:31:00Z', 5)['departure_at'], '2026-09-22T04:10:00Z')
        self.assertIsNone(direct_journey(result, 'C', 'A', '2026-09-21T04:00:00Z'))
        self.assertIsNone(direct_journey(result, 'A', 'missing', '2026-09-21T04:00:00Z'))

    def test_exceptions_only_and_empty_dates(self):
        result = import_archive(fixture({'calendar.txt': [], 'calendar_dates.txt': [{'service_id': 'S', 'date': '20260920', 'exception_type': '1'}]}), date(2026, 9, 19), 14)
        self.assertEqual([r['service_date'] for r in result['service_trips']], ['2026-09-20'])

    def test_invalid_references_sequence_coordinate_time(self):
        cases = [
            {'stop_times.txt': [{'trip_id': 'T', 'stop_id': 'INVALID', 'stop_sequence': '1', 'arrival_time': '12:00:00', 'departure_time': '12:00:00'}]},
            {'trips.txt': [{'trip_id': 'T', 'route_id': 'INVALID', 'service_id': 'S'}]},
            {'stop_times.txt': [{'trip_id': 'T', 'stop_id': 'A', 'stop_sequence': '1', 'arrival_time': '12:00:00', 'departure_time': '12:00:00'}, {'trip_id': 'T', 'stop_id': 'B', 'stop_sequence': '1', 'arrival_time': '12:10:00', 'departure_time': '12:10:00'}]},
            {'stops.txt': [{'stop_id': 'A', 'stop_lat': 'nan', 'stop_lon': '-80.4'}]},
            {'stop_times.txt': [{'trip_id': 'T', 'stop_id': 'A', 'stop_sequence': '1', 'arrival_time': '48:00:00', 'departure_time': '48:00:00'}]},
        ]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(ValueError):
                import_archive(fixture(change), date(2026, 9, 19), 14)

    def test_pickup_dropoff_and_minimum_horizon(self):
        rows = [{'trip_id': 'T', 'stop_id': s, 'stop_sequence': str(n), 'arrival_time': t, 'departure_time': t, 'pickup_type': p, 'drop_off_type': d} for n, s, t, p, d in [(1, 'A', '10:00:00', '1', '0'), (2, 'B', '10:10:00', '0', '0'), (3, 'C', '10:20:00', '0', '1')]]
        result = import_archive(fixture({'stop_times.txt': rows}), date(2026, 9, 20), 14)
        self.assertIsNone(direct_journey(result, 'A', 'C', '2026-09-20T12:00:00Z'))
        with self.assertRaises(ValueError):
            import_archive(fixture(), date(2026, 9, 20), 13)


if __name__ == '__main__':
    unittest.main()
