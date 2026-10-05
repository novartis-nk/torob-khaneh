from __future__ import annotations

import hashlib
import math
import re
import time
from typing import Any, Mapping

from .adapters import DISTRICTS, digits, normalize_text
from .ports import ValidationError
from .ranking import RankingRegistry


STALE_HOURS = 72


def _same_home(first: Mapping[str, Any], second: Mapping[str, Any]) -> bool:
    return bool(
        first.get("imageFingerprint")
        and first.get("addressKey")
        and first["imageFingerprint"] == second.get("imageFingerprint")
        and first["addressKey"] == second.get("addressKey")
        and first["district"] == second.get("district")
        and first["area"] == second.get("area")
        and first["bedrooms"] == second.get("bedrooms")
        and first["floor"] == second.get("floor")
        and abs(first["lat"] - second.get("lat", 0)) < 0.0005
        and abs(first["lng"] - second.get("lng", 0)) < 0.0005
        and first["parking"] == second.get("parking")
        and first["elevator"] == second.get("elevator")
    )


def cluster_offers(offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[list[dict[str, Any]]] = []
    for offer in sorted(offers, key=lambda item: item["id"]):
        group = next((candidate for candidate in groups if all(_same_home(other, offer) for other in candidate)), None)
        if group is None:
            groups.append([offer])
        else:
            group.append(offer)
    homes: list[dict[str, Any]] = []
    for group in groups:
        ordered = sorted(group, key=lambda item: (-item["observedAt"], item["id"]))
        canonical = ordered[0]
        identity = "|".join(
            str(value)
            for value in (
                canonical["district"],
                canonical.get("addressKey") or canonical["id"],
                canonical["area"],
                canonical["bedrooms"],
                canonical["floor"],
                canonical.get("imageFingerprint", ""),
            )
        )
        home = dict(canonical)
        home.update(
            {
                "id": hashlib.sha256(identity.encode()).hexdigest()[:12],
                "offers": ordered,
                "matchEvidence": [
                    "اثر تصویر یکسان در دادهٔ نمونه",
                    "نشانی، متراژ، اتاق و طبقه یکسان",
                    "مختصات نزدیک و امکانات سازگار",
                ]
                if len(group) > 1
                else [],
            }
        )
        homes.append(home)
    return homes


NUMBER_WORDS = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4}


def parse_intent(value: str = "") -> dict[str, Any]:
    query = normalize_text(value)
    query = re.sub(r"sadeghiyeh|sadeghie", "صادقیه", query)
    query = query.replace("satarkhan", "ستارخان").replace("poonak", "پونک").replace("ponak", "پونک")
    filters: dict[str, Any] = {}
    chips: list[dict[str, Any]] = []
    warnings: list[str] = []
    districts = [district for district in DISTRICTS if district in query]
    if districts:
        filters["districts"] = districts
        chips.append({"key": "districts", "label": " یا ".join(districts)})
    match = re.search(r"(\d+|یک|دو|سه|چهار)\s*خواب", query)
    if match:
        bedrooms = NUMBER_WORDS.get(match.group(1), int(match.group(1)) if match.group(1).isdigit() else 0)
        filters["bedrooms"] = bedrooms
        chips.append({"key": "bedrooms", "label": f"{bedrooms} خواب و بیشتر"})
    for key, term in (("maxDeposit", r"(?:رهن|ودیعه)"), ("maxRent", "اجاره")):
        match = re.search(rf"{term}\s*(?:حداکثر|حد اکثر|تا|زیر|کمتر از)?\s*(\d+(?:[.٫]\d+)?)\s*(میلیون|میلیارد)?", query)
        if match:
            amount = float(match.group(1).replace("٫", ".")) * (1000 if match.group(2) == "میلیارد" else 1)
            amount = int(amount) if amount.is_integer() else amount
            filters[key] = amount
            chips.append({"key": key, "label": f"{'اجاره' if key == 'maxRent' else 'ودیعه'} تا {amount} میلیون"})
            if not match.group(2):
                warnings.append("عدد بودجه بدون واحد را میلیون تومان در نظر گرفتیم؛ فیلتر را بررسی کنید.")
    if "رهن کامل" in query:
        filters["maxRent"] = 0
        chips.append({"key": "maxRent", "label": "رهن کامل"})
    match = re.search(r"(?:حداقل|بالای|بیشتر از)\s*(\d+)\s*متر", query)
    if match:
        filters["minArea"] = int(match.group(1))
        chips.append({"key": "minArea", "label": f"حداقل {match.group(1)} متر"})
    if re.search(r"(?:نزدیک|کنار)\s*(?:به\s*)?مترو", query):
        filters["maxMetro"] = 12
        chips.append({"key": "maxMetro", "label": "تا ۱۲ دقیقه پیاده تا مترو"})
    for key, word in (("parking", "پارکینگ"), ("elevator", "آسانسور"), ("balcony", "بالکن")):
        if word in query and not re.search(rf"(?:بدون|بی)\s*{word}|{word}\s*(?:نمی ?خواهم|نمی ?خوام|مهم نیست)", query):
            filters[key] = True
            chips.append({"key": key, "label": word})
    unsupported = ["ویلایی", "ویلا", "خرید", "فروش", "حیاط", "حیوان", "مدرسه", "محل کار", "نوساز", "آرام", "ساکت", "نورگیر", "لوکس", "مبله"]
    terms = [term for term in unsupported if term in query]
    if terms:
        warnings.append(f"این ویژگی‌ها هنوز قابل بررسی نیستند: {'، '.join(terms)}. در نتایج اعمال نشده‌اند.")
    if query and not chips:
        warnings.append("از این عبارت فیلتر قابل اتکایی استخراج نشد. محله، بودجه یا امکانات را مشخص کنید.")
    return {"filters": filters, "chips": chips, "warnings": warnings, "engine": "rules-v1", "query": value}


def validate_filters(values: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    bounds = {
        "maxDeposit": (0, 100000), "maxRent": (0, 10000), "minArea": (0, 1000),
        "bedrooms": (0, 10), "maxMetro": (0, 180), "rate": (0, 5),
    }
    for key, (minimum, maximum) in bounds.items():
        if key in values and values[key] not in (None, ""):
            try:
                number = float(digits(values[key]))
            except (TypeError, ValueError) as error:
                raise ValidationError(f"invalid_filter:{key}") from error
            if not math.isfinite(number) or not minimum <= number <= maximum:
                raise ValidationError(f"invalid_filter:{key}")
            result[key] = int(number) if number.is_integer() else number
    for key in ("parking", "elevator", "balcony"):
        if key in values:
            if values[key] not in (True, False, "true", "false"):
                raise ValidationError(f"invalid_filter:{key}")
            if values[key] in (True, "true"):
                result[key] = True
    if values.get("districts"):
        raw = values["districts"]
        districts = raw if isinstance(raw, list) else str(raw).split(",")
        if any(district not in DISTRICTS for district in districts):
            raise ValidationError("invalid_filter:districts")
        result["districts"] = districts
    return result


def _round(value: float) -> int:
    return math.floor(value + 0.5)


class HousingSearchService:
    def __init__(self, rankings: RankingRegistry | None = None):
        self.rankings = rankings or RankingRegistry()

    def search(self, homes: list[dict[str, Any]], values: Mapping[str, Any], now_ms: int | None = None) -> dict[str, Any]:
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        intent = parse_intent(str(values.get("q", "")))
        filters = {**intent["filters"], **validate_filters(values)}
        rate = filters.get("rate", 1)
        results: list[dict[str, Any]] = []
        stale_excluded = 0

        def effective(offer: Mapping[str, Any]) -> float:
            return offer["rent"] + offer["deposit"] * rate / 100

        def fresh(offer: Mapping[str, Any]) -> bool:
            return now - offer["observedAt"] <= STALE_HOURS * 3_600_000

        for source_home in homes:
            home = dict(source_home)
            if filters.get("districts") and home["district"] not in filters["districts"]:
                continue
            if "bedrooms" in filters and home["bedrooms"] < filters["bedrooms"]:
                continue
            if "minArea" in filters and home["area"] < filters["minArea"]:
                continue
            if "maxMetro" in filters and (home["metroMinutes"] is None or home["metroMinutes"] > filters["maxMetro"]):
                continue
            if any(filters.get(key) and home.get(key) is not True for key in ("parking", "elevator", "balcony")):
                continue
            fresh_offers = [offer for offer in home["offers"] if fresh(offer)]
            stale_excluded += len(home["offers"]) - len(fresh_offers)
            eligible = [
                offer for offer in fresh_offers
                if ("maxDeposit" not in filters or offer["deposit"] <= filters["maxDeposit"] * 1_000_000)
                and ("maxRent" not in filters or offer["rent"] <= filters["maxRent"] * 1_000_000)
            ]
            if not eligible:
                continue
            eligible.sort(key=lambda offer: (effective(offer), -offer["observedAt"], offer["id"]))
            best = eligible[0]
            price = effective(best)
            components = {
                "cost": _round(45 / (1 + price / 25_000_000)),
                "metro": 0 if home["metroMinutes"] is None else _round(25 * max(0, 1 - home["metroMinutes"] / 35)),
                "freshness": _round(20 * max(0, 1 - (now - best["observedAt"]) / (STALE_HOURS * 3_600_000))),
                "completeness": len([value for value in (home.get("parking"), home.get("elevator"), home.get("balcony"), home.get("metroMinutes")) if value is not None]) * 2.5,
            }
            reasons: list[str] = []
            if "maxDeposit" in filters or "maxRent" in filters:
                reasons.append("ودیعه و اجارهٔ یک پیشنهاد، هر دو در بودجهٔ شما")
            if home["metroMinutes"] is not None:
                reasons.append(f"{home['metroMinutes']} دقیقه پیاده تا متروی {home['metroName']}")
            if home.get("parking"):
                reasons.append("پارکینگ دارد")
            if not reasons:
                reasons.append("پیشنهاد تازه با اطلاعات قابل مقایسه")
            cautions: list[str] = []
            if not home.get("elevator") and home["floor"] > 1:
                state = "وضعیت آسانسور نامشخص" if home.get("elevator") is None else "بدون آسانسور"
                cautions.append(f"طبقهٔ {home['floor']}، {state}")
            if any(not fresh(offer) for offer in home["offers"]):
                cautions.append("پیشنهاد قدیمی از محاسبه کنار گذاشته شده")
            if any(offer["rent"] != best["rent"] or offer["deposit"] != best["deposit"] for offer in home["offers"]):
                cautions.append("مبالغ منابع متفاوت است؛ پیش از تصمیم تأیید کنید")
            if home["metroMinutes"] is None:
                cautions.append("فاصله تا مترو مشخص نیست")
            home.update(
                offers=[{**offer, "stale": not fresh(offer), "eligible": any(item["id"] == offer["id"] for item in eligible), "effective": effective(offer)} for offer in home["offers"]],
                best=best,
                effective=price,
                score=sum(components.values()),
                components=components,
                reasons=reasons[:3],
                cautions=cautions,
                freshOfferCount=len(fresh_offers),
            )
            results.append(home)
        sort, ranked = self.rankings.rank(str(values.get("sort", "recommended")), results)
        return {
            "results": ranked, "intent": intent, "filters": filters, "sort": sort,
            "staleExcluded": stale_excluded, "total": len(ranked), "sample": True,
            "rate": rate, "rankingAlgorithm": f"{sort}-v1",
        }

