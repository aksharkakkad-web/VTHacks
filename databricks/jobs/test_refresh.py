"""Offline notebook contract checks; no Databricks credentials or Spark install."""
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build_notebook import IMPORTER, RUNNER, bundle


class FakeFrame:
    def createOrReplaceTempView(self, name):
        self.view = name


class FakeSpark:
    def __init__(self):
        self.statements = []
        self.rows = []
        self.fail_table = None
        self.conf = types.SimpleNamespace(set=lambda *args: None)

    def createDataFrame(self, rows, schema):
        self.rows.append(rows)
        return FakeFrame()

    def sql(self, statement):
        self.statements.append(statement)
        if self.fail_table and f'`{self.fail_table}`' in statement:
            raise RuntimeError("injected Delta failure")


def load_runner():
    pyspark = types.ModuleType("pyspark")
    sql = types.ModuleType("pyspark.sql")
    data_types = types.ModuleType("pyspark.sql.types")
    class FakeType:
        def __init__(self, *args):
            self.args = args
    for name in ("StructType", "StructField", "StringType", "TimestampType", "DateType", "DoubleType", "BooleanType", "LongType"):
        setattr(data_types, name, FakeType)
    sys.modules.update({"pyspark": pyspark, "pyspark.sql": sql, "pyspark.sql.types": data_types})
    source = bundle(IMPORTER.read_text(), RUNNER.read_text())
    scope = {"__name__": "beacon_test"}
    exec(compile(source, "bundled-notebook", "exec"), scope)
    return scope


class NotebookTests(unittest.TestCase):
    def test_bundle_is_self_contained(self):
        source = bundle(IMPORTER.read_text(), RUNNER.read_text())
        self.assertTrue(source.startswith("# Databricks notebook source"))
        self.assertIn("def load_weather()", source)
        self.assertIn("def refresh(spark_session", source)
        compile(source, "bundled-notebook", "exec")

    def test_typed_merge_and_idempotent_key(self):
        scope = load_runner()
        spark = FakeSpark()
        row = {"phone_id": "42", "location": "Campus", "longitude": -80.4,
               "latitude": 37.2, "operational_status": "unknown", "source_id": "vt-emergency-phones"}
        scope["_merge"](spark, "emergency_phones", [row])
        self.assertEqual(len(spark.statements), 1)
        self.assertIn("t.`phone_id`=s.`phone_id`", spark.statements[0])
        self.assertIn("WHEN MATCHED THEN UPDATE", spark.statements[0])
        self.assertEqual(spark.rows[0][0][0], "42")
        with self.assertRaisesRegex(ValueError, "Empty"):
            scope["_merge"](spark, "emergency_phones", [])
        with self.assertRaisesRegex(ValueError, "Invalid"):
            scope["_merge"](spark, "emergency_phones", [row], schema="beacon;DROP")

    def test_previous_service_day_included_for_overnight_trips(self):
        scope = load_runner()
        now = datetime(2026, 9, 20, 2, tzinfo=timezone.utc)
        days = scope["refresh_service_dates"](now)
        self.assertEqual(len(days), 6)
        self.assertEqual(days[0].isoformat(), "2026-09-18")
        self.assertEqual(days[-1].isoformat(), "2026-09-23")

    def test_first_typed_dataset_also_retained_in_bronze(self):
        scope = load_runner()
        spark = FakeSpark()
        def weather():
            scope["write_json"]("route-context.json", [{"corridor_id": "a", "context_version": "b"}])
            scope["write_json"]("weather-hourly.json", [{"start_at": "2026-09-19T12:00:00Z"}])
            scope["write_json"]("weather-alerts.json", [])
            return [{"source_id": "nws-hourly", "row_count": 1}]
        scope["load_weather"] = weather
        for name in ("load_transit", "load_phones", "load_fare"):
            scope[name] = lambda *args: (_ for _ in ()).throw(ValueError("offline"))
        with self.assertRaisesRegex(RuntimeError, "Partial refresh failed"):
            scope["refresh"](spark, datetime(2026, 9, 19, 12, tzinfo=timezone.utc))
        bronze = [rows[0][0] for statement, rows in zip(spark.statements, spark.rows)
                  if "`public_snapshots`" in statement]
        self.assertIn("route-context", bronze)

    def test_failure_preserves_manifest_and_job_fails(self):
        scope = load_runner()
        spark = FakeSpark()
        spark.fail_table = "route_context"
        def weather():
            for name in ("route-context.json", "weather-hourly.json", "weather-alerts.json"):
                scope["write_json"](name, [{"corridor_id": "a"}])
            return [{"source_id": "nws-hourly", "row_count": 1}]
        scope["load_weather"] = weather
        for name in ("load_transit", "load_phones", "load_fare"):
            scope[name] = lambda *args: (_ for _ in ()).throw(ValueError("offline"))
        with self.assertRaisesRegex(RuntimeError, "Partial refresh failed"):
            scope["refresh"](spark, datetime(2026, 9, 19, 12, tzinfo=timezone.utc))
        self.assertFalse(any("`source_manifest`" in statement for statement in spark.statements))

    def test_cutoff_does_not_fetch_or_merge(self):
        scope = load_runner()
        spark = FakeSpark()
        result = scope["refresh"](spark, datetime(2026, 9, 20, 16, tzinfo=timezone.utc))
        self.assertTrue(result["skipped"])
        self.assertEqual(spark.statements, [])


if __name__ == '__main__':
    unittest.main()
