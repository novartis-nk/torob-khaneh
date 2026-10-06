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
                CREATE TABLE IF NOT EXISTS source_requests (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    vertical TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    method TEXT NOT NULL,
                    api_url TEXT,
                    status TEXT NOT NULL,
                    adapter_key TEXT,
                    task_id TEXT,
                    resolved_method TEXT,
                    analysis TEXT,
                    artifact_path TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(url, vertical, method)
                );
                CREATE TABLE IF NOT EXISTS source_tasks (
                    id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL REFERENCES source_requests(id),
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    available_at TEXT NOT NULL,
                    locked_at TEXT,
                    worker_id TEXT,
                    last_error TEXT,
                    payload TEXT NOT NULL DEFAULT '{}',
                    UNIQUE(request_id, kind)
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

    def save_source_request(self, request: CrawlRequest) -> CrawlRequest:
        with self.connect() as db:
            db.execute(
                """INSERT INTO source_requests
                (id,url,domain,vertical,notes,method,api_url,status,adapter_key,task_id,resolved_method,analysis,artifact_path,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(url,vertical,method) DO UPDATE SET notes=excluded.notes""",
                (request.id, request.url, request.domain, request.vertical, request.notes, request.method,
                 request.api_url, request.status, request.adapter_key, request.task_id, request.resolved_method,
                 json.dumps(request.analysis, ensure_ascii=False) if request.analysis else None,
                 request.artifact_path, request.created_at),
            )
            row = db.execute("SELECT * FROM source_requests WHERE url=? AND vertical=? AND method=?",
                             (request.url, request.vertical, request.method)).fetchone()
            if request.task_id:
                kind = "discovery" if request.method == "auto" else "scrape"
                db.execute(
                    """INSERT OR IGNORE INTO source_tasks
                    (id,request_id,kind,status,available_at,payload) VALUES (?,?,?,?,?,?)""",
                    (request.task_id, row["id"], kind, "queued", request.created_at, "{}"),
                )
        return self.source_request(row["id"])

    def source_request(self, identity: str) -> CrawlRequest | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM source_requests WHERE id=?", (identity,)).fetchone()
            tasks = [dict(item) for item in db.execute(
                "SELECT id,kind,status,attempts,last_error FROM source_tasks WHERE request_id=? ORDER BY kind", (identity,)
            )] if row else []
        return self._source_request(row, tasks) if row else None

    def claim_source_task(self, worker_id: str) -> dict[str, Any] | None:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                """SELECT t.id,t.request_id,t.kind,t.payload,r.url,r.domain,r.vertical,r.notes,r.method,
                          r.api_url,r.status,r.adapter_key,r.task_id,r.created_at
                   FROM source_tasks t JOIN source_requests r ON r.id=t.request_id
                   WHERE t.status='queued' AND t.kind='discovery' AND datetime(t.available_at) <= datetime(?)
                   ORDER BY t.available_at LIMIT 1""", (now,)
            ).fetchone()
            if not row:
                return None
            db.execute("UPDATE source_tasks SET status='running',locked_at=?,worker_id=?,attempts=attempts+1 WHERE id=?",
                       (now, worker_id, row["id"]))
            db.execute("UPDATE source_requests SET status=? WHERE id=?", (f"{row['kind']}_running", row["request_id"]))
        result = dict(row)
        result["payload"] = json.loads(result.get("payload") or "{}")
        return result

    def complete_source_task(self, task_id: str, result: Any) -> None:
        import hashlib

        with self.connect() as db:
            task = db.execute("SELECT request_id FROM source_tasks WHERE id=?", (task_id,)).fetchone()
            if not task:
                raise ValueError("unknown_source_task")
            request_id = task["request_id"]
            db.execute("UPDATE source_tasks SET status='completed',last_error=NULL WHERE id=?", (task_id,))
            db.execute(
                """UPDATE source_requests SET status=?,resolved_method=?,analysis=?,artifact_path=?,
                   adapter_key=?,api_url=? WHERE id=?""",
                (result.status, result.resolved_method, json.dumps(result.analysis, ensure_ascii=False),
                 result.artifact_path, result.adapter_key, result.api_url, request_id),
            )
            if result.resolved_method == "crawl":
                scrape_status = "blocked_policy" if result.status == "scraper_blocked" else "planned"
                for kind, status in (("scrape", scrape_status), ("monitor", "waiting_activation")):
                    identity = f"{kind}_" + hashlib.sha256(f"{request_id}|{kind}".encode()).hexdigest()[:12]
                    db.execute(
                        """INSERT OR IGNORE INTO source_tasks
                        (id,request_id,kind,status,available_at,payload) VALUES (?,?,?,?,datetime('now'),?)""",
                        (identity, request_id, kind, status, json.dumps({"artifactPath": result.artifact_path})),
                    )

    def fail_source_task(self, task_id: str, message: str, retry: bool) -> None:
        with self.connect() as db:
            task = db.execute("SELECT request_id,attempts FROM source_tasks WHERE id=?", (task_id,)).fetchone()
            if not task:
                return
            should_retry = retry and task["attempts"] < 3
            db.execute(
                "UPDATE source_tasks SET status=?,last_error=?,available_at=datetime('now','+60 seconds') WHERE id=?",
                ("queued" if should_retry else "failed", message[:1000], task_id),
            )
            db.execute("UPDATE source_requests SET status=? WHERE id=?", ("discovery_queued" if should_retry else "needs_review", task["request_id"]))

    def crawl_request(self, identity: str) -> CrawlRequest | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM crawl_requests WHERE id=?", (identity,)).fetchone()
        return self._crawl_request(row) if row else None

    @staticmethod
    def _source_request(row: sqlite3.Row, tasks: list[dict[str, Any]]) -> CrawlRequest:
        return CrawlRequest(
            id=row["id"], url=row["url"], domain=row["domain"], vertical=row["vertical"],
            notes=row["notes"], status=row["status"], adapter_key=row["adapter_key"],
            created_at=row["created_at"], method=row["method"], api_url=row["api_url"],
            task_id=row["task_id"], resolved_method=row["resolved_method"],
            analysis=json.loads(row["analysis"]) if row["analysis"] else None,
            artifact_path=row["artifact_path"], tasks=tasks,
        )

    @staticmethod
    def _crawl_request(row: sqlite3.Row) -> CrawlRequest:
        return CrawlRequest(
            id=row["id"], url=row["url"], domain=row["domain"], vertical=row["vertical"],
            notes=row["notes"], status=row["status"], adapter_key=row["adapter_key"], created_at=row["created_at"]
        )
