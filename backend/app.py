from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .adapters import AdapterRegistry, DISTRICTS
from .crawl import CrawlRequestService
from .housing import HousingSearchService, cluster_offers
from .ports import ValidationError
from .repository import SQLiteRepository
from .travel import TravelSearchService


ROOT = Path(__file__).resolve().parent.parent


def _query(value: str) -> dict[str, Any]:
    parsed = parse_qs(value, keep_blank_values=True)
    return {key: items[0] if len(items) == 1 else items for key, items in parsed.items()}


class Application:
    def __init__(self, root: Path = ROOT, database: str | Path | None = None):
        self.root = root
        self.adapters = AdapterRegistry()
        self.repository = SQLiteRepository(database or os.environ.get("DATABASE_PATH") or root / "data/catalog.sqlite")
        if self.repository.is_empty():
            dataset = json.loads((root / "data/offers.json").read_text())
            self.repository.ingest(dataset, self.adapters)
        self.housing = HousingSearchService()
        self.travel = TravelSearchService()
        self.crawls = CrawlRequestService(self.repository)

    def get(self, path: str, values: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        if path == "/api/health":
            return 200, {"ok": True, "backend": "python", "adapterCount": len(self.adapters.keys), "rankingAlgorithms": self.housing.rankings.keys}
        if path == "/api/catalog":
            homes = cluster_offers(self.repository.observations())
            return 200, {**self.repository.stats(len(homes)), "districts": DISTRICTS, "adapters": self.adapters.keys, "rankingAlgorithms": self.housing.rankings.keys}
        if path == "/api/search":
            if len(str(values.get("q", ""))) > 500:
                raise ValidationError("query_too_long")
            homes = cluster_offers(self.repository.observations())
            return 200, self.housing.search(homes, values)
        if path == "/api/safar/search":
            catalog_path = self.root / "data/safar-catalog.json"
            if not catalog_path.exists():
                return 503, {"error": "safar_catalog_unavailable"}
            return 200, self.travel.search(json.loads(catalog_path.read_text()), values)
        if path.startswith("/api/source/"):
            source = self.repository.source(unquote(path.removeprefix("/api/source/")))
            return (200, source) if source else (404, {"error": "not_found"})
        if path.startswith("/api/crawl-requests/"):
            request = self.crawls.get(unquote(path.removeprefix("/api/crawl-requests/")))
            return (200, request.as_dict()) if request else (404, {"error": "not_found"})
        return 404, {"error": "not_found"}

    def post(self, path: str, values: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        if path == "/api/crawl-requests":
            request = self.crawls.submit(values)
            return 202, {
                **request.as_dict(),
                "message": "درخواست ثبت شد و پس از بررسی منبع، آداپتر مناسب به آن اختصاص می‌یابد.",
            }
        return 404, {"error": "not_found"}


def handler_for(application: Application):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TorobKhanehPython/1.0"

        def do_GET(self) -> None:
            target = urlsplit(self.path)
            if target.path.startswith("/api/"):
                self._api(lambda: application.get(target.path, _query(target.query)))
            else:
                self._static(target.path)

        def do_POST(self) -> None:
            target = urlsplit(self.path)
            if not target.path.startswith("/api/"):
                self._json(404, {"error": "not_found"})
                return
            if self.headers.get_content_type() != "application/json":
                self._json(415, {"error": "json_required"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._json(400, {"error": "invalid_body"})
                return
            if length <= 0 or length > 32768:
                self._json(413 if length > 32768 else 400, {"error": "invalid_body"})
                return
            try:
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError
            except (json.JSONDecodeError, ValueError):
                self._json(400, {"error": "invalid_json"})
                return
            self._api(lambda: application.post(target.path, body))

        def _api(self, operation) -> None:
            try:
                status, payload = operation()
                self._json(status, payload)
            except (BrokenPipeError, ConnectionResetError):
                return
            except ValidationError as error:
                self._json(400, {"error": str(error)})
            except Exception as error:  # pragma: no cover - last-resort HTTP boundary
                print(f"backend error: {error!r}", file=sys.stderr)
                self._json(500, {"error": "internal_error"})

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            try:
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                return

        def _static(self, request_path: str) -> None:
            dist = (application.root / "dist").resolve()
            try:
                relative = unquote(request_path).lstrip("/")
                candidate = (dist / relative).resolve()
                candidate.relative_to(dist)
            except (ValueError, OSError):
                self._json(403, {"error": "forbidden"})
                return
            target = candidate if candidate.is_file() else dist / "index.html"
            if not target.exists():
                self._json(503, {"error": "Build the app with npm run build first."})
                return
            data = target.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "public,max-age=31536000,immutable" if "assets" in target.parts else "no-cache")
            try:
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                return

        def log_message(self, message: str, *args: Any) -> None:
            print(f"{self.address_string()} {message % args}")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Torob Khaneh Python API and static server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "4317")))
    args = parser.parse_args()
    application = Application()
    server = ThreadingHTTPServer((args.host, args.port), handler_for(application))
    print(f"Torob Khaneh (Python) → http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
