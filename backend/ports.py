from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol, Sequence


class ValidationError(ValueError):
    """A client supplied value that the API cannot safely process."""


class OfferAdapter(Protocol):
    """Adapter boundary for one external website/schema."""

    schema: str

    def normalize(self, raw: Mapping[str, Any]) -> dict[str, Any]: ...


class RankingStrategy(Protocol):
    """Strategy boundary for ordering already eligible homes."""

    key: str

    def sort(self, homes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class CrawlRequest:
    id: str
    url: str
    domain: str
    vertical: str
    notes: str
    status: str
    adapter_key: str | None
    created_at: str
    method: str = "crawl"
    api_url: str | None = None
    task_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "domain": self.domain,
            "vertical": self.vertical,
            "notes": self.notes,
            "status": self.status,
            "adapterKey": self.adapter_key,
            "createdAt": self.created_at,
            "method": self.method,
            "apiUrl": self.api_url,
            "taskId": self.task_id,
        }
