from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from .adapters import normalize_text
from .ports import ValidationError


PROVIDERS = {
    "jabama": {"name": "جاباما"},
    "otaghak": {"name": "اتاقک"},
    "jajiga": {"name": "جاجیگا"},
}


def _iso_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_trip:date") from error
    if parsed.isoformat() != value:
        raise ValidationError("invalid_trip:date")
    return parsed


def validate_trip(values: Mapping[str, Any], now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    today = current.astimezone(ZoneInfo("Asia/Tehran")).date()
    checkin = _iso_date(str(values.get("checkin") or today + timedelta(days=2)))
    checkout = _iso_date(str(values.get("checkout") or checkin + timedelta(days=2)))
    nights = (checkout - checkin).days
    if checkin < today or checkin > today + timedelta(days=365) or not 1 <= nights <= 30:
        raise ValidationError("invalid_trip:range")
    try:
        adults = int(values.get("adults", 4))
        if str(values.get("adults", adults)).strip() not in (str(adults), f"{adults}.0"):
            raise ValueError
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_trip:adults") from error
    if not 1 <= adults <= 16:
        raise ValidationError("invalid_trip:adults")
    raw_children = values.get("children", [])
    if isinstance(raw_children, list):
        children = raw_children
    elif raw_children:
        children = str(raw_children).split(",")
    else:
        children = []
    try:
        child_ages = sorted(int(value) for value in children)
    except (TypeError, ValueError) as error:
        raise ValidationError("invalid_trip:children") from error
    if len(child_ages) > 6 or any(age < 0 or age > 17 for age in child_ages):
        raise ValidationError("invalid_trip:children")
    return {
        "checkin": checkin.isoformat(), "checkout": checkout.isoformat(), "adults": adults,
        "children": child_ages, "guests": adults + len(child_ages), "nights": nights,
    }


def _timestamp(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def quote_for_trip(quote: Any, listing: Mapping[str, Any], trip: Mapping[str, Any], now: datetime) -> dict[str, Any] | None:
    if not isinstance(quote, dict) or not isinstance(quote.get("children"), list) or not isinstance(quote.get("nightlyRates"), list):
        return None
    observed, expires = _timestamp(quote.get("observedAt")), _timestamp(quote.get("expiresAt"))
    exact = (
        quote.get("listingId") == listing["id"]
        and quote.get("provider") == listing["provider"]
        and quote.get("checkin") == trip["checkin"]
        and quote.get("checkout") == trip["checkout"]
        and quote.get("adults") == trip["adults"]
        and sorted(quote.get("children", [])) == trip["children"]
        and quote.get("currency") == "toman"
        and quote.get("availability") == "available"
        and quote.get("feesComplete") is True
        and observed is not None and expires is not None and observed <= now < expires
    )
    if not exact or len(quote["nightlyRates"]) != trip["nights"]:
        return None
    numbers = [quote.get("mandatoryFees"), quote.get("extraGuestTotal"), quote.get("discountTotal"), *quote["nightlyRates"]]
    if any(not isinstance(number, int) or isinstance(number, bool) or number < 0 for number in numbers):
        return None
    total = sum(quote["nightlyRates"]) + quote["mandatoryFees"] + quote["extraGuestTotal"] - quote["discountTotal"]
    return {**quote, "total": total} if 0 < total < 2**53 else None


class TravelSearchService:
    def search(self, catalog: Mapping[str, Any], values: Mapping[str, Any], now: datetime | None = None) -> dict[str, Any]:
        current = now or datetime.now(timezone.utc)
        trip = validate_trip(values, current)
        query = normalize_text(values.get("q", ""))
        if len(query) > 200:
            raise ValidationError("invalid_trip:query")
        requested = str(values.get("providers") or ",".join(PROVIDERS)).split(",")
        providers = list(dict.fromkeys(requested))
        if any(provider not in PROVIDERS for provider in providers):
            raise ValidationError("invalid_trip:providers")
        city = str(values.get("city") or "all")
        kind = str(values.get("type") or "all")
        if kind not in ("all", "villa", "cottage", "apartment", "suite"):
            raise ValidationError("invalid_trip:type")
        max_nightly = self._budget(values.get("maxNightly"))
        max_total = self._budget(values.get("maxTotal"))
        sort = str(values.get("sort")) if values.get("sort") in ("recommended", "price", "price-desc", "newest") else "recommended"
        quote_by_id = {quote.get("listingId"): quote for quote in catalog.get("quotes", [])}
        results: list[dict[str, Any]] = []
        for source in catalog.get("listings", []):
            if source.get("provider") not in providers or (city != "all" and source.get("city") != city) or (kind != "all" and source.get("type") != kind):
                continue
            if query and query not in normalize_text(f"{source.get('title', '')} {source.get('city', '')}"):
                continue
            capacity = source.get("capacity")
            if capacity is not None and capacity < trip["guests"]:
                continue
            if str(values.get("knownCapacity", "false")).lower() == "true" and capacity is None:
                continue
            if max_nightly is not None and source.get("startingPrice", 0) > max_nightly:
                continue
            listing = dict(source)
            quote = quote_for_trip(quote_by_id.get(listing["id"]), listing, trip, current)
            if str(values.get("confirmedOnly", "false")).lower() == "true" and quote is None:
                continue
            if max_total is not None and (quote is None or quote["total"] > max_total):
                continue
            observed = _timestamp(listing.get("observedAt"))
            age_hours = max(0, (current - observed).total_seconds() / 3600) if observed else 0
            listing.update(
                quote=quote,
                priceStatus="confirmed" if quote else "starting_only",
                capacityStatus="unknown" if capacity is None else "fits",
                catalogAgeHours=age_hours,
                stale=bool(observed and current - observed > timedelta(days=1)),
                needsConfirmation=["موجودی در تاریخ سفر", "هزینهٔ نفر اضافه و کارمزدها", "قوانین لغو رزرو"],
                reasons=[
                    f"ظرفیت اعلام‌شده تا {capacity} نفر" if capacity is not None else "ظرفیت در دادهٔ عمومی مشخص نیست",
                    f"قیمت پایه از {PROVIDERS[listing['provider']]['name']}",
                ],
            )
            results.append(listing)
        if sort in ("price", "price-desc"):
            results.sort(key=lambda listing: (listing["startingPrice"], listing["id"]), reverse=sort == "price-desc")
        elif sort == "newest":
            results.sort(key=lambda listing: (listing.get("observedAt", ""), listing["id"]), reverse=True)
        else:
            bins = {provider: sorted((listing for listing in results if listing["provider"] == provider), key=lambda listing: listing["startingPrice"]) for provider in providers}
            results = []
            index = 0
            while any(index < len(group) for group in bins.values()):
                for provider in providers:
                    if index < len(bins[provider]):
                        results.append(bins[provider][index])
                index += 1
        cities = sorted({listing.get("city") for listing in catalog.get("listings", []) if listing.get("city")})
        return {
            "trip": trip, "results": results, "total": len(results), "sort": sort, "city": city,
            "providerStatus": catalog.get("providers", []), "updatedAt": catalog.get("updatedAt"),
            "coverage": "selected_public_catalog", "confirmedCount": sum(bool(item["quote"]) for item in results),
            "cities": cities,
            "filters": {"providers": providers, "city": city, "type": kind, "maxNightly": max_nightly, "maxTotal": max_total, "q": query},
        }

    @staticmethod
    def _budget(value: Any) -> int | float | None:
        if value in (None, ""):
            return None
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            raise ValidationError("invalid_trip:budget") from error
        if not 0 <= number <= 10_000_000_000:
            raise ValidationError("invalid_trip:budget")
        return int(number) if number.is_integer() else number

