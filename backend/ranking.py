from __future__ import annotations

from typing import Any, Callable, Sequence

from .ports import RankingStrategy


class KeyRanking:
    def __init__(self, key: str, value: Callable[[dict[str, Any]], Any], reverse: bool = False):
        self.key = key
        self._value = value
        self._reverse = reverse

    def sort(self, homes: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._reverse:
            return sorted(homes, key=lambda home: (-self._value(home), home["id"]))
        return sorted(homes, key=lambda home: (self._value(home), home["id"]))


class RankingRegistry:
    """Strategy registry for adding ranking algorithms independently of search."""

    def __init__(self, strategies: list[RankingStrategy] | None = None):
        items = strategies or [
            KeyRanking("recommended", lambda home: home["score"], reverse=True),
            KeyRanking("rent", lambda home: home["best"]["rent"]),
            KeyRanking("deposit", lambda home: home["best"]["deposit"]),
            KeyRanking("newest", lambda home: home["best"]["observedAt"], reverse=True),
            KeyRanking("metro", lambda home: home["metroMinutes"] if home["metroMinutes"] is not None else float("inf")),
        ]
        self._strategies = {strategy.key: strategy for strategy in items}

    @property
    def keys(self) -> list[str]:
        return sorted(self._strategies)

    def rank(self, key: str, homes: Sequence[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
        selected = key if key in self._strategies else "recommended"
        return selected, self._strategies[selected].sort(homes)

