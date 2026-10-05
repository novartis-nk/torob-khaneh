from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Mapping

from .ports import OfferAdapter, ValidationError


DISTRICTS = [
    "صادقیه",
    "ستارخان",
    "جنت آباد",
    "پونک",
    "شهرآرا",
    "یوسف آباد",
    "امیرآباد",
    "تهرانپارس",
]
SOURCES = {
    "direct": "آگهی مستقیم · نمونه",
    "agency": "آژانس محلی · نمونه",
    "portal": "وب‌سایت ملک · نمونه",
}


def digits(value: Any) -> str:
    return str(value if value is not None else "").translate(
        str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    )


def normalize_text(value: Any) -> str:
    return " ".join(
        digits(value)
        .lower()
        .replace("ي", "ی")
        .replace("ك", "ک")
        .replace("\u200c", " ")
        .replace("\u200f", " ")
        .replace("\u200e", " ")
        .split()
    )


def money(value: Any, unit: str = "toman") -> int:
    if value is None or value == "":
        raise ValidationError("missing_price")
    text = normalize_text(value).replace(",", "").replace("٬", "").replace("٫", ".")
    if not re.fullmatch(r"(?:\d+(?:\.\d+)?)\s*(?:(?:میلیون|میلیارد)\s*)?(?:تومان|ریال)?", text):
        raise ValidationError("invalid_price")
    number = float(re.match(r"\d+(?:\.\d+)?", text).group(0))
    if "میلیارد" in text:
        number *= 1_000_000_000
    elif "میلیون" in text:
        number *= 1_000_000
    if "ریال" in text or ("تومان" not in text and unit == "rial"):
        number /= 10
    if number < 0 or number > 1_000_000_000_000 or not number.is_integer():
        raise ValidationError("invalid_price")
    return int(number)


def _boolean(value: Any) -> bool | None:
    if value in (True, "دارد", "بله", 1):
        return True
    if value in (False, "ندارد", "خیر", 0):
        return False
    return None


def _number(value: Any) -> float:
    try:
        return float(digits(value))
    except (TypeError, ValueError):
        return float("nan")


class _HousingAdapter:
    schema = ""

    def fields(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def normalize(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        fields = self.fields(raw)
        district = normalize_text(fields.get("district"))
        if district not in DISTRICTS:
            raise ValidationError("unknown_district")
        try:
            observed = datetime.fromisoformat(str(raw.get("observedAt", "")).replace("Z", "+00:00"))
        except ValueError as error:
            raise ValidationError("invalid_timestamp") from error
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if observed > now.replace(microsecond=now.microsecond) and (observed - now).total_seconds() > 60:
            raise ValidationError("invalid_timestamp")
        area = _number(fields.get("area"))
        bedrooms = _number(fields.get("bedrooms"))
        floor = _number(fields.get("floor"))
        if not (
            area.is_integer()
            and 15 <= area <= 1000
            and bedrooms.is_integer()
            and 0 <= bedrooms <= 10
            and floor.is_integer()
            and -2 <= floor <= 60
        ):
            raise ValidationError("invalid_property")
        identity = str(raw.get("id", ""))
        source = str(raw.get("source", ""))
        if not re.fullmatch(r"[a-z0-9-]{1,80}", identity) or source not in SOURCES:
            raise ValidationError("invalid_identity")
        image = str(fields.get("image", ""))
        if not re.fullmatch(r"/images/home-[1-6]\.jpg", image):
            raise ValidationError("invalid_image")
        lat, lng = fields.get("lat"), fields.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)) or not (35.5 <= lat <= 35.9 and 51.1 <= lng <= 51.7):
            raise ValidationError("invalid_location")
        metro = fields.get("metroMinutes")
        metro_minutes = None if metro is None else _number(metro)
        if metro_minutes is not None and (not metro_minutes.is_integer() or not 0 <= metro_minutes <= 180):
            raise ValidationError("invalid_metro")
        return {
            "id": identity,
            "source": source,
            "sourceName": SOURCES[source],
            "title": str(fields.get("title", ""))[:160],
            "district": district,
            "area": int(area),
            "bedrooms": int(bedrooms),
            "floor": int(floor),
            "deposit": int(fields["deposit"]),
            "rent": int(fields["rent"]),
            "parking": _boolean(fields.get("parking")),
            "elevator": _boolean(fields.get("elevator")),
            "balcony": _boolean(fields.get("balcony")),
            "metroMinutes": None if metro_minutes is None else int(metro_minutes),
            "metroName": str(fields.get("metroName", "")),
            "year": int(_number(fields.get("year"))) if _number(fields.get("year")).is_integer() else 0,
            "lat": lat,
            "lng": lng,
            "image": image,
            "imageFingerprint": str(fields.get("imageFingerprint", "")),
            "addressKey": normalize_text(fields.get("addressKey", "")),
            "observedAt": int(observed.timestamp() * 1000),
            "description": str(fields.get("description", ""))[:1000],
            "sample": True,
        }


class DirectAdapter(_HousingAdapter):
    schema = "direct-v1"

    def fields(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        return {**raw, "area": raw.get("size"), "deposit": money(raw.get("deposit")), "rent": money(raw.get("rent"))}


class AgencyAdapter(_HousingAdapter):
    schema = "agency-v1"

    def fields(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        pricing = raw.get("pricing") or {}
        return {
            **raw,
            **(raw.get("property") or {}),
            "deposit": money(pricing.get("deposit"), "rial"),
            "rent": money(pricing.get("monthly"), "rial"),
        }


class PortalAdapter(_HousingAdapter):
    schema = "portal-v1"

    def fields(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        offer = raw.get("offer") or {}
        return {
            **raw,
            **(raw.get("attributes") or {}),
            "deposit": money(offer.get("securityDeposit")),
            "rent": money(offer.get("monthlyRent")),
        }


class AdapterRegistry:
    """Factory/registry: new websites register an adapter without changing ingestion."""

    def __init__(self, adapters: list[OfferAdapter] | None = None):
        items = adapters or [DirectAdapter(), AgencyAdapter(), PortalAdapter()]
        self._adapters = {adapter.schema: adapter for adapter in items}

    @property
    def keys(self) -> list[str]:
        return sorted(self._adapters)

    def normalize(self, raw: Mapping[str, Any]) -> dict[str, Any]:
        adapter = self._adapters.get(str(raw.get("schema", "")))
        if adapter is None:
            raise ValidationError("unsupported_schema")
        return adapter.normalize(raw)

