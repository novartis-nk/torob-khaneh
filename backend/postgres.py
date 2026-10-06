from __future__ import annotations

import json
from typing import Any

from .adapters import AdapterRegistry
from .ports import CrawlRequest


class PostgresRepository:
    """PostgreSQL repository for catalog observations and onboarding work.

    psycopg is imported lazily so unit tests can still exercise the domain with
    the small SQLite fixture repository, while the application runtime uses
    PostgreSQL through DATABASE_URL.
    """

    def __init__(self, url: str):
        self.url = url
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as error:  # pragma: no cover - deployment guard
            raise RuntimeError("psycopg is required for DATABASE_URL") from error
        self._psycopg = psycopg
        self._dict_row = dict_row
        self._ensure_schema()

    def connect(self):
        return self._psycopg.connect(self.url, row_factory=self._dict_row)

    def _ensure_schema(self) -> None:
        with self.connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS offers (
                    id TEXT PRIMARY KEY, raw JSONB NOT NULL, normalized JSONB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS rejected (
                    id TEXT PRIMARY KEY, reason TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS source_requests (
                    id TEXT PRIMARY KEY, url TEXT NOT NULL, domain TEXT NOT NULL,
                    vertical TEXT NOT NULL, notes TEXT NOT NULL, method TEXT NOT NULL,
                    api_url TEXT, status TEXT NOT NULL, adapter_key TEXT,
                    task_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE(url, vertical, method)
                );
                ALTER TABLE source_requests ADD COLUMN IF NOT EXISTS resolved_method TEXT;
                ALTER TABLE source_requests ADD COLUMN IF NOT EXISTS analysis JSONB;
                ALTER TABLE source_requests ADD COLUMN IF NOT EXISTS artifact_path TEXT;
                CREATE TABLE IF NOT EXISTS crawl_tasks (
                    id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES source_requests(id),
                    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    locked_at TIMESTAMPTZ, worker_id TEXT, last_error TEXT
                );
                CREATE INDEX IF NOT EXISTS crawl_tasks_ready_idx
                    ON crawl_tasks (status, available_at);
                CREATE TABLE IF NOT EXISTS source_tasks (
                    id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL REFERENCES source_requests(id),
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    locked_at TIMESTAMPTZ,
                    worker_id TEXT,
                    last_error TEXT,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    UNIQUE(request_id, kind)
                );
                CREATE INDEX IF NOT EXISTS source_tasks_ready_idx
                    ON source_tasks (status, available_at);
                INSERT INTO source_tasks (id,request_id,kind,status,attempts,available_at,locked_at,worker_id,last_error)
                    SELECT id,request_id,'scrape',status,attempts,available_at,locked_at,worker_id,last_error
                    FROM crawl_tasks WHERE true ON CONFLICT (id) DO NOTHING;
            """)

    def is_empty(self) -> bool:
        with self.connect() as db:
            return db.execute("SELECT count(*) AS count FROM offers").fetchone()["count"] == 0

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
                    db.execute("""
                        INSERT INTO offers (id, raw, normalized) VALUES (%s, %s::jsonb, %s::jsonb)
                        ON CONFLICT (id) DO UPDATE SET raw=EXCLUDED.raw, normalized=EXCLUDED.normalized
                    """, (identity, json.dumps(raw, ensure_ascii=False), json.dumps(normalized, ensure_ascii=False)))
                    db.execute("DELETE FROM rejected WHERE id=%s", (identity,))
                    accepted += 1
                except Exception as error:
                    db.execute("""INSERT INTO rejected (id, reason) VALUES (%s, %s)
                        ON CONFLICT (id) DO UPDATE SET reason=EXCLUDED.reason""", (identity, str(error)))
                    db.execute("DELETE FROM offers WHERE id=%s", (identity,))
                    rejected += 1
            db.execute("""INSERT INTO metadata (key, value) VALUES ('generatedAt', %s)
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value""", (str(dataset.get("generatedAt", "")),))
        return {"accepted": accepted, "rejected": rejected}

    def observations(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            return [row["normalized"] for row in db.execute("SELECT normalized FROM offers ORDER BY id")]

    def source(self, identity: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT raw, normalized FROM offers WHERE id=%s", (identity,)).fetchone()
        return {"sample": True, "raw": row["raw"], "normalized": row["normalized"]} if row else None

    def stats(self, home_count: int) -> dict[str, Any]:
        with self.connect() as db:
            normalized = [row["normalized"] for row in db.execute("SELECT normalized FROM offers")]
            rejected = list(db.execute("SELECT id, reason FROM rejected ORDER BY id"))
            generated = db.execute("SELECT value FROM metadata WHERE key='generatedAt'").fetchone()
        counts: dict[str, int] = {}
        for offer in normalized:
            counts[offer["source"]] = counts.get(offer["source"], 0) + 1
        return {"rawCount": len(normalized) + len(rejected), "offerCount": len(normalized), "homeCount": home_count,
                "sourceCounts": counts, "rejected": rejected, "generatedAt": generated["value"] if generated else None, "sample": True}

    def save_source_request(self, request: CrawlRequest) -> CrawlRequest:
        with self.connect() as db:
            row = db.execute("""INSERT INTO source_requests
                (id,url,domain,vertical,notes,method,api_url,status,adapter_key,task_id,created_at,
                 resolved_method,analysis,artifact_path)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
                ON CONFLICT (url,vertical,method) DO UPDATE SET notes=EXCLUDED.notes
                RETURNING *""", (request.id, request.url, request.domain, request.vertical, request.notes,
                                   request.method, request.api_url, request.status, request.adapter_key,
                                   request.task_id, request.created_at, request.resolved_method,
                                   json.dumps(request.analysis, ensure_ascii=False) if request.analysis else None,
                                   request.artifact_path)).fetchone()
            if request.task_id:
                kind = "discovery" if request.method == "auto" else "scrape"
                db.execute("""INSERT INTO source_tasks (id,request_id,kind,status) VALUES (%s,%s,%s,'queued')
                    ON CONFLICT (id) DO NOTHING""", (request.task_id, row["id"], kind))
        return self.source_request(row["id"])

    def source_request(self, identity: str) -> CrawlRequest | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM source_requests WHERE id=%s", (identity,)).fetchone()
            tasks = list(db.execute("""SELECT id,kind,status,attempts,last_error FROM source_tasks
                WHERE request_id=%s ORDER BY kind""", (identity,))) if row else []
        return self._source_request(row, tasks) if row else None

    def claim_source_task(self, worker_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("""SELECT t.id,t.request_id,t.kind,t.payload,r.url,r.domain,r.vertical,
                    r.notes,r.method,r.api_url,r.status,r.adapter_key,r.task_id,r.created_at
                FROM source_tasks t JOIN source_requests r ON r.id=t.request_id
                WHERE t.status='queued' AND t.kind='discovery' AND t.available_at <= now()
                ORDER BY t.available_at FOR UPDATE SKIP LOCKED LIMIT 1""").fetchone()
            if not row:
                return None
            db.execute("""UPDATE source_tasks SET status='running',locked_at=now(),worker_id=%s,
                attempts=attempts+1 WHERE id=%s""", (worker_id, row["id"]))
            db.execute("UPDATE source_requests SET status=%s WHERE id=%s", (f"{row['kind']}_running", row["request_id"]))
            return row

    def claim_crawl_task(self, worker_id: str) -> dict[str, Any] | None:
        return self.claim_source_task(worker_id)

    def complete_source_task(self, task_id: str, result: Any) -> None:
        import hashlib

        with self.connect() as db:
            task = db.execute("SELECT request_id FROM source_tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone()
            if not task:
                raise ValueError("unknown_source_task")
            request_id = task["request_id"]
            db.execute("UPDATE source_tasks SET status='completed',last_error=NULL WHERE id=%s", (task_id,))
            db.execute("""UPDATE source_requests SET status=%s,resolved_method=%s,analysis=%s::jsonb,
                artifact_path=%s,adapter_key=%s,api_url=%s WHERE id=%s""",
                (result.status, result.resolved_method, json.dumps(result.analysis, ensure_ascii=False),
                 result.artifact_path, result.adapter_key, result.api_url, request_id))
            if result.resolved_method == "crawl":
                scrape_status = "blocked_policy" if result.status == "scraper_blocked" else "planned"
                for kind, status in (("scrape", scrape_status), ("monitor", "waiting_activation")):
                    identity = f"{kind}_" + hashlib.sha256(f"{request_id}|{kind}".encode()).hexdigest()[:12]
                    db.execute("""INSERT INTO source_tasks (id,request_id,kind,status,payload)
                        VALUES (%s,%s,%s,%s,%s::jsonb) ON CONFLICT (request_id,kind) DO NOTHING""",
                        (identity, request_id, kind, status, json.dumps({"artifactPath": result.artifact_path})))

    def fail_source_task(self, task_id: str, message: str, retry: bool) -> None:
        with self.connect() as db:
            task = db.execute("SELECT request_id,attempts FROM source_tasks WHERE id=%s FOR UPDATE", (task_id,)).fetchone()
            if not task:
                return
            should_retry = retry and task["attempts"] < 3
            delay_seconds = min(3600, 30 * (2 ** max(0, task["attempts"] - 1)))
            db.execute("""UPDATE source_tasks SET status=%s,last_error=%s,
                available_at=CASE WHEN %s THEN now() + (%s * interval '1 second') ELSE available_at END
                WHERE id=%s""", ("queued" if should_retry else "failed", message[:1000], should_retry, delay_seconds, task_id))
            db.execute("UPDATE source_requests SET status=%s WHERE id=%s",
                       ("discovery_queued" if should_retry else "needs_review", task["request_id"]))

    @staticmethod
    def _source_request(row: dict[str, Any], tasks: list[dict[str, Any]] | None = None) -> CrawlRequest:
        return CrawlRequest(id=row["id"], url=row["url"], domain=row["domain"], vertical=row["vertical"],
            notes=row["notes"], status=row["status"], adapter_key=row["adapter_key"],
            created_at=row["created_at"].isoformat().replace("+00:00", "Z"), method=row["method"],
            api_url=row["api_url"], task_id=row["task_id"], resolved_method=row.get("resolved_method"),
            analysis=row.get("analysis"), artifact_path=row.get("artifact_path"), tasks=tasks or [])
