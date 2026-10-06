from __future__ import annotations

import ipaddress
import os
import re
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import urlencode, urljoin, urlsplit

from .ports import ValidationError


PATH_PATTERN = re.compile(r"(?:[A-Za-z_][A-Za-z0-9_-]*|\d+)(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|\d+))*")
ENV_PATTERN = re.compile(r"[A-Z][A-Z0-9_]{2,80}")
ALLOWED_TRANSFORMS = {"identity", "string", "integer", "number", "boolean", "money_toman", "iso_datetime", "url"}
REQUIRED_FIELDS = {
    "housing": {"listing_id", "canonical_url", "title", "location", "deposit", "monthly_rent", "area", "bedrooms", "status", "observed_at"},
    "travel": {"listing_id", "canonical_url", "title", "location", "property_type", "capacity", "price", "currency", "price_scope", "availability", "observed_at"},
}


def validate_public_https_url(value: str, error_name: str = "invalid_external_url") -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValidationError(error_name)
    parsed = urlsplit(value)
    host = (parsed.hostname or "").rstrip(".").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.port:
        raise ValidationError(error_name)
    if host == "localhost" or "." not in host:
        raise ValidationError(error_name)
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None:
        raise ValidationError(error_name)
    return value


def validate_adapter_spec(spec: Mapping[str, Any], vertical: str) -> dict[str, Any]:
    if vertical not in REQUIRED_FIELDS or not isinstance(spec, Mapping):
        raise ValidationError("invalid_adapter_spec")
    base_url = validate_public_https_url(str(spec.get("api_base_url", "")), "invalid_adapter_spec:base_url")
    parsed_base = urlsplit(base_url)
    if parsed_base.query or parsed_base.fragment:
        raise ValidationError("invalid_adapter_spec:base_url")
    endpoint_path = str(spec.get("endpoint_path", ""))
    if not endpoint_path.startswith("/") or len(endpoint_path) > 500 or urlsplit(endpoint_path).scheme or ".." in endpoint_path:
        raise ValidationError("invalid_adapter_spec:endpoint")
    if spec.get("http_method") != "GET":
        raise ValidationError("invalid_adapter_spec:method")
    auth = spec.get("auth")
    if not isinstance(auth, Mapping) or auth.get("type") not in {"none", "api_key", "bearer", "oauth2"}:
        raise ValidationError("invalid_adapter_spec:auth")
    env_var = str(auth.get("env_var", ""))
    header_name = str(auth.get("header_name", ""))
    if auth.get("type") == "none":
        env_var = ""
        header_name = ""
    elif not ENV_PATTERN.fullmatch(env_var) or env_var in {"OPENAI_API_KEY", "DATABASE_URL"}:
        raise ValidationError("invalid_adapter_spec:auth_env")
    if header_name and not re.fullmatch(r"[A-Za-z0-9-]{1,100}", header_name):
        raise ValidationError("invalid_adapter_spec:auth_header")
    fields = spec.get("fields")
    if not isinstance(fields, list) or not fields or len(fields) > 100:
        raise ValidationError("invalid_adapter_spec:fields")
    canonical: set[str] = set()
    clean_fields: list[dict[str, Any]] = []
    for field in fields:
        if not isinstance(field, Mapping):
            raise ValidationError("invalid_adapter_spec:field")
        name = str(field.get("canonical", ""))
        path = str(field.get("source_path", ""))
        transform = str(field.get("transform", ""))
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", name) or not PATH_PATTERN.fullmatch(path) or transform not in ALLOWED_TRANSFORMS:
            raise ValidationError("invalid_adapter_spec:field")
        if name in canonical:
            raise ValidationError("invalid_adapter_spec:duplicate_field")
        canonical.add(name)
        clean_fields.append({"canonical": name, "source_path": path, "required": bool(field.get("required")), "transform": transform})
    missing = REQUIRED_FIELDS[vertical] - canonical
    if missing:
        raise ValidationError("invalid_adapter_spec:missing:" + ",".join(sorted(missing)))
    optional_required_fields = {
        field["canonical"] for field in clean_fields
        if field["canonical"] in REQUIRED_FIELDS[vertical] and not field["required"]
    }
    if optional_required_fields:
        raise ValidationError("invalid_adapter_spec:optional_required:" + ",".join(sorted(optional_required_fields)))
    records_path = str(spec.get("records_path", ""))
    if records_path and not PATH_PATTERN.fullmatch(records_path):
        raise ValidationError("invalid_adapter_spec:records_path")
    pagination = spec.get("pagination")
    if not isinstance(pagination, Mapping) or pagination.get("strategy") not in {"none", "page", "offset", "cursor", "next_url"}:
        raise ValidationError("invalid_adapter_spec:pagination")
    page_size = pagination.get("page_size")
    if not isinstance(page_size, int) or isinstance(page_size, bool) or not 1 <= page_size <= 1000:
        raise ValidationError("invalid_adapter_spec:page_size")
    return {
        "api_base_url": base_url.rstrip("/") + "/",
        "endpoint_path": endpoint_path,
        "http_method": "GET",
        "auth": {"type": auth["type"], "header_name": header_name, "env_var": env_var},
        "pagination": {
            "strategy": pagination["strategy"],
            "request_parameter": str(pagination.get("request_parameter", ""))[:100],
            "response_path": str(pagination.get("response_path", ""))[:300],
            "page_size_parameter": str(pagination.get("page_size_parameter", ""))[:100],
            "page_size": page_size,
        },
        "records_path": records_path,
        "fields": clean_fields,
        "deletion_policy": str(spec.get("deletion_policy", ""))[:2000],
        "terms_note": str(spec.get("terms_note", ""))[:2000],
        "fixture_tests": list(spec.get("fixture_tests", []))[:20],
        "vertical": vertical,
    }


def _at_path(value: Any, path: str) -> Any:
    current = value
    for part in path.split(".") if path else []:
        if isinstance(current, Mapping):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


def _transform(value: Any, name: str) -> Any:
    if value is None or name == "identity":
        return value
    if name in {"string", "url", "iso_datetime"}:
        return str(value).strip()
    if name == "integer":
        return int(value)
    if name == "number":
        return float(value)
    if name == "boolean":
        if value in (True, 1, "1", "true", "yes"):
            return True
        if value in (False, 0, "0", "false", "no"):
            return False
        return None
    if name == "money_toman":
        return int(float(value))
    raise ValidationError("unsupported_adapter_transform")


@dataclass(frozen=True)
class DeclarativeApiAdapter:
    """A reviewable GET-only adapter model; this class does not perform network I/O."""

    spec: Mapping[str, Any]

    def request_descriptor(self, parameters: Mapping[str, Any] | None = None) -> dict[str, Any]:
        query = urlencode({key: value for key, value in (parameters or {}).items() if value is not None})
        url = urljoin(str(self.spec["api_base_url"]), str(self.spec["endpoint_path"]).lstrip("/"))
        if query:
            url += ("&" if "?" in url else "?") + query
        auth = self.spec["auth"]
        headers: dict[str, str] = {}
        if auth["type"] != "none":
            token = os.environ.get(auth["env_var"])
            if not token:
                raise RuntimeError(f"missing adapter credential: {auth['env_var']}")
            header = auth["header_name"] or "Authorization"
            headers[header] = f"Bearer {token}" if auth["type"] in {"bearer", "oauth2"} else token
        return {"method": "GET", "url": url, "headers": headers}

    def records(self, response: Mapping[str, Any] | list[Any]) -> list[dict[str, Any]]:
        records = _at_path(response, str(self.spec.get("records_path", "")))
        if not isinstance(records, list):
            raise ValidationError("adapter_records_not_array")
        normalized: list[dict[str, Any]] = []
        for record in records:
            if not isinstance(record, Mapping):
                continue
            item: dict[str, Any] = {}
            for field in self.spec["fields"]:
                value = _at_path(record, field["source_path"])
                if value is None and field["required"]:
                    raise ValidationError(f"adapter_missing_field:{field['canonical']}")
                item[field["canonical"]] = _transform(value, field["transform"])
            normalized.append(item)
        return normalized


def build_adapter(spec: Mapping[str, Any]) -> DeclarativeApiAdapter:
    return DeclarativeApiAdapter(validate_adapter_spec(spec, str(spec.get("vertical", ""))))
