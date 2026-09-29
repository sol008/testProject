"""Option chains: the normalised frame, OCC symbols and selection helpers (docs/PHASE_B_CONTRACTS.md §1).

Skeleton: the dataclass and OCC helpers are final; the options build adds the CBOE/Yahoo normalisers,
the selection helpers and the liquidity check.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import pandas as pd

CHAIN_COLUMNS = ["occ", "root", "right", "strike", "expiry", "bid", "ask", "mid", "iv", "delta", "gamma",
                 "theta", "vega", "open_interest", "volume", "last_trade_time"]
_OCC = re.compile(r"^(?P<root>[A-Z0-9.]{1,6}?)\s*(?P<yymmdd>\d{6})(?P<right>[CP])(?P<strike>\d{8})$")


@dataclass
class OptionChain:
    """One snapshot of an option root's quotes (a row per contract, CHAIN_COLUMNS)."""

    underlying: str
    asof: str
    spot: float
    source: str
    frame: pd.DataFrame
    raw_sha256: str | None = None

    def expiries(self) -> list[str]:
        return sorted({str(e) for e in self.frame["expiry"].dropna()})

    def quote(self, occ: str) -> dict[str, Any] | None:
        rows = self.frame[self.frame["occ"] == occ]
        return None if rows.empty else rows.iloc[0].to_dict()

    def select(self, right: str, expiry: str) -> pd.DataFrame:
        f = self.frame
        return f[(f["right"] == right) & (f["expiry"] == expiry)].sort_values("strike")


def parse_occ(occ: str) -> dict[str, Any]:
    """"XSP261218C00770000" -> {"root": "XSP", "expiry": "2026-12-18", "right": "C", "strike": 770.0}."""
    m = _OCC.match(str(occ).strip().upper())
    if not m:
        raise ValueError(f"not an OCC option symbol: {occ!r}")
    y = m["yymmdd"]
    return {"root": m["root"], "expiry": f"20{y[:2]}-{y[2:4]}-{y[4:]}", "right": m["right"],
            "strike": int(m["strike"]) / 1000.0}


def occ_symbol(root: str, expiry: str, right: str, strike: float) -> str:
    """The OCC symbol without padding: occ_symbol("XSP", "2026-12-18", "C", 770) -> "XSP261218C00770000"."""
    ymd = expiry.replace("-", "")[2:]
    return f"{root.upper()}{ymd}{right.upper()}{int(round(float(strike) * 1000)):08d}"
