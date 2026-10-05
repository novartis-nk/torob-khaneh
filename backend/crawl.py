from __future__ import annotations

import hashlib
import ipaddress
from datetime import datetime, timezone
from typing import Any, Mapping
from urllib.parse import urlsplit, urlunsplit

from .ports import CrawlRequest, ValidationError
from .repository import SQLiteRepository


class CrawlRequestService:
    """Queues discovery work; workers can later claim jobs and choose an adapter."""

    def __init__(self, repository: SQLiteRepository):
        self.repository = repository

    def submit(self, values: Mapping[str, Any]) -> CrawlRequest:
        raw_url = str(values.get("url", "")).strip()
        vertical = str(values.get("vertical", "housing"))
        notes = str(values.get("notes", "")).strip()
        if vertical not in ("housing", "travel"):
            raise ValidationError("invalid_crawl_request:vertical")
        if len(raw_url) > 2048 or len(notes) > 500:
            raise ValidationError("invalid_crawl_request:length")
        parsed = urlsplit(raw_url if "://" in raw_url else f"https://{raw_url}")
        hostname = (parsed.hostname or "").rstrip(".").lower()
        try:
            port = parsed.port
        except ValueError as error:
            raise ValidationError("invalid_crawl_request:url") from error
        if parsed.scheme not in ("http", "https") or not hostname or parsed.username or parsed.password or port:
            raise ValidationError("invalid_crawl_request:url")
        if hostname == "localhost" or "." not in hostname:
            raise ValidationError("invalid_crawl_request:host")
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            address = None
        if address is not None:
            raise ValidationError("invalid_crawl_request:host")
        normalized = urlunsplit(("https", hostname, parsed.path or "/", parsed.query, ""))
        identity = "crawl_" + hashlib.sha256(f"{vertical}|{normalized}".encode()).hexdigest()[:12]
        request = CrawlRequest(
            id=identity,
            url=normalized,
            domain=hostname,
            vertical=vertical,
            notes=notes,
            status="queued",
            adapter_key=None,
            created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        )
        return self.repository.save_crawl_request(request)

    def get(self, identity: str) -> CrawlRequest | None:
        if not identity.startswith("crawl_") or len(identity) != 18:
            return None
        return self.repository.crawl_request(identity)
