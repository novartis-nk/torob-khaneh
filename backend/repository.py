from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .adapters import AdapterRegistry
from .ports import CrawlRequest


class SQLiteRepository:
    """Repository boundary for observations, rejections, and crawl jobs."""

    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS offers (
                    id TEXT PRIMARY KEY, raw TEXT NOT NULL, normalized TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS rejected (
                    id TEXT PRIMARY KEY, reason TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS crawl_requests (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    vertical TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    status TEXT NOT NULL,
                    adapter_key TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(url, vertical)
                );
                """
            )

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def is_empty(self) -> bool:
        with self.connect() as db:
            return db.execute("SELECT count(*) FROM offers").fetchone()[0] == 0

    def ingest(self, dataset: dict[str, Any], registry: AdapterRegistry) -> dict[str, int]:
        offers = dataset.get("offers")
        if dataset.get("sample") is not True or not isinstance(offers, list) or len(offers) > 5000:
            raise ValueError("invalid_dataset")
        accepted = rejected = 0
        with self.connect() as db:
            for index, raw in enumerate(offers):
                identity = str(raw.get("id") or f"invalid-{index}") if isinstance(raw, dict) else f"invalid-{index}"
                try:
                    normalized = registry.normalize(raw)
                    db.execute(
                        "INSERT INTO offers VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET raw=excluded.raw, normalized=excluded.normalized",
                        (identity, json.dumps(raw, ensure_ascii=False), json.dumps(normalized, ensure_ascii=False)),
                    )
                    db.execute("DELETE FROM rejected WHERE id=?", (identity,))
                    accepted += 1
                except Exception as error:
                    db.execute("INSERT OR REPLACE INTO rejected VALUES (?,?)", (identity, str(error)))
                    db.execute("DELETE FROM offers WHERE id=?", (identity,))
                    rejected += 1
            db.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", ("generatedAt", str(dataset.get("generatedAt", ""))))
        return {"accepted": accepted, "rejected": rejected}

    def observations(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT normalized FROM offers ORDER BY id").fetchall()
        return [json.loads(row["normalized"]) for row in rows]

    def source(self, identity: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT raw, normalized FROM offers WHERE id=?", (identity,)).fetchone()
        if row is None:
            return None
        return {"sample": True, "raw": json.loads(row["raw"]), "normalized": json.loads(row["normalized"])}

    def stats(self, home_count: int) -> dict[str, Any]:
        with self.connect() as db:
            normalized = [json.loads(row[0]) for row in db.execute("SELECT normalized FROM offers")]
            rejected = [dict(row) for row in db.execute("SELECT * FROM rejected ORDER BY id")]
            generated = db.execute("SELECT value FROM metadata WHERE key='generatedAt'").fetchone()
        counts: dict[str, int] = {}
        for offer in normalized:
            counts[offer["source"]] = counts.get(offer["source"], 0) + 1
        return {
            "rawCount": len(normalized) + len(rejected),
            "offerCount": len(normalized),
            "homeCount": home_count,
            "sourceCounts": counts,
            "rejected": rejected,
            "generatedAt": generated[0] if generated else None,
            "sample": True,
        }

    def save_crawl_request(self, request: CrawlRequest) -> CrawlRequest:
        with self.connect() as db:
            db.execute(
                "INSERT OR IGNORE INTO crawl_requests VALUES (?,?,?,?,?,?,?,?)",
                (request.id, request.url, request.domain, request.vertical, request.notes, request.status, request.adapter_key, request.created_at),
            )
            row = db.execute("SELECT * FROM crawl_requests WHERE url=? AND vertical=?", (request.url, request.vertical)).fetchone()
        return self._crawl_request(row)

    def crawl_request(self, identity: str) -> CrawlRequest | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM crawl_requests WHERE id=?", (identity,)).fetchone()
        return self._crawl_request(row) if row else None

    @staticmethod
    def _crawl_request(row: sqlite3.Row) -> CrawlRequest:
        return CrawlRequest(
            id=row["id"], url=row["url"], domain=row["domain"], vertical=row["vertical"],
            notes=row["notes"], status=row["status"], adapter_key=row["adapter_key"], created_at=row["created_at"]
        )
