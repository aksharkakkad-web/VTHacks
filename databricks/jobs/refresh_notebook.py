"""Databricks notebook tail. Bundle with build_notebook.py before workspace import.

Run manually or with a bounded schedule. Public HTTP sources only. No secrets.
Per-source failures retain prior Delta data, log a compact failure and fail the job.
"""
from datetime import date as _date

from pyspark.sql.types import (StructType, StructField, StringType, TimestampType,
                               DateType, DoubleType, BooleanType, LongType)

_TYPES = {"STRING": StringType(), "TIMESTAMP": TimestampType(), "DATE": DateType(),
          "DOUBLE": DoubleType(), "BOOLEAN": BooleanType(), "BIGINT": LongType()}
_SPECS = {
    "route_context": ("corridor_id,context_version", "corridor_id STRING,context_version STRING,updated_at TIMESTAMP,valid_from TIMESTAMP,valid_until TIMESTAMP,weather STRING,lighting STRING,walking_path_closed BOOLEAN,active_official_alert BOOLEAN,historical_report_count BIGINT,history_lookback_days BIGINT,source_url STRING"),
    "transit_departures": ("corridor_id,trip_id,service_date", "corridor_id STRING,trip_id STRING,route_id STRING,route_name STRING,service_date DATE,departure_at TIMESTAMP,arrival_at TIMESTAMP,travel_minutes DOUBLE,from_stop_id STRING,to_stop_id STRING,source_id STRING,source_version STRING"),
    "emergency_phones": ("phone_id", "phone_id STRING,location STRING,longitude DOUBLE,latitude DOUBLE,operational_status STRING,source_id STRING"),
    "source_manifest": ("source_id", "source_id STRING,title STRING,source_url STRING,captured_at TIMESTAMP,sha256 STRING,source_kind STRING,coverage STRING,license_note STRING,limitations STRING,row_count BIGINT"),
    "public_snapshots": ("dataset,snapshot_hash", "dataset STRING,snapshot_hash STRING,payload STRING,imported_at TIMESTAMP"),
}


def _schema(fields):
    return StructType([StructField(name, _TYPES[kind], True)
                       for field in fields.split(',') for name, kind in [field.split()]])


def _typed(value, kind):
    if value is None:
        return None
    if kind == "TIMESTAMP":
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    if kind == "DATE":
        return _date.fromisoformat(value)
    return value


def _merge(spark_session, table, rows, catalog="workspace", schema="beacon"):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", catalog) or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", schema):
        raise ValueError("Invalid catalog/schema identifier")
    if not rows:
        raise ValueError(f"Empty {table} source is not a valid refresh")
    keys, fields = _SPECS[table]
    names = [f.split()[0] for f in fields.split(',')]
    kinds = [f.split()[1] for f in fields.split(',')]
    typed = [tuple(_typed(row.get(name), kind) for name, kind in zip(names, kinds)) for row in rows]
    source = spark_session.createDataFrame(typed, _schema(fields))
    view = f"beacon_refresh_{table}"
    source.createOrReplaceTempView(view)
    join = " AND ".join(f"t.`{key}`=s.`{key}`" for key in keys.split(','))
    changes = ",".join(f"t.`{name}`=s.`{name}`" for name in names if name not in keys.split(','))
    columns = ",".join(f"`{name}`" for name in names)
    values = ",".join(f"s.`{name}`" for name in names)
    spark_session.sql(f"MERGE INTO `{catalog}`.`{schema}`.`{table}` t USING {view} s ON {join} "
                      f"WHEN MATCHED THEN UPDATE SET {changes} "
                      f"WHEN NOT MATCHED THEN INSERT ({columns}) VALUES ({values})")


def refresh_service_dates(now):
    """Include yesterday because GTFS service times can exceed 24:00."""
    local_day = now.astimezone(ZoneInfo("America/New_York")).date()
    return [local_day + timedelta(days=i) for i in range(-1, 5)]


def refresh(spark_session, now=None):
    now = now or datetime.now(UTC)
    # Protect the finite hackathon schedule from accidental ongoing execution.
    if now >= datetime(2026, 9, 20, 16, 0, tzinfo=UTC):
        print('BEACON_REFRESH_SKIPPED: hackathon cutoff passed')
        return {"skipped": True}
    spark_session.conf.set("spark.sql.session.timeZone", "UTC")
    records = {}
    failures = []
    def capture(name, value):
        records[name] = value
    global write_json
    write_json = capture
    for name, loader, datasets, table in (
        ("weather", load_weather, ("route-context.json", "weather-hourly.json", "weather-alerts.json"), "route_context"),
        ("transit", lambda: load_transit(refresh_service_dates(now)),
         ("transit-departures.json", "transit-snapshot.json"), "transit_departures"),
        ("phones", load_phones, ("emergency-phones.json",), "emergency_phones"),
        ("fare", load_fare, ("transit-fares.json",), None),
    ):
        records.clear()
        try:
            result = loader()
            if not all(dataset in records for dataset in datasets):
                raise ValueError("Incomplete source output")
            if table:
                _merge(spark_session, table, records[datasets[0]])
            # Fare and raw hourly/alert snapshots remain attributed bronze JSON.
            for dataset in datasets:
                payload = json.dumps(records[dataset], sort_keys=True)
                _merge(spark_session, "public_snapshots", [{"dataset": dataset.removesuffix(".json"),
                    "snapshot_hash": hashlib.sha256(payload.encode()).hexdigest(), "payload": payload,
                    "imported_at": iso(datetime.now(UTC))}])
            for item in result if isinstance(result, list) else [result]:
                _merge(spark_session, "source_manifest", [item])
            imported = result if isinstance(result, list) else [result]
            print(f"BEACON_REFRESH_OK {name}: " + ",".join(f"{r['source_id']}={r['row_count']}" for r in imported))
        except Exception as error:
            failures.append(f"{name}: {type(error).__name__}: {error}")
            print(f"BEACON_REFRESH_FAILED {failures[-1]}")
    if failures:
        raise RuntimeError("Partial refresh failed; previous successful source data retained: " + "; ".join(failures))
    return {"skipped": False, "sources": 4}


if __name__ == "__main__":
    refresh(spark)
