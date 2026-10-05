from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .adapters import AdapterRegistry
from .repository import SQLiteRepository


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize and ingest a housing observation batch")
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    dataset = json.loads(args.file.read_text())
    repository = SQLiteRepository(os.environ.get("DATABASE_PATH", "data/catalog.sqlite"))
    print(json.dumps(repository.ingest(dataset, AdapterRegistry()), ensure_ascii=False))


if __name__ == "__main__":
    main()

