import unittest
from datetime import datetime, timedelta, timezone
from refresh_campus import forecast_horizon


class ForecastHorizonTests(unittest.TestCase):
    def test_past_hours_do_not_consume_the_72_hour_future_horizon(self):
        now = datetime(2026, 9, 19, 17, 30, tzinfo=timezone.utc)
        start = now.replace(minute=0) - timedelta(hours=8)
        rows = [{"start_at": (start + timedelta(hours=i)).isoformat(),
                 "end_at": (start + timedelta(hours=i+1)).isoformat()} for i in range(160)]
        selected = forecast_horizon(rows, now)
        self.assertEqual(len(selected), 73)
        self.assertEqual(selected[0]['start_at'], '2026-09-19T17:00:00+00:00')
        self.assertEqual(selected[-1]['end_at'], '2026-09-22T18:00:00+00:00')

    def test_missing_future_hour_or_short_horizon_fails_instead_of_claiming_complete(self):
        now = datetime(2026, 9, 19, 17, tzinfo=timezone.utc)
        rows = [{"start_at": (now + timedelta(hours=i)).isoformat(),
                 "end_at": (now + timedelta(hours=i+1)).isoformat()} for i in range(72)]
        self.assertEqual(len(forecast_horizon(rows, now)), 72)
        for broken in [rows[:-1], rows[:5] + rows[6:], list(reversed(rows))]:
            with self.assertRaises(ValueError):
                forecast_horizon(broken, now)


if __name__ == '__main__':
    unittest.main()
