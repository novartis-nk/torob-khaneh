from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROMPT_ROOT = Path(__file__).with_name("prompts")


class AIProviderError(RuntimeError):
    """The configured AI provider could not return a usable structured result."""


def load_master_prompt(name: str) -> str:
    if name not in {"source_discovery", "api_coverage", "api_adapter_factory", "scraper_planner", "scrape_monitor"}:
        raise ValueError("unknown_master_prompt")
    return (PROMPT_ROOT / f"{name}.md").read_text(encoding="utf-8")


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or list(properties),
        "additionalProperties": False,
    }


EVIDENCE = _object({
    "url": {"type": "string"},
    "summary": {"type": "string"},
})

DISCOVERY_SCHEMA = _object({
    "website": {"type": "string"},
    "canonical_domain": {"type": "string"},
    "summary": {"type": "string"},
    "official_api_candidates": {
        "type": "array",
        "items": _object({
            "name": {"type": "string"},
            "documentation_url": {"type": "string"},
            "base_url": {"type": "string"},
            "access_model": {"type": "string", "enum": ["public", "api_key", "partner", "oauth", "unknown"]},
            "evidence": {"type": "array", "items": EVIDENCE},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        }),
    },
    "structured_public_sources": {"type": "array", "items": EVIDENCE},
    "risks": {"type": "array", "items": {"type": "string"}},
})

COVERAGE_SCHEMA = _object({
    "decision": {"type": "string", "enum": ["api", "scrape"]},
    "reason": {"type": "string"},
    "selected_api_url": {"type": "string"},
    "documentation_url": {"type": "string"},
    "coverage": {
        "type": "array",
        "items": _object({
            "canonical_field": {"type": "string"},
            "source_path": {"type": "string"},
            "status": {"type": "string", "enum": ["available", "derived", "missing"]},
            "evidence": {"type": "string"},
        }),
    },
    "missing_required_fields": {"type": "array", "items": {"type": "string"}},
    "auth_requirements": {"type": "string"},
    "pagination": {"type": "string"},
    "rate_limits": {"type": "string"},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
})

ADAPTER_SCHEMA = _object({
    "api_base_url": {"type": "string"},
    "endpoint_path": {"type": "string"},
    "http_method": {"type": "string", "enum": ["GET"]},
    "auth": _object({
        "type": {"type": "string", "enum": ["none", "api_key", "bearer", "oauth2"]},
        "header_name": {"type": "string"},
        "env_var": {"type": "string"},
    }),
    "pagination": _object({
        "strategy": {"type": "string", "enum": ["none", "page", "offset", "cursor", "next_url"]},
        "request_parameter": {"type": "string"},
        "response_path": {"type": "string"},
        "page_size_parameter": {"type": "string"},
        "page_size": {"type": "integer", "minimum": 1, "maximum": 1000},
    }),
    "records_path": {"type": "string"},
    "fields": {
        "type": "array",
        "items": _object({
            "canonical": {"type": "string"},
            "source_path": {"type": "string"},
            "required": {"type": "boolean"},
            "transform": {"type": "string", "enum": ["identity", "string", "integer", "number", "boolean", "money_toman", "iso_datetime", "url"]},
        }),
    },
    "deletion_policy": {"type": "string"},
    "terms_note": {"type": "string"},
    "fixture_tests": {
        "type": "array",
        "items": _object({
            "name": {"type": "string"},
            "purpose": {"type": "string"},
            "expected_fields": {"type": "array", "items": {"type": "string"}},
        }),
    },
})

SCRAPER_SCHEMA = _object({
    "entry_urls": {"type": "array", "items": {"type": "string"}},
    "policy_review": _object({
        "robots_url": {"type": "string"},
        "terms_url": {"type": "string"},
        "authorization_status": {"type": "string", "enum": ["allowed", "prohibited", "unclear"]},
        "human_approval_required": {"type": "boolean"},
        "notes": {"type": "string"},
    }),
    "rendering": {"type": "string", "enum": ["http", "browser", "hybrid"]},
    "list_strategy": {"type": "string"},
    "detail_strategy": {"type": "string"},
    "pagination_strategy": {"type": "string"},
    "fields": {
        "type": "array",
        "items": _object({
            "canonical": {"type": "string"},
            "primary_source": {"type": "string"},
            "fallback_source": {"type": "string"},
            "attribute": {"type": "string"},
            "transform": {"type": "string"},
            "required": {"type": "boolean"},
        }),
    },
    "identity_rule": {"type": "string"},
    "freshness_and_deletion": {"type": "string"},
    "rate_limit": {"type": "string"},
    "quality_gates": {"type": "array", "items": {"type": "string"}},
    "monitoring_checks": {"type": "array", "items": {"type": "string"}},
    "failure_handling": {"type": "array", "items": {"type": "string"}},
    "verification_required": {"type": "array", "items": {"type": "string"}},
})

MONITOR_SCHEMA = _object({
    "status": {"type": "string", "enum": ["healthy", "degraded", "pause", "human_review"]},
    "summary": {"type": "string"},
    "findings": {
        "type": "array",
        "items": _object({
            "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
            "metric": {"type": "string"},
            "evidence": {"type": "string"},
            "recommended_action": {"type": "string"},
        }),
    },
    "next_check_minutes": {"type": "integer", "minimum": 5, "maximum": 10080},
})


class OpenAIResponsesClient:
    """Small Responses API client using only the Python standard library."""

    endpoint = "https://api.openai.com/v1/responses"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 120,
        transport: Callable[[Request, float], Mapping[str, Any]] | None = None,
    ):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model or os.environ.get("OPENAI_MODEL", "gpt-5-mini")
        self.timeout = timeout
        self.transport = transport or self._transport
        if not self.api_key:
            raise AIProviderError("OPENAI_API_KEY is required by the source-discovery worker")

    def structured(self, prompt: str, context: Mapping[str, Any], schema_name: str, schema: dict[str, Any], web_search: bool = False) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "store": False,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": prompt}]},
                {"role": "user", "content": [{"type": "input_text", "text": json.dumps(context, ensure_ascii=False)}]},
            ],
            "text": {"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
        }
        if web_search:
            body["tools"] = [{"type": "web_search"}]
        request = Request(
            self.endpoint,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "torob-source-onboarding/1.0"},
            method="POST",
        )
        response = self.transport(request, self.timeout)
        text = self._output_text(response)
        try:
            parsed = json.loads(text)
        except (TypeError, json.JSONDecodeError) as error:
            raise AIProviderError("AI response did not contain valid structured JSON") from error
        if not isinstance(parsed, dict):
            raise AIProviderError("AI response root must be an object")
        return parsed

    @staticmethod
    def _output_text(response: Mapping[str, Any]) -> str:
        direct = response.get("output_text")
        if isinstance(direct, str):
            return direct
        for item in response.get("output", []):
            if not isinstance(item, Mapping) or item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if isinstance(content, Mapping) and content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return content["text"]
        raise AIProviderError("AI response had no output text")

    @staticmethod
    def _transport(request: Request, timeout: float) -> Mapping[str, Any]:
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read(4096).decode("utf-8", errors="replace")
            raise AIProviderError(f"OpenAI Responses API returned HTTP {error.code}: {detail}") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise AIProviderError(f"OpenAI Responses API request failed: {error}") from error
        if not isinstance(payload, Mapping):
            raise AIProviderError("OpenAI Responses API returned an invalid payload")
        return payload


class SourceIntelligenceAgent:
    def __init__(self, client: OpenAIResponsesClient):
        self.client = client

    def investigate(self, context: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.structured(load_master_prompt("source_discovery"), context, "source_discovery", DISCOVERY_SCHEMA, web_search=True)

    def assess_coverage(self, context: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.structured(load_master_prompt("api_coverage"), context, "api_coverage", COVERAGE_SCHEMA)

    def design_adapter(self, context: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.structured(load_master_prompt("api_adapter_factory"), context, "api_adapter_factory", ADAPTER_SCHEMA)

    def plan_scraper(self, context: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.structured(load_master_prompt("scraper_planner"), context, "scraper_plan", SCRAPER_SCHEMA, web_search=True)

    def monitor_scraper(self, context: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.structured(load_master_prompt("scrape_monitor"), context, "scrape_monitor", MONITOR_SCHEMA)
