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
        method = str(values.get("method", "auto")).lower()
        api_url = str(values.get("apiUrl", values.get("api_url", ""))).strip() or None
        if method not in ("auto", "api", "crawl"):
            raise ValidationError("invalid_source_request:method")
        vertical = str(values.get("vertical", "housing"))
        notes = str(values.get("notes", "")).strip()
        if vertical not in ("housing", "travel"):
            raise ValidationError("invalid_crawl_request:vertical")
        if len(raw_url) > 2048 or len(notes) > 500:
            raise ValidationError("invalid_crawl_request:length")
        if method == "api" and api_url:
            parsed_api = urlsplit(api_url)
            if parsed_api.scheme != "https" or not parsed_api.hostname or parsed_api.username or parsed_api.password:
                raise ValidationError("invalid_source_request:api_url")
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
        prefix = "source_" if method == "auto" else ("api_" if method == "api" else "crawl_")
        identity = prefix + hashlib.sha256(f"{method}|{vertical}|{normalized}".encode()).hexdigest()[:12]
        task_id = ("task_" + hashlib.sha256(identity.encode()).hexdigest()[:12]) if method in ("auto", "crawl") else None
        request = CrawlRequest(
            id=identity,
            url=normalized,
            domain=hostname,
            vertical=vertical,
            notes=notes,
            status="discovery_queued" if method == "auto" else ("awaiting_api_access" if method == "api" else "queued"),
            adapter_key=None,
            created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            method=method,
            api_url=api_url,
            task_id=task_id,
        )
        if hasattr(self.repository, "save_source_request"):
            return self.repository.save_source_request(request)
        return self.repository.save_crawl_request(request)

    def get(self, identity: str) -> CrawlRequest | None:
        if identity.startswith("crawl_") and len(identity) != 18:
            return None
        if identity.startswith("api_") and len(identity) != 16:
            return None
        if identity.startswith("source_") and len(identity) != 19:
            return None
        if not (identity.startswith("crawl_") or identity.startswith("api_") or identity.startswith("source_")):
            return None
        if hasattr(self.repository, "source_request"):
            return self.repository.source_request(identity)
        return self.repository.crawl_request(identity)
