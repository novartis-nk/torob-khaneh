from __future__ import annotations

import json
import runpy
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.adapters import AdapterRegistry, ValidationError
from backend.app import Application, ROOT
from backend.housing import HousingSearchService, cluster_offers
from backend.onboarding import IntegrationArtifactStore, SourceOnboardingOrchestrator
from backend.source_ai import OpenAIResponsesClient
from backend.travel import TravelSearchService


class BackendTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.app = Application(database=Path(self.temporary.name) / "catalog.sqlite")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_health_exposes_python_plugin_registries(self) -> None:
        status, result = self.app.get("/api/health", {})
        self.assertEqual(status, 200)
        self.assertEqual(result["backend"], "python")
        self.assertEqual(result["adapterCount"], 3)
        self.assertIn("recommended", result["rankingAlgorithms"])

    def test_adapter_registry_normalizes_three_schemas_and_quarantines_bad_price(self) -> None:
        dataset = json.loads((ROOT / "data/offers.json").read_text())
        registry = AdapterRegistry()
        normalized = [registry.normalize(row) for row in dataset["offers"] if row["id"] != "bad-price"]
        self.assertEqual({row["source"] for row in normalized}, {"direct", "agency", "portal"})
        bad = next(row for row in dataset["offers"] if row["id"] == "bad-price")
        with self.assertRaisesRegex(ValidationError, "invalid_price"):
            registry.normalize(bad)

    def test_hard_budgets_and_strategy_ranking_preserve_offer_values(self) -> None:
        homes = cluster_offers(self.app.repository.observations())
        service = HousingSearchService()
        now = int(datetime(2026, 10, 5, 9, tzinfo=timezone.utc).timestamp() * 1000)
        original = json.dumps(homes, sort_keys=True, ensure_ascii=False)
        self.assertEqual(service.search(homes, {"maxDeposit": "1", "maxRent": "1"}, now)["total"], 0)
        ranked = service.search(homes, {"sort": "rent"}, now)
        rents = [home["best"]["rent"] for home in ranked["results"]]
        self.assertEqual(rents, sorted(rents))
        self.assertEqual(ranked["rankingAlgorithm"], "rent-v1")
        self.assertEqual(json.dumps(homes, sort_keys=True, ensure_ascii=False), original)

    def test_crawl_requests_are_validated_idempotent_and_trackable(self) -> None:
        payload = {"url": "https://example.com/listings#top", "vertical": "housing", "notes": "public catalog"}
        first_status, first = self.app.post("/api/crawl-requests", payload)
        second_status, second = self.app.post("/api/crawl-requests", payload)
        self.assertEqual((first_status, second_status), (202, 202))
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.app.get(f"/api/crawl-requests/{first['id']}", {})[1]["status"], "queued")
        for url in ("http://localhost/private", "https://127.0.0.1/data", "javascript:alert(1)"):
            with self.assertRaisesRegex(ValidationError, "invalid_crawl_request"):
                self.app.post("/api/crawl-requests", {"url": url, "vertical": "travel"})

    def test_source_request_defaults_to_durable_ai_discovery(self) -> None:
        status, request = self.app.post("/api/source-requests", {
            "url": "https://example.com/listings", "vertical": "travel",
            "notes": "final prices and availability",
        })
        self.assertEqual(status, 202)
        self.assertRegex(request["id"], r"^source_[a-f0-9]{12}$")
        self.assertEqual(request["method"], "auto")
        self.assertEqual(request["status"], "discovery_queued")
        self.assertEqual(request["tasks"][0]["kind"], "discovery")
        task = self.app.repository.claim_source_task("test-worker")
        self.assertEqual(task["request_id"], request["id"])
        self.assertEqual(task["kind"], "discovery")

    def test_ai_api_route_generates_review_only_adapter_factory(self) -> None:
        status, submitted = self.app.post("/api/source-requests", {
            "url": "https://example.com/listings", "vertical": "housing", "notes": "prices",
        })
        self.assertEqual(status, 202)
        request = self.app.crawls.get(submitted["id"])
        required = {
            "listing_id", "canonical_url", "title", "location", "deposit", "monthly_rent",
            "area", "bedrooms", "status", "observed_at",
        }

        class FakeAgent:
            def investigate(self, context):
                return {"official_api_candidates": [{
                    "documentation_url": "https://example.com/developers",
                    "base_url": "https://api.example.com/v1/", "confidence": 0.95,
                    "evidence": [{"url": "https://example.com/developers", "summary": "official docs"}],
                }]}

            def assess_coverage(self, context):
                return {
                    "decision": "api", "reason": "documented", "selected_api_url": "https://api.example.com/v1",
                    "documentation_url": "https://example.com/developers",
                    "coverage": [{"canonical_field": field, "source_path": field, "status": "available", "evidence": "docs"} for field in sorted(required)],
                    "missing_required_fields": [], "auth_requirements": "API key", "pagination": "page",
                    "rate_limits": "documented", "confidence": 0.95,
                }

            def design_adapter(self, context):
                return {
                    "api_base_url": "https://api.example.com/v1/", "endpoint_path": "/listings",
                    "http_method": "GET", "auth": {"type": "api_key", "header_name": "X-API-Key", "env_var": "EXAMPLE_API_KEY"},
                    "pagination": {"strategy": "page", "request_parameter": "page", "response_path": "meta.next", "page_size_parameter": "limit", "page_size": 100},
                    "records_path": "items",
                    "fields": [{"canonical": field, "source_path": field, "required": True, "transform": "string"} for field in sorted(required)],
                    "deletion_policy": "expire absent records after a reviewed full sync", "terms_note": "partner access required",
                    "fixture_tests": [{"name": "maps listing", "purpose": "mapping", "expected_fields": sorted(required)}],
                }

            def plan_scraper(self, context):
                raise AssertionError("API route should not plan a scraper")

        with TemporaryDirectory() as artifacts:
            result = SourceOnboardingOrchestrator(FakeAgent(), IntegrationArtifactStore(artifacts)).onboard(request)
            self.assertEqual(result.status, "adapter_review")
            generated_path = Path(artifacts) / result.artifact_path
            self.assertTrue(generated_path.exists())
            generated = runpy.run_path(generated_path)
            adapter = generated["create_adapter"]()
            self.assertEqual(adapter.spec["http_method"], "GET")
            self.app.repository.complete_source_task(submitted["taskId"], result)
            saved = self.app.crawls.get(submitted["id"])
            self.assertEqual(saved.resolved_method, "api")
            self.assertEqual(saved.status, "adapter_review")

    def test_ai_fallback_creates_scrape_and_monitor_tasks(self) -> None:
        _, submitted = self.app.post("/api/source-requests", {
            "url": "https://example.com/listings", "vertical": "travel", "notes": "availability",
        })
        request = self.app.crawls.get(submitted["id"])
        required = {
            "listing_id", "canonical_url", "title", "location", "property_type", "capacity",
            "price", "currency", "price_scope", "availability", "observed_at",
        }

        class FakeAgent:
            def investigate(self, context):
                return {"official_api_candidates": []}

            def assess_coverage(self, context):
                return {"decision": "scrape", "missing_required_fields": ["availability"], "confidence": 0.9}

            def design_adapter(self, context):
                raise AssertionError("scrape route should not design an API adapter")

            def plan_scraper(self, context):
                return {
                    "entry_urls": ["https://example.com/listings"],
                    "policy_review": {"robots_url": "https://example.com/robots.txt", "terms_url": "https://example.com/terms", "authorization_status": "unclear", "human_approval_required": True, "notes": "review first"},
                    "rendering": "browser", "list_strategy": "JSON-LD then semantic selectors",
                    "detail_strategy": "visit public detail pages", "pagination_strategy": "next link",
                    "fields": [{"canonical": field, "primary_source": f"jsonld.{field}", "fallback_source": f"[data-{field}]", "attribute": "text", "transform": "string", "required": True} for field in sorted(required)],
                    "identity_rule": "provider listing ID", "freshness_and_deletion": "full-run tombstones",
                    "rate_limit": "one request per second", "quality_gates": ["required-null-rate = 0"],
                    "monitoring_checks": ["record-count drift under 20%"], "failure_handling": ["retry with backoff"],
                    "verification_required": ["browser fixture"],
                }

        with TemporaryDirectory() as artifacts:
            result = SourceOnboardingOrchestrator(FakeAgent(), IntegrationArtifactStore(artifacts)).onboard(request)
            self.assertEqual(result.resolved_method, "crawl")
            self.assertTrue((Path(artifacts) / result.artifact_path).exists())
            self.app.repository.complete_source_task(submitted["taskId"], result)
            saved = self.app.crawls.get(submitted["id"])
            states = {(task["kind"], task["status"]) for task in saved.tasks}
            self.assertIn(("scrape", "planned"), states)
            self.assertIn(("monitor", "waiting_activation"), states)

    def test_openai_client_requests_web_search_and_strict_schema(self) -> None:
        captured = {}

        def transport(request, timeout):
            captured.update(json.loads(request.data))
            return {"output_text": '{"answer":"ok"}'}

        client = OpenAIResponsesClient(api_key="test-token", model="test-model", transport=transport)
        result = client.structured("system", {"site": "example.com"}, "answer", {
            "type": "object", "properties": {"answer": {"type": "string"}},
            "required": ["answer"], "additionalProperties": False,
        }, web_search=True)
        self.assertEqual(result, {"answer": "ok"})
        self.assertEqual(captured["tools"], [{"type": "web_search"}])
        self.assertTrue(captured["text"]["format"]["strict"])

    def test_travel_starting_price_is_not_misrepresented_as_a_trip_quote(self) -> None:
        observed = "2026-10-05T06:00:00Z"
        listing = {
            "id": "otaghak-1", "provider": "otaghak", "title": "ویلا در رامسر", "city": "رامسر",
            "type": "villa", "capacity": 6, "startingPrice": 1_000_000, "observedAt": observed,
        }
        catalog = {"listings": [listing], "quotes": [], "providers": [], "updatedAt": observed}
        service = TravelSearchService()
        values = {"checkin": "2026-10-07", "checkout": "2026-10-09", "adults": "4"}
        now = datetime(2026, 10, 5, 9, tzinfo=timezone.utc)
        result = service.search(catalog, values, now)
        self.assertIsNone(result["results"][0]["quote"])
        self.assertEqual(service.search(catalog, {**values, "maxTotal": "999999999"}, now)["total"], 0)


if __name__ == "__main__":
    unittest.main()
