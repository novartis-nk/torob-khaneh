from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.adapters import AdapterRegistry, ValidationError
from backend.app import Application, ROOT
from backend.housing import HousingSearchService, cluster_offers
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

