"""Option chains: the normalised frame, OCC symbols, source normalisers and selection helpers
(docs/PHASE_B_CONTRACTS.md §1).

An `OptionChain` is one snapshot of an option root's quotes: a frame with one row per contract (CHAIN_COLUMNS),
the underlying's price and the New York time of the quotes. Two normalisers build it:

- `parse_cboe_chain` reads CBOE's delayed-quotes JSON, the primary source. CBOE stamps the file in UTC and each
  contract's `last_trade_time` in ET without a zone (checked 2026-09-29). A missing number is 0.0 there: a zero
  bid or ask means no quote, and a zero IV means CBOE did not model the contract, so its greeks are dropped too.
- `parse_yahoo_chain` reads yfinance `Ticker.option_chain(expiry)` frames, the fallback. Yahoo has no greeks.

The selection helpers pick expiries and strikes for the modules. `liquidity_check` is design v3.3 §4 "Option
liquidity" (track 17 R8), measured on a market-hours snapshot.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

CHAIN_COLUMNS = ["occ", "root", "right", "strike", "expiry", "bid", "ask", "mid", "iv", "delta", "gamma",
                 "theta", "vega", "open_interest", "volume", "last_trade_time"]
_OCC = re.compile(r"^(?P<root>[A-Z0-9.]{1,6}?)\s*(?P<yymmdd>\d{6})(?P<right>[CP])(?P<strike>\d{8})$")

NY_TZ = "America/New_York"
# Roots listed in another root's chain: CBOE's SPX file holds the PM-settled SPXW contracts too.
CHAIN_ROOTS = {"SPXW": "SPX"}
_NUMERIC = ["strike", "bid", "ask", "mid", "iv", "delta", "gamma", "theta", "vega", "open_interest", "volume"]
_GREEKS = ["delta", "gamma", "theta", "vega"]
YAHOO_MIN_IV = 1e-3            # Yahoo reports an IV near 1e-5 for a contract it could not model

# Design §4 "Option liquidity" (track 17 R8); `liquidity_check` falls back to these when the config omits a key.
LIQUIDITY_DEFAULTS = {"max_leg_spread_frac": 0.10, "min_open_interest": 500, "max_round_trip_frac": 0.10,
                      "max_round_trip_frac_high_gain": 0.20, "high_gain_cost_multiple": 2.0}


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


def chain_root(root: str) -> str:
    """The chain an option root is listed in, upper case: "SPXW" -> "SPX", "xsp" -> "XSP"."""
    r = str(root).strip().upper()
    return CHAIN_ROOTS.get(r, r)


# ----------------------------------------------------------------------------------------------------------
# Normalisers
# ----------------------------------------------------------------------------------------------------------

def _num(x: Any) -> float | None:
    """A finite float, or None."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _et_iso(stamp: Any, *, naive_tz: str) -> str:
    """A timestamp as "YYYY-MM-DDTHH:MM:SS" in New York time; a naive stamp is read in `naive_tz`."""
    ts = pd.Timestamp(stamp)
    if ts is pd.NaT:
        raise ValueError(f"not a timestamp: {stamp!r}")
    if ts.tzinfo is None:
        ts = ts.tz_localize(naive_tz)
    return ts.tz_convert(NY_TZ).strftime("%Y-%m-%dT%H:%M:%S")


def _occ_parts(symbols: pd.Series) -> pd.DataFrame:
    """Vectorised `parse_occ`: columns occ (canonical, unpadded), root, right, strike, expiry; NaN if unparsable."""
    s = symbols.astype(str).str.replace(r"\s+", "", regex=True).str.upper()
    m = s.str.extract(_OCC.pattern)
    y = m["yymmdd"]
    return pd.DataFrame({
        "occ": m["root"] + y + m["right"] + m["strike"],
        "root": m["root"],
        "right": m["right"],
        "strike": pd.to_numeric(m["strike"], errors="coerce") / 1000.0,
        "expiry": "20" + y.str[:2] + "-" + y.str[2:4] + "-" + y.str[4:],
    }, index=symbols.index)


def _column(raw: pd.DataFrame, name: str) -> pd.Series:
    """A numeric column of `raw`, or NaN when the payload lacks it."""
    if name not in raw.columns:
        return pd.Series(np.nan, index=raw.index, dtype=float)
    return pd.to_numeric(raw[name], errors="coerce").astype(float)


def _finish_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """CHAIN_COLUMNS in order: floats for numbers, mid from two-sided quotes, one row per contract, sorted.

    mid = (bid + ask) / 2 only when bid > 0, ask > 0 and the quote is not crossed (ask >= bid); else NaN.
    """
    out = frame.copy()
    for col in _NUMERIC:
        out[col] = pd.to_numeric(out[col], errors="coerce").astype(float) if col in out.columns else np.nan
    two_sided = (out["bid"] > 0) & (out["ask"] > 0) & (out["ask"] >= out["bid"])
    out["mid"] = ((out["bid"] + out["ask"]) / 2.0).where(two_sided)
    if "last_trade_time" not in out.columns:
        out["last_trade_time"] = None
    out = out.sort_values(["expiry", "right", "strike", "root"], kind="stable")
    out = out.drop_duplicates("occ", keep="last").reset_index(drop=True)
    return out[CHAIN_COLUMNS]


def parse_cboe_chain(payload: Any, underlying: str, *, raw_sha256: str | None = None) -> OptionChain:
    """CBOE delayed-quotes JSON (`.../delayed_quotes/options/{sym}.json`) -> OptionChain with source "cboe".

    - `asof`: the file's `timestamp`, which is UTC, in New York time. The quotes themselves lag it by about
      15 minutes (CBOE's delay).
    - `spot`: `data.current_price`.
    - Each `data.options[]` row's OCC symbol gives its root, expiry, right and strike. An SPX file holds SPX and
      SPXW contracts, and `root` keeps them apart.
    - A bid or ask of 0 means no quote, so mid is NaN. An IV of 0 means the contract was not modelled, so iv
      and the greeks are NaN.
    - Rows whose symbol does not parse are dropped.

    Raises ValueError for a payload without a timestamp, without a positive current_price, or without any
    parsable contract.
    """
    try:
        data = payload["data"]
        rows = data["options"]
        stamp = payload["timestamp"]
    except (KeyError, TypeError) as exc:
        raise ValueError(f"not a CBOE option-chain payload ({type(exc).__name__}: {exc})") from exc
    spot = _num(data.get("current_price"))
    if spot is None or spot <= 0:
        raise ValueError(f"CBOE payload has no positive current_price: {data.get('current_price')!r}")
    if not isinstance(rows, list) or not rows:
        raise ValueError("CBOE payload lists no contracts")
    asof = _et_iso(stamp, naive_tz="UTC")
    raw = pd.DataFrame.from_records([r for r in rows if isinstance(r, dict)])
    if "option" not in raw.columns:
        raise ValueError("CBOE payload rows have no 'option' symbol")
    parts = _occ_parts(raw["option"])
    ok = parts["root"].notna()
    if not ok.any():
        raise ValueError("no CBOE option symbol parses as OCC")
    raw, parts = raw[ok], parts[ok]
    iv = _column(raw, "iv")
    iv = iv.where(iv > 0)
    frame = parts.assign(bid=_column(raw, "bid"), ask=_column(raw, "ask"), iv=iv,
                         open_interest=_column(raw, "open_interest"), volume=_column(raw, "volume"))
    for greek in _GREEKS:
        frame[greek] = _column(raw, greek).where(iv.notna())
    ltt = raw["last_trade_time"] if "last_trade_time" in raw.columns else pd.Series(None, index=raw.index)
    frame["last_trade_time"] = [str(v) if isinstance(v, str) and v else None for v in ltt]
    return OptionChain(underlying=chain_root(underlying), asof=asof, spot=spot, source="cboe",
                       frame=_finish_frame(frame), raw_sha256=raw_sha256)


def parse_yahoo_chain(frames: list[pd.DataFrame], underlying: str, spot: float, asof: str, *,
                      raw_sha256: str | None = None) -> OptionChain:
    """yfinance `Ticker.option_chain(expiry)` frames (calls and puts, any expiries) -> OptionChain, source "yahoo".

    - Columns read: contractSymbol, bid, ask, impliedVolatility, openInterest, volume and lastTradeDate (UTC).
    - Yahoo has no greeks. delta, gamma, theta and vega are NaN, so `strike_by_delta` finds nothing on a
      Yahoo chain.
    - An IV under 0.1% is Yahoo's "not modelled" placeholder and becomes NaN.
    - `asof` is the time the frames were fetched, "YYYY-MM-DDTHH:MM:SS" in ET.
    - `raw_sha256` defaults to the SHA-256 of the frames' CSV.

    Raises ValueError when the spot is not positive or no contract symbol parses.
    """
    price = _num(spot)
    if price is None or price <= 0:
        raise ValueError(f"no positive underlying price for {underlying}: {spot!r}")
    usable = [f for f in frames if isinstance(f, pd.DataFrame) and len(f) and "contractSymbol" in f.columns]
    if not usable:
        raise ValueError(f"no Yahoo option rows for {underlying}")
    raw = pd.concat(usable, ignore_index=True)
    if raw_sha256 is None:
        raw_sha256 = hashlib.sha256(raw.to_csv(index=False).encode("utf-8")).hexdigest()
    parts = _occ_parts(raw["contractSymbol"])
    ok = parts["root"].notna()
    if not ok.any():
        raise ValueError(f"no Yahoo contract symbol for {underlying} parses as OCC")
    raw, parts = raw[ok], parts[ok]
    iv = _column(raw, "impliedVolatility")
    frame = parts.assign(bid=_column(raw, "bid"), ask=_column(raw, "ask"), iv=iv.where(iv >= YAHOO_MIN_IV),
                         open_interest=_column(raw, "openInterest"), volume=_column(raw, "volume"))
    for greek in _GREEKS:
        frame[greek] = np.nan
    stamps = raw["lastTradeDate"] if "lastTradeDate" in raw.columns else pd.Series(None, index=raw.index)
    frame["last_trade_time"] = [None if v is None or pd.isna(v) else _et_iso(v, naive_tz="UTC") for v in stamps]
    return OptionChain(underlying=chain_root(underlying), asof=str(asof), spot=price, source="yahoo",
                       frame=_finish_frame(frame), raw_sha256=raw_sha256)


# ----------------------------------------------------------------------------------------------------------
# Selection helpers (the modules' rules pick the dates and targets; these only find listed contracts)
# ----------------------------------------------------------------------------------------------------------

def _day(value: Any) -> str:
    return pd.Timestamp(value).strftime("%Y-%m-%d")


def expiry_on_or_before(chain: OptionChain, limit: str, *, earliest: str | None = None) -> str | None:
    """The latest listed expiry <= `limit` (and >= `earliest`), or None."""
    hi, lo = _day(limit), (_day(earliest) if earliest is not None else None)
    found = [e for e in chain.expiries() if e <= hi and (lo is None or e >= lo)]
    return found[-1] if found else None


def expiries_between(chain: OptionChain, start: str, end: str) -> list[str]:
    """Listed expiries from `start` to `end`, both included, in date order."""
    lo, hi = _day(start), _day(end)
    return [e for e in chain.expiries() if lo <= e <= hi]


def _rows(chain: OptionChain, expiry: str, right: str, root: str | None) -> pd.DataFrame:
    rows = chain.select(right.upper(), _day(expiry))
    return rows if root is None else rows[rows["root"] == root.upper()]


def strike_nearest(chain: OptionChain, expiry: str, right: str, target: float, *,
                   root: str | None = None) -> float | None:
    """The listed strike nearest `target` for (expiry, right), or None; a tie goes to the lower strike.

    `root` keeps one OCC root, e.g. "SPXW" on a third Friday, when SPX and SPXW both list the date.
    """
    goal = _num(target)
    strikes = np.unique(_rows(chain, expiry, right, root)["strike"].dropna().to_numpy(dtype=float))
    if goal is None or not len(strikes):
        return None
    return float(strikes[int(np.argmin(np.abs(strikes - goal)))])


def strike_by_delta(chain: OptionChain, expiry: str, right: str, target_delta: float, *,
                    root: str | None = None) -> float | None:
    """The strike whose |delta| is nearest |target_delta| for (expiry, right), or None.

    The sign of `target_delta` does not matter (put deltas are negative in CBOE's data). Only rows with a
    modelled, non-zero delta count, so a Yahoo chain returns None. On a tie, the smaller |delta| wins, which is
    the strike further out of the money.
    """
    goal = _num(target_delta)
    rows = _rows(chain, expiry, right, root)
    rows = rows[rows["delta"].notna() & (rows["delta"] != 0)]
    if goal is None or rows.empty:
        return None
    size = rows["delta"].abs()
    order = pd.DataFrame({"gap": (size - abs(goal)).abs(), "size": size, "strike": rows["strike"]})
    best = order.sort_values(["gap", "size", "strike"], kind="stable").iloc[0]
    return float(best["strike"])


def liquidity_check(chain: OptionChain, legs: list[dict], cfg_liquidity: dict, *,
                    expected_gain: float | None = None) -> dict[str, Any]:
    """Design v3.3 §4 "Option liquidity" (track 17 R8) on this snapshot. Use a market-hours chain.

    - Each leg needs a two-sided quote, (ask - bid) <= max_leg_spread_frac (10%) of its mid, and open
      interest >= min_open_interest (500). A missing open interest fails.
    - The structure's round trip is its natural width, Σ(ask - bid), as a fraction of |combo mid|. That is
      track 17's definition: pay half the width to enter and half to exit. It must be <= max_round_trip_frac
      (10%). The limit is max_round_trip_frac_high_gain (20%) when `expected_gain` >= high_gain_cost_multiple
      (2) x the round-trip cost.
    - `expected_gain` is per share of the combo, in the same units as the debit.
    - A credit structure (short legs worth more) is measured against its credit, |combo mid|.

    Missing config keys fall back to LIQUIDITY_DEFAULTS.

    Returns {"ok", "reasons", "per_leg", "round_trip_frac", "round_trip_cap", "combo_mid", "natural_width"}.
    per_leg is [{"occ", "position", "bid", "ask", "mid", "spread_frac", "open_interest", "ok"}].
    """
    cfg = {**LIQUIDITY_DEFAULTS, **(cfg_liquidity or {})}
    max_leg, min_oi = float(cfg["max_leg_spread_frac"]), float(cfg["min_open_interest"])
    reasons: list[str] = []
    per_leg: list[dict[str, Any]] = []
    combo_mid, width, complete = 0.0, 0.0, bool(legs)
    for leg in legs:
        occ = str(leg.get("occ"))
        q = chain.quote(occ) or {}
        bid, ask, oi = _num(q.get("bid")), _num(q.get("ask")), _num(q.get("open_interest"))
        entry = {"occ": occ, "position": leg.get("position"), "bid": bid, "ask": ask, "mid": None,
                 "spread_frac": None, "open_interest": oi, "ok": False}
        per_leg.append(entry)
        if not q:
            reasons.append(f"{occ}: not listed in the {chain.underlying} chain")
            complete = False
            continue
        if bid is None or ask is None or bid <= 0 or ask <= 0 or ask < bid:
            reasons.append(f"{occ}: no two-sided quote (bid {bid}, ask {ask})")
            complete = False
        else:
            mid = (bid + ask) / 2.0
            entry["mid"], entry["spread_frac"] = mid, (ask - bid) / mid
            if entry["spread_frac"] > max_leg + 1e-12:
                reasons.append(f"{occ}: bid-ask {entry['spread_frac']:.1%} of mid is above {max_leg:.0%}")
            combo_mid += (1.0 if leg.get("position") == "long" else -1.0) * mid
            width += ask - bid
        if oi is None or oi < min_oi:
            shown = f"{oi:,.0f}" if oi is not None else "unknown"
            reasons.append(f"{occ}: open interest {shown} is below {min_oi:,.0f}")
        entry["ok"] = entry["spread_frac"] is not None and entry["spread_frac"] <= max_leg + 1e-12 \
            and oi is not None and oi >= min_oi
    high_gain = (expected_gain is not None and _num(expected_gain) is not None and width > 0
                 and float(expected_gain) >= float(cfg["high_gain_cost_multiple"]) * width)
    cap = float(cfg["max_round_trip_frac_high_gain"] if high_gain else cfg["max_round_trip_frac"])
    round_trip = width / abs(combo_mid) if complete and abs(combo_mid) > 1e-12 else None
    if complete and round_trip is None:
        reasons.append("the structure's mid is zero: no round-trip measure")
    elif round_trip is not None and round_trip > cap + 1e-12:
        reasons.append(f"round trip {round_trip:.1%} of the debit is above {cap:.0%}")
    return {"ok": not reasons, "reasons": reasons, "per_leg": per_leg, "round_trip_frac": round_trip,
            "round_trip_cap": cap, "combo_mid": combo_mid if complete else None,
            "natural_width": width if complete else None}
