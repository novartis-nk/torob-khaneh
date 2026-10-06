from __future__ import annotations

import ast
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol
from urllib.parse import urlsplit

from .api_factory import REQUIRED_FIELDS, validate_adapter_spec, validate_public_https_url
from .ports import CrawlRequest, ValidationError


class IntelligenceAgent(Protocol):
    def investigate(self, context: Mapping[str, Any]) -> dict[str, Any]: ...
    def assess_coverage(self, context: Mapping[str, Any]) -> dict[str, Any]: ...
    def design_adapter(self, context: Mapping[str, Any]) -> dict[str, Any]: ...
    def plan_scraper(self, context: Mapping[str, Any]) -> dict[str, Any]: ...


@dataclass(frozen=True)
class OnboardingResult:
    resolved_method: str
    status: str
    analysis: dict[str, Any]
    artifact_path: str
    adapter_key: str | None = None
    api_url: str | None = None


class IntegrationArtifactStore:
    """Writes review-only adapter models and scraper task specifications."""

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or os.environ.get("INTEGRATION_ARTIFACT_DIR", "generated/integrations"))

    @staticmethod
    def adapter_key(domain: str, vertical: str) -> str:
        domain_key = re.sub(r"[^a-z0-9]+", "_", domain.lower()).strip("_")[:50]
        return f"{vertical}_{domain_key}_v1"

    def write_adapter(self, request: CrawlRequest, raw_spec: Mapping[str, Any]) -> tuple[str, str, dict[str, Any]]:
        spec = validate_adapter_spec(raw_spec, request.vertical)
        key = self.adapter_key(request.domain, request.vertical)
        directory = self.root / request.id
        directory.mkdir(parents=True, exist_ok=True)
        manifest = directory / f"{key}.json"
        model_file = directory / f"{key}.py"
        manifest.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        source = (
            '"""AI-assisted declarative adapter model. Review and test before registration."""\n\n'
            "from backend.api_factory import build_adapter\n\n"
            f"SPEC = {spec!r}\n\n"
            "def create_adapter():\n"
            "    return build_adapter(SPEC)\n"
        )
        ast.parse(source)
        model_file.write_text(source, encoding="utf-8")
        return key, str(model_file.relative_to(self.root)), spec

    def write_scraper_task(self, request: CrawlRequest, plan: Mapping[str, Any]) -> str:
        validate_scraper_plan(plan, request.url, request.vertical)
        directory = self.root / request.id
        directory.mkdir(parents=True, exist_ok=True)
        plan_file = directory / "scraper-plan.json"
        task_file = directory / "SCRAPER_TASK.md"
        plan_file.write_text(json.dumps(dict(plan), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        task_file.write_text(
            "# Scraper implementation and monitoring task\n\n"
            f"- Request: `{request.id}`\n"
            f"- Website: `{request.url}`\n"
            f"- Vertical: `{request.vertical}`\n"
            "- State: planned; human policy and selector verification required before activation\n"
            "- Specification: `scraper-plan.json`\n"
            "- Monitor prompt: `backend/prompts/scrape_monitor.md`\n\n"
            "## Definition of done\n\n"
            "1. Robots/terms/access review is recorded and approved.\n"
            "2. Selectors and structured-data paths are verified in a browser fixture.\n"
            "3. Raw evidence and normalized records pass the plan's quality gates.\n"
            "4. Per-domain rate limiting, retry/backoff, idempotency, deletion, and freshness handling are enabled.\n"
            "5. Monitoring baselines and pause thresholds are active before scheduling.\n",
            encoding="utf-8",
        )
        return str(task_file.relative_to(self.root))


def validate_scraper_plan(plan: Mapping[str, Any], submitted_url: str, vertical: str) -> None:
    if vertical not in REQUIRED_FIELDS or not isinstance(plan, Mapping):
        raise ValidationError("invalid_scraper_plan")
    entries = plan.get("entry_urls")
    if not isinstance(entries, list) or not entries or len(entries) > 20:
        raise ValidationError("invalid_scraper_plan:entry_urls")
    submitted_domain = (urlsplit(submitted_url).hostname or "").lower()
    for entry in entries:
        validate_public_https_url(str(entry), "invalid_scraper_plan:entry_url")
        entry_domain = (urlsplit(str(entry)).hostname or "").lower()
        if entry_domain != submitted_domain and not entry_domain.endswith("." + submitted_domain):
            raise ValidationError("invalid_scraper_plan:foreign_domain")
    policy = plan.get("policy_review")
    if not isinstance(policy, Mapping) or policy.get("authorization_status") not in {"allowed", "prohibited", "unclear"}:
        raise ValidationError("invalid_scraper_plan:policy")
    if policy.get("authorization_status") != "allowed" and policy.get("human_approval_required") is not True:
        raise ValidationError("invalid_scraper_plan:approval")
    fields = plan.get("fields")
    if not isinstance(fields, list) or not fields or len(fields) > 100:
        raise ValidationError("invalid_scraper_plan:fields")
    canonical = {str(field.get("canonical")) for field in fields if isinstance(field, Mapping)}
    if not REQUIRED_FIELDS[vertical].issubset(canonical):
        raise ValidationError("invalid_scraper_plan:missing_fields")
    if not isinstance(plan.get("quality_gates"), list) or not plan["quality_gates"]:
        raise ValidationError("invalid_scraper_plan:quality_gates")
    if not isinstance(plan.get("monitoring_checks"), list) or not plan["monitoring_checks"]:
        raise ValidationError("invalid_scraper_plan:monitoring")


class SourceOnboardingOrchestrator:
    def __init__(self, agent: IntelligenceAgent, artifacts: IntegrationArtifactStore):
        self.agent = agent
        self.artifacts = artifacts

    def onboard(self, request: CrawlRequest) -> OnboardingResult:
        base_context = {
            "submitted_url": request.url,
            "domain": request.domain,
            "vertical": request.vertical,
            "user_requirements": request.notes,
            "required_fields": sorted(REQUIRED_FIELDS[request.vertical]),
        }
        discovery = self.agent.investigate(base_context)
        coverage = self.agent.assess_coverage({**base_context, "discovery_report": discovery})
        decision = self._enforced_decision(discovery, coverage, request.vertical)
        if decision == "api":
            raw_spec = self.agent.design_adapter({**base_context, "discovery_report": discovery, "coverage_report": coverage})
            selected_host = (urlsplit(str(coverage["selected_api_url"])).hostname or "").lower()
            adapter_host = (urlsplit(str(raw_spec.get("api_base_url", ""))).hostname or "").lower()
            if adapter_host != selected_host:
                raise ValidationError("adapter_api_does_not_match_approved_api")
            adapter_key, path, spec = self.artifacts.write_adapter(request, raw_spec)
            return OnboardingResult(
                resolved_method="api",
                status="adapter_review",
                analysis={"discovery": discovery, "coverage": coverage, "adapter": spec, "reviewRequired": True},
                artifact_path=path,
                adapter_key=adapter_key,
                api_url=str(coverage["selected_api_url"]),
            )
        plan = self.agent.plan_scraper({**base_context, "discovery_report": discovery, "coverage_report": coverage})
        path = self.artifacts.write_scraper_task(request, plan)
        policy = plan.get("policy_review") if isinstance(plan, Mapping) else None
        policy_status = policy.get("authorization_status") if isinstance(policy, Mapping) else None
        return OnboardingResult(
            resolved_method="crawl",
            status="scraper_blocked" if policy_status == "prohibited" else "scraper_planned",
            analysis={"discovery": discovery, "coverage": coverage, "scraperPlan": plan, "reviewRequired": True},
            artifact_path=path,
        )

    @staticmethod
    def _enforced_decision(discovery: Mapping[str, Any], coverage: Mapping[str, Any], vertical: str) -> str:
        if coverage.get("decision") != "api" or coverage.get("missing_required_fields"):
            return "scrape"
        try:
            confidence = float(coverage.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0
        if confidence < 0.7:
            return "scrape"
        selected = str(coverage.get("selected_api_url", ""))
        try:
            validate_public_https_url(selected, "invalid_coverage_api_url")
        except ValidationError:
            return "scrape"
        selected_host = (urlsplit(selected).hostname or "").lower()
        candidate_hosts: set[str] = set()
        for candidate in discovery.get("official_api_candidates", []):
            if not isinstance(candidate, Mapping):
                continue
            try:
                candidate_confidence = float(candidate.get("confidence", 0))
                candidate_url = validate_public_https_url(str(candidate.get("base_url", "")))
            except (TypeError, ValueError, ValidationError):
                continue
            if candidate_confidence >= 0.7 and candidate.get("evidence"):
                candidate_hosts.add((urlsplit(candidate_url).hostname or "").lower())
        if selected_host not in candidate_hosts:
            return "scrape"
        covered = {
            str(field.get("canonical_field"))
            for field in coverage.get("coverage", [])
            if isinstance(field, Mapping) and field.get("status") in {"available", "derived"}
        }
        return "api" if REQUIRED_FIELDS[vertical].issubset(covered) else "scrape"
