#!/usr/bin/env python3
"""Bundle the reviewed stdlib importer and native Spark runner into one Databricks notebook.

Usage: python3 databricks/jobs/build_notebook.py /tmp/beacon_refresh.py
Upload that output as a Python workspace notebook. No package or repository mount is needed.
"""
import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMPORTER = HERE.parent / "ingest" / "refresh_campus.py"
RUNNER = HERE / "refresh_notebook.py"


def bundle(importer: str, runner: str) -> str:
    marker = '\nif __name__ == "__main__":\n    main()'
    if not importer.endswith(marker + '\n'):
        raise ValueError("Importer entrypoint changed; inspect before bundling")
    # The notebook has no __file__: its source fetch/parser functions are reused,
    # while all rows remain in memory for typed Delta writes.
    importer = importer[: -len(marker + '\n')].replace(
        'ROOT = Path(__file__).resolve().parents[2]', 'ROOT = Path("/tmp/beacon-native-refresh")')
    return '# Databricks notebook source\n' + importer + '\n\n' + runner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.write_text(bundle(IMPORTER.read_text(), RUNNER.read_text()))
    print(args.output)


if __name__ == '__main__':
    main()
