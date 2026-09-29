"""G3, the gems satellite (design v4 §3 G3, §4 single names; track 35 §3.3 and §6; Phase C4a): offline, synthetic.

The pure rules (`traderec.modules.g3_gems`) on a synthetic discount series; the daily runner
(`traderec.runners.g3`) inside the real daily run on test_growth's market plus synthetic closed-end funds (a price
series and its NAV series `X<ticker>X`) and a synthetic crypto trust; a `live` rule's Sunday orders out of the
reserve, the Gems lines of the Sunday email and their validation; the quarterly review's promotion tests.
"""
from __future__ import annotations

import copy
import dataclasses
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from test_growth import LAUNCH, GrowthProvider, Recorder, btc_on, cfg_for, frame, market, ramp_index, trading_days

from traderec import growth, pipeline, reports
from traderec.data.edgar import EdgarAccessDenied
from traderec.emails import render_quarterly
from traderec.growth import orders as orders_mod
from traderec.growth.email import render_growth, slot_specs
from traderec.ledger import Ledger
from traderec.modules import g3_gems as G
from traderec.runners import g3 as R
from traderec.validator import validate

CEF_RULE = {"status": "shadow", "slots": 2, "slot_weight": 0.05, "z": 2.5, "lookback": 252, "hold_days": 60,
            "leverage_max": 0.35, "price_min": 5, "adv_min_usd": 1_000_000, "crash_mode_triggers": 10, "crash_mode_weeks": 3,
            "min_observations": 200, "nav_symbol": "X{ticker}X", "promotion": {"min_trades": 30, "min_mean_excess": 0.015}}
TRUST_RULE = {"status": "shadow", "weight": 0.05, "discount_le": -0.25, "closes": 5, "catalyst_days": 120,
              "exit_discount_ge": -0.03, "exit_closes": 3, "promotion": {"min_episodes": 3, "min_mean_excess": 0.10,
                                                                          "max_widening": 0.15}}
META = {"leverage": 0.20, "as_of": "2026-09-01", "source": "test"}
FILING = {"form": "S-1", "filed": "2026-06-15", "cik": 1761325, "url": "https://www.sec.gov/x", "withdrawn": False}
NAV = 10.0


# ------------------------------------------------------------------------------------------- synthetic funds
def discount_series(days: pd.DatetimeIndex, episodes: dict[str, float] | None = None, *, base: float = -0.05,
                    spread: float = 0.008, seed: int = 7) -> pd.Series:
    """A discount history: `base` plus seeded uniform noise within +-`spread` (a standard deviation of about 0.46 points,
    so no print of the noise alone is ever 2.5 sd from the mean), with the prints of `episodes` ({date: discount}) set."""
    rng = np.random.default_rng(seed)
    disc = pd.Series(rng.uniform(base - spread, base + spread, len(days)), index=days)
    for day, value in (episodes or {}).items():
        disc.loc[pd.Timestamp(day)] = value
    return disc


def wide_between(days: pd.DatetimeIndex, start: str, end: str, value: float) -> dict[str, float]:
    return {d.strftime("%Y-%m-%d"): value for d in days if pd.Timestamp(start) <= d <= pd.Timestamp(end)}


def cef_frames(disc: pd.Series, nav: float = NAV, volume: float = 1e6) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(price bars, NAV bars) for a discount history at a flat NAV."""
    bars = frame(nav * (1.0 + disc))
    bars["volume"] = volume
    nav_bars = frame(pd.Series(nav, index=disc.index))
    return bars, nav_bars


def stats_before(disc: pd.Series, date: str) -> tuple[float, float]:
    s = G.discount_stats(disc.loc[: pd.Timestamp(date)].iloc[:-1])
    return float(s["mean"].iloc[-1]), float(s["sd"].iloc[-1])


def g3_cfg(base, *, cef: dict | None = None, trust: dict | None = None):
    """cfg_for() with the G3 rules replaced by `cef` / `trust` (None keeps the production block)."""
    const = copy.deepcopy(base.constitution)
    rules = const["growth"]["sleeves"]["G3"]["rules"]
    if cef is not None:
        rules["cef_crash_discount"] = cef
    if trust is not None:
        rules["crypto_trust_discount"] = trust
    return dataclasses.replace(base, constitution=const)


def whitelisted(cfg, *tickers: str):
    wl = copy.deepcopy(cfg.whitelist)
    for t in tickers:
        wl.setdefault("robinhood", {})[t] = {"fractional": True, "options": False}
    return dataclasses.replace(cfg, whitelist=wl)


def state_of(state_dir: Path) -> dict:
    return json.loads((state_dir / "state.json").read_text())


def records(state_dir: Path, kind: str | None = None) -> list[dict]:
    recs = [json.loads(line) for line in (state_dir / "ledger.jsonl").read_text().splitlines()]
    return [r for r in recs if kind is None or r["record_type"] == kind]


def g3_records(state_dir: Path, rule: str, event: str | None = None) -> list[dict]:
    out = [r["payload"] for r in records(state_dir, "g3_shadow") if r["payload"].get("rule") == rule]
    return [p for p in out if event is None or p.get("event") == event]


def run_days(cfg, provider, state_dir: Path, rec: Recorder, start: str, end: str) -> None:
    for day in pd.date_range(start, end, freq="D"):
        d = day.strftime("%Y-%m-%d")
        if day.weekday() < 5:
            res = pipeline.run_daily(cfg, provider, state_dir, date=d, services=rec.services())
        elif day.weekday() == 6:
            res = pipeline.run_weekly(cfg, provider, state_dir, date=d, services=rec.services())
        else:
            continue
        assert res.status in ("ok", "no_session"), res.summary()


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[─-╿]", " ", text))


# ==================================================================================== 1. the z-score trigger
def test_discount_cleaning_matches_the_reference_script():
    days = trading_days("2026-01-02", "2026-02-27")
    price = pd.Series(9.5, index=days)
    nav = pd.Series(10.0, index=days)
    nav.iloc[3:6] = np.nan                       # a three-session gap is carried forward ...
    nav.iloc[10:15] = np.nan                     # ... a five-session gap leaves the fourth and fifth sessions out
    nav.iloc[20] = -1.0                          # a non-positive print is dropped (then carried)
    price.iloc[25] = 20.0                        # a discount of +100% is a bad print
    disc = G.cef_discount(price, nav)
    assert len(disc) == len(days) - 2 and days[13] not in disc.index and days[14] not in disc.index
    assert disc.loc[days[4]] == pytest.approx(-0.05) and disc.loc[days[20]] == pytest.approx(-0.05)
    assert np.isnan(disc.loc[days[25]])
    stats = G.discount_stats(disc, 252, 200)
    assert stats["z"].isna().all()               # fewer than 200 observations: no z at all


def test_an_episode_at_minus_three_sd_triggers_once_and_a_dip_at_minus_2_4_does_not():
    days = trading_days("2025-06-02", "2026-10-30")
    disc = discount_series(days)
    mean, sd = stats_before(disc, "2026-09-29")
    disc.loc[pd.Timestamp("2026-09-29")] = mean - 3.0 * sd
    mean2, sd2 = stats_before(disc, "2026-09-15")
    disc.loc[pd.Timestamp("2026-09-15")] = mean2 - 2.4 * sd2
    bars, nav = cef_frames(disc)
    hit = G.cef_crash_check(bars, nav, "2026-09-29", CEF_RULE, META)
    assert hit["trigger"] is True and -3.4 < hit["z"] < -2.7 and hit["price"] == pytest.approx(NAV * (1 + hit["discount"]))
    assert hit["adv_usd"] > 1e6 and hit["leverage"] == 0.2 and hit["observations"] >= 200
    assert any("sd below" in r for r in hit["reasons"]) and any("leverage 20%" in r for r in hit["reasons"])
    dip = G.cef_crash_check(bars, nav, "2026-09-15", CEF_RULE, META)
    assert dip["trigger"] is False and -2.5 < dip["z"] < -2.0 and any(r.startswith("z ") for r in dip["reasons"])
    quiet = G.cef_crash_check(bars, nav, "2026-09-28", CEF_RULE, META)
    assert quiet["trigger"] is False and abs(quiet["z"]) < 2.5
    # the day after the episode the print is back to normal: no second trigger from the same episode
    after = G.cef_crash_check(bars, nav, "2026-09-30", CEF_RULE, META)
    assert after["trigger"] is False


@pytest.mark.parametrize("case", ["nav_stale", "no_nav", "price", "adv", "leverage_unknown", "leverage_high", "history",
                                  "no_close"])
def test_each_filter_fails_closed(case):
    days = trading_days("2025-06-02", "2026-10-30")
    disc = discount_series(days)
    mean, sd = stats_before(disc, "2026-09-29")
    disc.loc[pd.Timestamp("2026-09-29")] = mean - 3.0 * sd
    bars, nav = cef_frames(disc)
    meta, date = dict(META), "2026-09-29"
    if case == "nav_stale":
        nav = nav.drop(index=[pd.Timestamp("2026-09-29")])                 # the last print is yesterday's
    elif case == "no_nav":
        nav = None
    elif case == "price":
        bars, nav = cef_frames(disc, nav=4.0)                              # a fund under $4
    elif case == "adv":
        bars, nav = cef_frames(disc, volume=10.0)
    elif case == "leverage_unknown":
        meta = {"leverage": None, "as_of": None, "source": "unverified; owner to fill"}
    elif case == "leverage_high":
        meta = {"leverage": 0.40, "as_of": "2026-09-01"}
    elif case == "history":
        short = disc.loc[pd.Timestamp("2026-02-01"):]                     # about 165 sessions
        bars, nav = cef_frames(short)
    elif case == "no_close":
        bars = bars.drop(index=[pd.Timestamp("2026-09-29")])
    chk = G.cef_crash_check(bars, nav, date, CEF_RULE, meta)
    assert chk["trigger"] is False, chk
    expected = {"nav_stale": "nav stale", "no_nav": "no NAV series", "price": "price 3.7",
                "adv": "average dollar volume", "leverage_unknown": "leverage unknown", "leverage_high": "leverage 40% above 35%",
                "history": "insufficient history", "no_close": "no close on 2026-09-29"}[case]
    assert any(expected in r and (case != "price" or "below 5" in r) for r in chk["reasons"]), chk["reasons"]
    if case == "history":
        assert chk["observations"] < 200


# ==================================================================================== 2. the exits
def test_exit_at_the_last_session_within_60_calendar_days_and_at_the_mean():
    assert G.cef_exit_due("2026-01-05", 60) == "2026-03-06"               # 6 Mar 2026 is a Friday session
    assert G.cef_exit_due("2025-09-02", 60) == "2025-10-31"               # 1 Nov 2025 is a Saturday
    days = trading_days("2025-01-02", "2026-10-30")
    disc = discount_series(days, wide_between(days, "2026-01-05", "2026-03-06", -0.12))
    bars, nav = cef_frames(disc)
    event = {"entry_date": "2026-01-05", "exit_due": "2026-03-06", "kind": "cef"}
    early = G.cef_exit_check(bars, nav, "2026-03-04", event, CEF_RULE)
    assert early["exit"] is False and early["days_held"] == 58 and early["discount"] < early["mean252"]
    due = G.cef_exit_check(bars, nav, "2026-03-05", event, CEF_RULE)      # the next session is the exit session
    assert due["exit"] is True and due["reason"] == "time_stop" and due["exit_due"] == "2026-03-06"
    late = G.cef_exit_check(bars, nav, "2026-03-09", event, CEF_RULE)     # a missed run: still an exit
    assert late["exit"] is True and late["reason"] == "time_stop"
    # a live slot sells at the next Sunday email's Monday: the exit fires once the Monday after that is past the cap
    assert G.cef_exit_check(bars, nav, "2026-02-27", event, CEF_RULE, next_chance="2026-03-09")["exit"] is True
    assert G.cef_exit_check(bars, nav, "2026-02-20", event, CEF_RULE, next_chance="2026-03-02")["exit"] is False
    # back at the mean: the first close with the discount at or above its trailing mean
    disc2 = discount_series(days, {**wide_between(days, "2026-01-05", "2026-01-20", -0.12), "2026-01-21": -0.04})
    bars2, nav2 = cef_frames(disc2)
    hold = G.cef_exit_check(bars2, nav2, "2026-01-20", event, CEF_RULE)
    back = G.cef_exit_check(bars2, nav2, "2026-01-21", event, CEF_RULE)
    assert hold["exit"] is False and back["exit"] is True and back["reason"] == "mean_reversion"
    assert back["discount"] == pytest.approx(-0.04) and back["discount"] >= back["mean252"]
    # without the same-evening NAV only the time stop applies (fail closed to holding)
    stale = G.cef_exit_check(bars2, nav2.drop(index=[pd.Timestamp("2026-01-21")]), "2026-01-21", event, CEF_RULE)
    assert stale["exit"] is False and stale["discount"] is None


# ==================================================================================== 3. crash mode
def test_crash_mode_staggers_entries_over_three_weeks():
    cm = G.crash_mode_update(None, "2026-10-07", 10, CEF_RULE)             # Wednesday of the week of 5 Oct
    assert cm and cm["per_week"] == 1 and cm["weeks"] == 3 and cm["until"] == "2026-10-25" and cm["week"] == "2026-W41"
    assert G.crash_mode_update(None, "2026-10-07", 9, CEF_RULE) is None
    assert G.entry_capacity(0, 2, None, 0) == 2 and G.entry_capacity(1, 2, None, 0) == 1 and G.entry_capacity(2, 2, None, 0) == 0
    assert G.entry_capacity(0, 2, cm, 0) == 1 and G.entry_capacity(0, 2, cm, 1) == 0 and G.entry_capacity(1, 2, cm, 0) == 1
    assert G.crash_mode_update(cm, "2026-10-20", 2, CEF_RULE) == cm       # week three: still on
    assert G.crash_mode_update(cm, "2026-10-26", 2, CEF_RULE) is None     # lapsed
    again = G.crash_mode_update(cm, "2026-10-14", 11, CEF_RULE)            # a second crash week restarts the clock
    assert again["since"] == "2026-10-14" and again["until"] == "2026-11-01"
    ranked = G.rank_triggers([{"ticker": "B", "z": -2.9, "discount": -0.1}, {"ticker": "A", "z": -3.5, "discount": -0.2},
                              {"ticker": "C", "z": -2.9, "discount": -0.15}])
    assert [t["ticker"] for t in ranked] == ["A", "C", "B"]


def test_the_runner_staggers_a_crash_week_one_entry_a_week(tmp_path):
    """Three funds trigger on the same Monday with `crash_mode_triggers: 3`: one entry that week (the widest), one the
    next week, and the third waits for a free slot (2 slots)."""
    days = trading_days()
    mk = market(ramp_index(), btc_on())
    for k, (t, depth) in enumerate((("CEFA", -0.20), ("CEFB", -0.15), ("CEFC", -0.12)), start=1):
        bars, nav = cef_frames(discount_series(days, wide_between(days, "2026-10-05", "2026-10-30", depth), seed=k))
        mk["bars"][t], mk["bars"][f"X{t}X"] = bars, nav
    rule = {**CEF_RULE, "crash_mode_triggers": 3, "universe": ["CEFA", "CEFB", "CEFC"],
            "funds": {t: META for t in ("CEFA", "CEFB", "CEFC")}}
    cfg = g3_cfg(cfg_for(rule_e=False), cef=rule)
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    run_days(cfg, GrowthProvider(**mk), state_dir, Recorder(), LAUNCH, "2026-10-23")
    rs = state_of(state_dir)["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    assert rs["status"] == "shadow" and rs["crash_mode"] and rs["crash_mode"]["per_week"] == 1
    assert rs["triggers_by_week"]["2026-W41"] == ["CEFA", "CEFB", "CEFC"]
    assert rs["entries_by_week"] == {"2026-W41": 1, "2026-W42": 1}
    slots = {s["ticker"]: s for s in rs["open_slots"]}
    assert set(slots) == {"CEFA", "CEFB"} and slots["CEFA"]["signal_date"] == "2026-10-05" and slots["CEFB"]["signal_date"] == "2026-10-12"
    assert all(s["crash_mode"] for s in slots.values()) and all(s["status"] == "open" for s in slots.values())
    filtered = g3_records(state_dir, "cef_crash_discount", "filtered")
    assert any(f["ticker"] == "CEFC" and "crash mode" in f["reasons"][0] for f in filtered)
    assert any(f["ticker"] == "CEFC" and "no free slot" in f["reasons"][0] for f in filtered)


# ==================================================================================== 4. the trust rule
def trust_series(discounts: list[float], start: str = "2026-09-01") -> tuple[pd.Series, pd.Series]:
    days = trading_days(start, "2026-12-31")[: len(discounts)]
    nav = pd.Series(1.0, index=days)
    price = nav * (1.0 + np.asarray(discounts))
    return price, nav


def test_trust_triggers_on_five_deep_closes_with_a_catalyst_and_never_at_a_premium():
    price, nav = trust_series([-0.10, -0.20, -0.30, -0.31, -0.28, -0.26, -0.30])
    date = price.index[-1].strftime("%Y-%m-%d")
    cat = {"filing": FILING, "decision_date": None}
    hit = G.crypto_trust_check(price, nav, date, TRUST_RULE, cat, cik=1761325)
    assert hit["trigger"] is True and hit["discount"] == pytest.approx(-0.30) and hit["catalyst"]["kind"] == "filing"
    assert len(hit["discounts"]) == 5 and all(d <= -0.25 for d in hit["discounts"])
    four = G.crypto_trust_check(price.iloc[:-1], nav, price.index[-2].strftime("%Y-%m-%d"), TRUST_RULE, cat, cik=1761325)
    assert four["trigger"] is False and any("above -25% on 1 of the last 5" in r for r in four["reasons"])
    no_cat = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": None, "decision_date": None}, cik=1761325)
    assert no_cat["trigger"] is False and any("no catalyst" in r for r in no_cat["reasons"])
    other_cik = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": {**FILING, "cik": 999}}, cik=1761325)
    assert other_cik["trigger"] is False and any("own CIK" in r for r in other_cik["reasons"])
    withdrawn = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": {**FILING, "withdrawn": True}}, cik=1761325)
    assert withdrawn["trigger"] is False and any("withdrawn" in r for r in withdrawn["reasons"])
    wrong_form = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": {**FILING, "form": "10-Q"}}, cik=1761325)
    assert wrong_form["trigger"] is False
    soon = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": None, "decision_date": "2026-12-01"}, cik=1761325)
    assert soon["trigger"] is True and soon["catalyst"]["kind"] == "decision"
    far = G.crypto_trust_check(price, nav, date, TRUST_RULE, {"filing": None, "decision_date": "2027-06-01"}, cik=1761325)
    assert far["trigger"] is False
    premium, nav2 = trust_series([-0.30, -0.30, -0.30, -0.30, -0.30, -0.30, 0.02])
    prem = G.crypto_trust_check(premium, nav2, premium.index[-1].strftime("%Y-%m-%d"), TRUST_RULE, cat, cik=1761325)
    assert prem["trigger"] is False and any("premium" in r for r in prem["reasons"])
    gap = G.crypto_trust_check(price, nav.drop(index=[price.index[-2]]), date, TRUST_RULE, cat, cik=1761325)
    assert gap["trigger"] is False and any("NAV missing" in r for r in gap["reasons"])


def test_trust_exits_and_the_widening_flag():
    price, nav = trust_series([-0.30, -0.30, -0.10, -0.02, -0.01, 0.0])
    date = price.index[-1].strftime("%Y-%m-%d")
    ep = {"entry_discount": -0.30, "min_discount": -0.30}
    closed = G.crypto_trust_exit_check(price, nav, date, ep, TRUST_RULE, {"filing": FILING})
    assert closed["exit"] is True and closed["reason"] == "discount_closed"
    early = G.crypto_trust_exit_check(price.iloc[:-1], nav, price.index[-2].strftime("%Y-%m-%d"), ep, TRUST_RULE, {"filing": FILING})
    assert early["exit"] is False
    deep, nav2 = trust_series([-0.30, -0.30, -0.35, -0.40, -0.46])
    d2 = deep.index[-1].strftime("%Y-%m-%d")
    hold = G.crypto_trust_exit_check(deep, nav2, d2, ep, TRUST_RULE, {"filing": FILING})
    assert hold["exit"] is False
    conv = G.crypto_trust_exit_check(deep, nav2, d2, ep, TRUST_RULE, {"filing": FILING}, {"conversion_date": d2})
    assert conv["exit"] is True and conv["reason"] == "conversion"
    gone = G.crypto_trust_exit_check(deep, nav2, d2, ep, TRUST_RULE, {"filing": {**FILING, "withdrawn": True}})
    assert gone["exit"] is True and gone["reason"] == "filing_withdrawn"
    denied = G.crypto_trust_exit_check(deep, nav2, d2, ep, TRUST_RULE, {"filing": FILING}, {"withdrawn_date": "2026-09-01"})
    assert denied["reason"] == "filing_withdrawn"
    assert G.widened(-0.30, -0.46) is True and G.widened(-0.30, -0.44) is False and G.widened(None, -0.5) is False


def test_trust_nav_is_the_coin_times_coins_per_share_decayed_at_the_fee():
    days = pd.date_range("2026-01-01", "2026-12-31", freq="D")
    coin = pd.Series(0.10, index=days)
    assert G.trust_nav(coin, 10.0, "2026-01-01", 0.025, "2026-01-01") == pytest.approx(1.0)
    assert G.trust_nav(coin, 10.0, "2026-01-01", 0.025, "2026-12-31") == pytest.approx(0.1 * 10.0 * (1 - 0.025 / 365) ** 364)
    assert G.trust_nav(coin, 10.0, "2026-01-01", 0.025, "2027-01-05") is None        # no coin close that day
    assert G.trust_nav(coin, None, "2026-01-01", 0.025, "2026-06-01") is None        # a missing figure is never guessed
    assert G.trust_nav(coin, 10.0, None, 0.025, "2026-06-01") is None
    series = G.trust_nav_series(coin, 10.0, "2026-01-01", 0.025)
    assert len(series) == len(days) and series.iloc[0] == pytest.approx(1.0) and series.iloc[-1] < 1.0
    assert G.trust_nav_series(coin, None, "2026-01-01", 0.025).empty


# ==================================================================================== 5. the promotion tests
def cef_events(n: int, excess: float | list[float], start: str = "2025-01-06") -> list[dict]:
    days = trading_days(start, "2026-12-31")
    xs = excess if isinstance(excess, list) else [excess] * n
    return [{"id": f"E{i}", "status": "closed", "entry_date": days[i * 5].strftime("%Y-%m-%d"), "return": 0.02 + x,
             "baseline": 0.02, "excess": x} for i, x in enumerate(xs[:n])]


def test_cef_promotion_test_passes_and_each_check_can_fail():
    ok = G.cef_promotion_test(cef_events(30, 0.03))
    assert ok["passed"] is True and ok["n"] == 30 and ok["checks_ok"] == 4 and ok["mean_excess"] == pytest.approx(0.03)
    assert [c["name"] for c in ok["checks"]] == ["closed shadow trades", "mean excess over random entry",
                                                 "median excess, first half", "median excess, second half"]
    few = G.cef_promotion_test(cef_events(29, 0.03))
    assert few["passed"] is False and few["checks"][0]["ok"] is False and few["reason"].startswith("closed shadow trades")
    thin = G.cef_promotion_test(cef_events(30, 0.01))
    assert thin["passed"] is False and thin["checks"][1] == {"name": "mean excess over random entry", "value": pytest.approx(0.01),
                                                             "threshold": 0.015, "ok": False}
    lopsided = G.cef_promotion_test(cef_events(30, [-0.01] * 15 + [0.08] * 15))
    assert lopsided["passed"] is False and lopsided["checks"][1]["ok"] is True and lopsided["checks"][2]["ok"] is False
    assert lopsided["checks"][3]["ok"] is True and lopsided["halves"][0]["median_excess"] == pytest.approx(-0.01)
    # an event without a scored excess does not count; a bare baseline (a number or a map) can supply one
    bare = [{"id": "B1", "status": "closed", "entry_date": "2026-01-05", "return": 0.05}]
    assert G.cef_promotion_test(bare)["n"] == 0 and G.cef_promotion_test(bare, 0.01)["n"] == 1
    assert G.cef_promotion_test(bare, {"B1": 0.02})["mean_excess"] == pytest.approx(0.03)
    assert G.cef_promotion_test([])["passed"] is False and G.cef_promotion_test([])["n"] == 0


def test_trust_promotion_test_passes_and_each_check_can_fail():
    eps = [{"status": "closed", "return": 0.5, "coin_return": 0.3, "excess": 0.2, "widened": False} for _ in range(3)]
    ok = G.trust_promotion_test(eps)
    assert ok["passed"] is True and ok["n"] == 3 and ok["mean_excess"] == pytest.approx(0.2) and ok["widened"] == 0
    assert G.trust_promotion_test(eps[:2])["passed"] is False and G.trust_promotion_test(eps[:2])["checks"][0]["ok"] is False
    low = G.trust_promotion_test([{**e, "excess": 0.05} for e in eps])
    assert low["passed"] is False and low["checks"][1]["ok"] is False
    wide = G.trust_promotion_test(eps[:2] + [{**eps[0], "widened": None, "entry_discount": -0.30, "min_discount": -0.50}])
    assert wide["passed"] is False and wide["checks"][2] == {"name": "episodes whose discount widened by more than the limit",
                                                             "value": 1, "threshold": 0, "ok": False}
    computed = G.trust_promotion_test([{"status": "closed", "return": 0.4, "coin_return": 0.2}] * 3)
    assert computed["passed"] is True and computed["mean_excess"] == pytest.approx(0.2)


def test_random_entry_baseline_and_the_total_return_basis():
    days = trading_days("2025-01-02", "2026-06-30")
    adj = pd.Series(np.linspace(100.0, 130.0, len(days)), index=days)
    base = G.random_entry_baseline(adj, "2026-06-01")
    assert base is not None and 0.03 < base < 0.06                          # a steady 30% drift over 375 sessions
    assert G.random_entry_baseline(adj.iloc[:150], adj.index[149].strftime("%Y-%m-%d")) is None
    bars = frame(pd.Series(10.0, index=days))
    bars.loc[days[-1], "adj_close"] = 12.0                                   # a distribution: adj/close = 1.2 that day
    assert G.total_return_price(bars, days[-1].strftime("%Y-%m-%d"), 10.0) == pytest.approx(12.0)
    assert G.total_return_price(bars, "2030-01-01", 10.0) == 10.0 and G.total_return_price(None, "2026-01-05", 7.0) == 7.0


# ==================================================================================== 6. the daily runner
def shadow_market(*, episode: tuple[str, str, float] = ("2026-09-29", "2026-10-05", -0.12), back: str | None = "2026-10-06",
                  extra: dict | None = None) -> dict:
    """test_growth's market plus two funds: CEFA with a wide-discount episode (then back above its mean), CEFB quiet."""
    days = trading_days()
    mk = market(ramp_index(), btc_on())
    eps = wide_between(days, episode[0], episode[1], episode[2])
    if back:
        eps[back] = -0.04
    a_bars, a_nav = cef_frames(discount_series(days, eps))
    b_bars, b_nav = cef_frames(discount_series(days, seed=11))
    mk["bars"].update({"CEFA": a_bars, "XCEFAX": a_nav, "CEFB": b_bars, "XCEFBX": b_nav, **(extra or {})})
    return mk


def shadow_rule(**over) -> dict:
    return {**CEF_RULE, "universe": ["CEFA", "CEFB"], "funds": {"CEFA": META, "CEFB": META}, **over}


def test_daily_runner_records_shadow_entries_and_exits_at_the_next_open_with_slippage(tmp_path):
    cfg = g3_cfg(cfg_for(), cef=shadow_rule())
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    mk = shadow_market()
    provider = GrowthProvider(**mk)
    rec = Recorder()
    run_days(cfg, provider, state_dir, rec, LAUNCH, "2026-10-11")           # through the Sunday after the exit
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    assert rs["status"] == "shadow" and rs["open_slots"] == [] and len(rs["events"]) == 1
    ev = rs["events"][0]
    a = mk["bars"]["CEFA"]
    slip = cfg.slippage_bps("CEFA") / 1e4
    assert ev["ticker"] == "CEFA" and ev["book"] == "shadow" and ev["signal_date"] == "2026-09-29" and ev["status"] == "closed"
    assert ev["entry_date"] == "2026-09-30" and ev["entry_price"] == pytest.approx(float(a.at[pd.Timestamp("2026-09-30"), "open"]) * (1 + slip))
    assert ev["exit_signal_date"] == "2026-10-06" and ev["exit_reason"] == "mean_reversion" and ev["exit_date"] == "2026-10-07"
    assert ev["exit_price"] == pytest.approx(float(a.at[pd.Timestamp("2026-10-07"), "open"]) * (1 - slip))
    assert ev["return"] == pytest.approx(ev["exit_price"] / ev["entry_price"] - 1) and ev["return"] > 0.08
    assert ev["baseline"] is not None and abs(ev["baseline"]) < 0.02 and ev["excess"] == pytest.approx(ev["return"] - ev["baseline"])
    assert ev["exit_due"] == G.cef_exit_due("2026-09-30", 60) and ev["z"] < -2.5 and ev["crash_mode"] is False
    stats = rs["shadow_stats"]
    assert stats["n"] == 1 and stats["n_scored"] == 1 and stats["mean_excess"] == pytest.approx(ev["excess"]) and stats["open"] == 0
    assert rs["promotion"]["passed"] is False and rs["promotion"]["n"] == 1 and rs["promotion"]["checks"][0]["value"] == 1
    events = [(p["event"], p.get("ticker")) for p in g3_records(state_dir, "cef_crash_discount")]
    assert events.count(("signal", "CEFA")) == 1 and ("entry", "CEFA") in events and ("exit_signal", "CEFA") in events
    assert ("exit", "CEFA") in events and events[0] == ("promotion_test", None)       # the quarter's snapshot first
    assert [p["quarter"] for p in g3_records(state_dir, "cef_crash_discount", "promotion_test")] == ["2026-Q3", "2026-Q4"]
    assert rs["last_screen"]["screened"] == 2 and rs["last_screen"]["missing"] == []
    # the country rule got its note, the trust rule screened an empty universe, the reserve stayed in SGOV
    rules = st["growth"]["sleeves"]["G3"]["rules"]
    assert "owner decision" in rules["country_devaluation"]["note"] and rules["crypto_trust_discount"]["last_screen"]["screened"] == 0
    facts = st["growth"]["last_facts"]
    reserve = 0.15 * facts["nav"]["ira"]                                  # 15% of the IRA at Friday's close (G = 1)
    assert st["growth"]["sleeves"]["G3"]["reserve"] == pytest.approx(reserve, abs=0.01) and st["growth"]["sleeves"]["G3"]["slots_usd"] == 0.0
    assert facts["g3"]["promoted_rules"] == [] and facts["g3"]["slots"] == [] and facts["g3"]["reserve_usd"] == pytest.approx(reserve, abs=0.01)
    assert facts["g3"]["sgov_usd"] == facts["g3"]["reserve_usd"] and facts["g3"]["slots_usd"] == 0.0
    assert facts["g3"]["shadow"]["cef_crash_discount"]["n"] == 1 and "ira|CEFA|G3" not in st["broker"]["lots"]
    assert Ledger(state_dir / "ledger.jsonl").verify()[0] is True
    # the Sunday email carries the shadow tally
    text = flat(rec.sent[-1].text)
    assert "GEMS" in text and "CEF crash-discount rule: 1 shadow trades closed, mean excess" in text
    assert "2 of 4 promotion checks pass" in text and "crypto-trust discount rule: no shadow trades closed yet" in text
    assert validate(rec.sent[-1]) == []


def test_daily_runner_time_stop_and_missing_series_fail_closed(tmp_path):
    cfg = g3_cfg(cfg_for(), cef=shadow_rule(hold_days=10, universe=["CEFA", "CEFB", "CEFX"]))
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    mk = shadow_market(episode=("2026-09-29", "2026-10-30", -0.12), back=None)
    del mk["bars"]["XCEFBX"]                                                   # CEFB has a price but no NAV series
    rec = Recorder()
    run_days(cfg, GrowthProvider(**mk), state_dir, rec, LAUNCH, "2026-10-13")
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    ev = rs["events"][0]
    assert ev["exit_due"] == "2026-10-09" and ev["exit_reason"] == "time_stop" and ev["exit_signal_date"] == "2026-10-08"
    assert ev["exit_date"] == "2026-10-09"
    # the discount is still 2.5 sd wide after the stop: the fund re-enters on its next trigger (no cooldown beyond the slot)
    (again,) = rs["open_slots"]
    assert again["ticker"] == "CEFA" and again["signal_date"] == "2026-10-09" and again["entry_date"] == "2026-10-12"
    alerts = [a["message"] for a in st["alerts"] if a["kind"] == "data" and a["message"].startswith("G3 cef_crash_discount")]
    assert any("no NAV series for XCEFBX" in m for m in alerts) and any("no price bars for CEFX" in m for m in alerts)
    per_day = [a for a in st["alerts"] if a["kind"] == "data" and "XCEFBX" in a["message"] and a["date"] == "2026-09-28"]
    assert len(per_day) == 1                                                   # one alert per missing series per day
    assert rs["last_screen"]["screened"] == 1 and sorted(rs["last_screen"]["missing"]) == ["CEFB", "CEFX"]


class FakeEdgar:
    """An EDGAR client for the trust's catalyst: `search` returns the hits given, or raises."""

    def __init__(self, hits=None, error: Exception | None = None) -> None:
        self.hits, self.error, self.calls = hits or [], error, []

    def search(self, forms, start, end, *, q="", ciks=None, max_hits=2000):
        self.calls.append((forms, start, end, tuple(ciks or [])))
        if self.error:
            raise self.error
        return list(self.hits)


def hit(form: str, filed: str, adsh: str = "0001234567-26-000001", cik: int = 1761325) -> dict:
    return {"adsh": adsh, "filename": "doc.htm", "form": form, "file_type": form, "file_date": filed, "period": None,
            "ciks": [cik], "entities": [{"name": "Test Trust", "tickers": ["TRST"], "cik": cik}], "items": [], "sics": []}


def trust_market(discounts: dict[str, float]) -> dict:
    """The market plus a trust TRST whose NAV is rebuilt from a coin at 0.10 (10 coins a share): a -30% discount from
    22 Sep to 5 Oct, then back to -2% and above."""
    days = trading_days()
    mk = market(ramp_index(), btc_on())
    coin = pd.Series(0.10, index=days)
    nav = G.trust_nav_series(coin, 10.0, "2026-01-01", 0.025)
    disc = pd.Series(-0.10, index=days)
    for day, v in discounts.items():
        disc.loc[pd.Timestamp(day)] = v
    price = frame(nav.reindex(days) * (1.0 + disc))
    price["volume"] = 1e6
    mk["bars"].update({"TRST": price, "XLM-TEST": frame(coin)})
    return mk


def trust_rule() -> dict:
    return {**TRUST_RULE, "universe": [{"ticker": "TRST", "coin": "XLM-TEST", "cik": 1761325, "coins_per_share": 10.0,
                                        "as_of": "2026-01-01", "fee_annual": 0.025}]}


def test_daily_runner_trust_episode_needs_one_catalyst_search_a_week_and_fails_closed_on_an_edgar_error(tmp_path):
    days = trading_days()
    deep = wide_between(days, "2026-09-22", "2026-10-05", -0.30)
    closed = wide_between(days, "2026-10-06", "2026-10-30", -0.01)
    cfg = g3_cfg(cfg_for(), cef={**CEF_RULE, "universe": [], "funds": {}}, trust=trust_rule())
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    provider = GrowthProvider(**trust_market({**deep, **closed}))
    provider.edgar = FakeEdgar([hit("S-1", "2026-06-15")])
    rec = Recorder()
    run_days(cfg, provider, state_dir, rec, LAUNCH, "2026-10-02")
    assert len(provider.edgar.calls) == 1 and provider.edgar.calls[0][0] == R.CATALYST_FORMS and provider.edgar.calls[0][3] == (1761325,)
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["crypto_trust_discount"]
    assert rs["catalysts"]["TRST"]["filing"]["form"] == "S-1" and rs["catalysts"]["TRST"]["checked"] == "2026-09-28"
    (slot,) = rs["open_slots"]
    assert slot["signal_date"] == "2026-09-28" and slot["status"] == "open" and slot["entry_date"] == "2026-09-29"
    assert slot["catalyst"] == "filing" and slot["entry_discount"] == pytest.approx(-0.30, abs=1e-6) and slot["coin_entry"] == 0.1
    run_days(cfg, provider, state_dir, rec, "2026-10-03", "2026-10-13")
    assert [c[2] for c in provider.edgar.calls] == ["2026-09-28", "2026-10-05", "2026-10-12"]   # one search a week
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["crypto_trust_discount"]
    (ev,) = rs["events"]
    assert ev["status"] == "closed" and ev["exit_reason"] == "discount_closed" and ev["exit_signal_date"] == "2026-10-08"
    assert ev["exit_date"] == "2026-10-09" and ev["coin_return"] == pytest.approx(0.0) and ev["widened"] is False
    assert ev["excess"] == pytest.approx(ev["return"]) and ev["return"] > 0.3
    assert rs["shadow_stats"]["n"] == 1 and rs["promotion"]["checks"][2]["value"] == 0 and rs["promotion"]["passed"] is False
    assert validate(rec.sent[-1].text and rec.sent[-1]) == []
    assert "crypto-trust discount rule: 1 shadow trades closed, mean excess" in flat(rec.sent[-1].text)
    # an EDGAR failure: a data alert, no catalyst, no trigger (fail closed), one attempt a day
    cfg2 = g3_cfg(cfg_for(), cef={**CEF_RULE, "universe": [], "funds": {}}, trust=trust_rule())
    state2 = tmp_path / "state2"
    pipeline.run_init(cfg2, state2, created=LAUNCH)
    p2 = GrowthProvider(**trust_market({**deep, **closed}))
    p2.edgar = FakeEdgar(error=EdgarAccessDenied("GET x: HTTP 403"))
    run_days(cfg2, p2, state2, Recorder(), LAUNCH, "2026-10-02")
    st2 = state_of(state2)
    rs2 = st2["growth"]["sleeves"]["G3"]["rules"]["crypto_trust_discount"]
    assert rs2["open_slots"] == [] and rs2["events"] == [] and len(p2.edgar.calls) == 5
    assert any("EDGAR search for TRST" in a["message"] and a["kind"] == "data" for a in st2["alerts"])
    assert rs2["catalysts"]["TRST"]["error"].startswith("EdgarAccessDenied")
    # no EDGAR source at all: the same, with a note that names it
    cfg3 = g3_cfg(cfg_for(), cef={**CEF_RULE, "universe": [], "funds": {}}, trust=trust_rule())
    state3 = tmp_path / "state3"
    pipeline.run_init(cfg3, state3, created=LAUNCH)
    run_days(cfg3, GrowthProvider(**trust_market({**deep, **closed})), state3, Recorder(), LAUNCH, "2026-09-29")
    st3 = state_of(state3)
    assert st3["growth"]["sleeves"]["G3"]["rules"]["crypto_trust_discount"]["open_slots"] == []
    assert any("no EDGAR source" in a["message"] for a in st3["alerts"])


# ==================================================================================== 7. a live rule's Sunday
def test_sleeve_targets_and_the_order_set_carve_the_slots_out_of_the_reserve():
    gcfg = cfg_for().constitution["growth"]
    tg = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg, g3_held_usd=4_000.0, g3_buy_usd=4_000.0)
    assert tg["SGOV"]["target_usd"] == 8_000.0 and tg["SGOV"]["g3_reserve_usd"] == 4_000.0 and tg["SGOV"]["g3_slots_usd"] == 8_000.0
    plain = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg)
    assert plain["SGOV"]["target_usd"] == 16_000.0 and plain["SGOV"]["g3_reserve_usd"] == 12_000.0 and plain["SGOV"]["g3_slots_usd"] == 0.0
    # a switch week uses the three orders: the gems entry is deferred, ranked after the G1/G2 buys
    targets = orders_mod.sleeve_targets({"SSO": True, "QLD": True}, True, 80_000.0, 1.0, gcfg, g3_buy_usd=4_000.0)
    held = {"SSO": 0.0, "QLD": 0.0, "IBIT": 0.0, "SGOV": 0.0}
    g3 = {"buys": [{"ticker": "PCN", "usd": 4_000.0, "rule": "cef_crash_discount", "slot_id": "S1"}], "sells": []}
    os = orders_mod.build_order_set(targets, held, 80_000.0, G=1.0, G_last_order=None, cfg_growth=gcfg, g3=g3)
    assert [(o["action"], o["ticker"]) for o in os["orders"]] == [("buy", "SSO"), ("buy", "QLD"), ("buy", "IBIT")]
    assert [(o["ticker"], o["why"]) for o in os["deferred"]][0] == ("PCN", "the 3 orders are used")
    # a quiet week: the entry rides after the sleeves' buys and before the SGOV sweep; the exit is a Step 1 "Sell all"
    held2 = {"SSO": 20_000.0, "QLD": 20_000.0, "IBIT": 24_000.0, "SGOV": 0.0, "PTY": 3_900.0}
    g3b = {"buys": g3["buys"], "sells": [{"ticker": "PTY", "held_usd": 3_900.0, "rule": "cef_crash_discount", "slot_id": "S0"}]}
    os2 = orders_mod.build_order_set(targets, held2, 16_000.0, G=1.0, G_last_order=1.0, cfg_growth=gcfg, g3=g3b,
                                     modules={"PCN": "G3", "PTY": "G3"})
    assert [(o["action"], o["ticker"], o["usd"], o["step"]) for o in os2["orders"]] == [
        ("sell_all", "PTY", 3_900.0, 1), ("buy", "PCN", 4_000.0, 2), ("buy", "SGOV", 15_880.5, 2)]
    assert os2["orders"][0]["reason"] == "g3_exit" and os2["orders"][1]["reason"] == "g3_entry"
    assert os2["orders"][1]["slot_id"] == "S1" and os2["orders"][1]["module"] == "G3" and os2["orders"][0]["slot_id"] == "S0"
    paused = orders_mod.build_order_set(targets, held2, 16_000.0, G=0.25, G_last_order=1.0, cfg_growth=gcfg, g3=g3b, paused=True)
    assert not [o for o in paused["orders"] if o["action"] == "buy" and o["sleeve"] == "G3"]
    assert any(s["ticker"] == "PCN" and "paused" in s["reason"] for s in paused["skipped"])


def live_cfg(**over):
    cfg = g3_cfg(cfg_for(), cef=shadow_rule(status="live", **over))
    return whitelisted(cfg, "CEFA", "CEFB")


def test_a_live_rule_buys_from_the_reserve_on_sunday_fills_on_monday_and_sells_on_its_exit(tmp_path):
    cfg = live_cfg()
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    mk = shadow_market()
    provider = GrowthProvider(**mk)
    rec = Recorder()
    run_days(cfg, provider, state_dir, rec, LAUNCH, "2026-10-03")           # the first Sunday, the signal on Tue 29 Sep
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    (slot,) = rs["open_slots"]
    assert slot["book"] == "live" and slot["status"] == "pending_entry" and slot["intent_id"] is None
    assert "ira|CEFA|G3" not in st["broker"]["lots"]                          # never shadow-filled
    run_days(cfg, provider, state_dir, rec, "2026-10-04", "2026-10-04")     # the Sunday email carries the entry
    st = state_of(state_dir)
    facts = st["growth"]["last_facts"]
    nav_ira = facts["nav"]["ira"]                                             # 5% of the IRA at Friday's close, after Monday's slippage
    usd = math.floor(0.05 * nav_ira * 100) / 100
    reserve = 0.15 * nav_ira
    money = lambda v: f"${float(v):,.0f}"                                     # noqa: E731 - the registry's money format
    step2 = facts["orders"]["step2"]
    assert [(o["ticker"], o["usd"], o["sleeve"], o["reason"]) for o in step2] == [
        ("CEFA", usd, "G3", "g3_entry"), ("SGOV", step2[1]["usd"], "SGOV", "idle_cash_to_sgov")] and step2[1]["usd"] > 11_000
    g3 = facts["g3"]
    assert g3["promoted_rules"] == ["cef_crash_discount"] and g3["reserve_usd"] == pytest.approx(reserve, abs=0.01)
    assert g3["sgov_usd"] == pytest.approx(reserve - usd, abs=0.02) and g3["slots_usd"] == usd
    assert g3["single_names_open"] == 1 and g3["single_names_max"] == 2 and g3["single_name_cap_usd"] == pytest.approx(0.05 * nav_ira, abs=0.01)
    assert g3["slots"][0]["ticker"] == "CEFA" and g3["slots"][0]["order"] == "buy" and g3["slots"][0]["usd"] == usd
    row = next(s for s in facts["sleeves"] if s["ticker"] == "CEFA")
    assert row["name"] == "G3 CEF crash-discount rule" and row["state"] == "entry" and row["target_usd"] == usd and row["changed"]
    sgov = next(s for s in facts["sleeves"] if s["ticker"] == "SGOV")
    assert sgov["why"]["g3_reserve_usd"] == pytest.approx(reserve - usd, abs=0.02) and sgov["why"]["promoted_rules"] == ["cef_crash_discount"]
    assert sgov["target_usd"] == pytest.approx(0.2 * nav_ira - usd, abs=0.02)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    (slot,) = rs["open_slots"]
    assert slot["intent_id"] and slot["trade_id"] == "G-2026-10-04-CEFA" and slot["usd"] == usd and slot["status"] == "pending_entry"
    assert st["growth"]["sleeves"]["G3"]["reserve"] == pytest.approx(reserve - usd, abs=0.02) and st["growth"]["sleeves"]["G3"]["slots_usd"] == usd
    email = rec.sent[-1]
    assert validate(email) == []
    text = flat(email.text)
    assert f"Buy {money(usd)} of CEFA, market, in dollars: a promoted gems rule's entry, from the reserve." in text
    assert (f"1 of at most 2 single names are open: the promoted gems rules hold {money(g3['slots_usd'])} and "
            f"{money(g3['sgov_usd'])} of the reserve stays in the cash fund.") in text
    assert f"CEFA: buy {money(usd)} this week; discount" in text and "at the signal of Tue 29 Sep (z −" in text
    assert "This week's Step 2 buys it." in text
    assert (f"the gems reserve's cash part ({money(sgov['why']['g3_reserve_usd'])}; the promoted rules' slots hold the rest) "
            f"and the cash sleeve ({money(sgov['why']['cash_sleeve_usd'])})") in text
    assert text.index("GEMS") < text.index("WHY") and f"G3 gems CEFA entry 5% {money(usd)} $0 +{money(usd)}" in text
    foreign = dataclasses.replace(email, text=email.text.replace(f"Buy {money(usd)} of CEFA", "Buy $4,100 of CEFA"))
    assert any('"$4,100" is not registered' in p for p in validate(foreign))
    swapped = dataclasses.replace(email, text=email.text.replace(f"CEFA: buy {money(usd)} this week",
                                                                 f"CEFA: buy {money(step2[1]['usd'])} this week"))
    assert any("usd__gems_slot_CEFA" in p for p in validate(swapped))
    # Monday: the paper fill opens the slot at the fill price; the reserve's SGOV part shrinks
    run_days(cfg, provider, state_dir, rec, "2026-10-05", "2026-10-05")
    st = state_of(state_dir)
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    (slot,) = rs["open_slots"]
    fill = next(f for f in st["fills"] if f["ticker"] == "CEFA")
    assert slot["status"] == "open" and slot["entry_date"] == "2026-10-05" and slot["entry_price"] == fill["price"]
    assert fill["module"] == "G3" and "ira|CEFA|G3" in st["broker"]["lots"] and slot["exit_due"] == G.cef_exit_due("2026-10-05", 60)
    kinds = [p["event"] for p in g3_records(state_dir, "cef_crash_discount") if p.get("ticker") == "CEFA"]
    assert [k for k in kinds if k in ("signal", "entry")] == ["signal", "entry"]      # the pending days log "filtered"
    assert kinds.count("filtered") >= 1 and kinds.index("filtered") > kinds.index("signal")
    # the discount is back at its mean on Tue 6 Oct: the slot waits for Sunday's "Sell all", filled on Monday
    run_days(cfg, provider, state_dir, rec, "2026-10-06", "2026-10-10")
    st = state_of(state_dir)
    (slot,) = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]["open_slots"]
    assert slot["status"] == "pending_exit" and slot["exit_reason"] == "mean_reversion" and slot["exit_intent_id"] is None
    assert "ira|CEFA|G3" in st["broker"]["lots"]
    run_days(cfg, provider, state_dir, rec, "2026-10-11", "2026-10-12")
    st = state_of(state_dir)
    facts = st["growth"]["last_facts"]
    assert [(o["action"], o["ticker"], o["reason"]) for o in facts["orders"]["step1"]] == [("sell_all", "CEFA", "g3_exit")]
    assert facts["g3"]["slots"][0]["order"] == "sell" and facts["g3"]["slots"][0]["status"] == "pending_exit"
    assert "Sell all CEFA, market" in flat(rec.sent[-1].text) and validate(rec.sent[-1]) == []
    rs = st["growth"]["sleeves"]["G3"]["rules"]["cef_crash_discount"]
    (ev,) = rs["events"]
    exit_fill = next(f for f in st["fills"] if f["ticker"] == "CEFA" and f["side"] == "sell")
    assert rs["open_slots"] == [] and ev["status"] == "closed" and ev["exit_date"] == "2026-10-12" and ev["exit_price"] == exit_fill["price"]
    assert ev["book"] == "live" and ev["return"] > 0.05 and ev["excess"] is not None and rs["shadow_stats"]["n"] == 1
    assert "ira|CEFA|G3" not in st["broker"]["lots"]
    # the Sunday's state: the reserve less the slot still held that night (sold at Monday's open)
    assert st["growth"]["sleeves"]["G3"]["reserve"] == pytest.approx(facts["g3"]["sgov_usd"], abs=0.01)
    assert facts["g3"]["slots_usd"] > 0 and facts["g3"]["reserve_usd"] == pytest.approx(0.15 * facts["nav"]["ira"], abs=0.01)
    assert not [a for a in st["alerts"] if a["kind"] in ("order", "validator", "fill")], st["alerts"]
    assert Ledger(state_dir / "ledger.jsonl").verify()[0] is True
    # the quarterly review prints the rule's promotion test and validates
    res = reports.run_quarterly(cfg, provider, state_dir, quarter="2026-Q3", services=rec.services())
    assert res.status == "ok" and validate(rec.sent[-1]) == []
    review = flat(rec.sent[-1].text)
    assert "PROMOTION TESTS (RULES ON PAPER; YOU DECIDE)" in review and "CEF crash-discount rule" in review and "live" in review


def test_single_name_caps_hold_across_the_rules_and_a_ticker_off_the_whitelist_waits(tmp_path):
    cfg = g3_cfg(cfg_for(), cef=shadow_rule(status="live"), trust={**trust_rule(), "status": "live"})
    cfg = whitelisted(cfg, "CEFA")                                           # CEFB and TRST are not listed
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=LAUNCH)
    run = pipeline.Run(cfg, GrowthProvider(**shadow_market()), state_dir, "weekly", "2026-10-04")
    try:
        st = growth.state_growth(run.state)
        rules = st["sleeves"]["G3"]["rules"]
        for name, ticker, z in (("cef_crash_discount", "CEFA", -3.2), ("cef_crash_discount", "CEFB", -2.8),
                                ("crypto_trust_discount", "TRST", None)):
            rs = rules.setdefault(name, R.new_rule_state("live"))
            rs["open_slots"].append({"id": f"S-{ticker}", "rule": name, "kind": "cef" if z else "trust", "ticker": ticker, "book": "live",
                                     "status": "pending_entry", "signal_date": "2026-10-01", "z": z, "discount": -0.3, "intent_id": None})
        gcfg = cfg.constitution["growth"]
        book = R.sunday_book(run, st, gcfg, 80_000.0, 1.0, {}, "ira")
        assert [b["ticker"] for b in book["buys"]] == ["CEFA"]              # the widest listed name; CEFB is off the whitelist
        assert {w["ticker"]: w["why"] for w in book["waiting"]} == {"CEFB": "not on the whitelist", "TRST": "not on the whitelist"}
        assert any(a["kind"] == "order" and "CEFB is not on the whitelist" in a["message"] for a in run.state["alerts"])
        # two names open: the third waits for a free single-name slot, however wide its discount
        wl = whitelisted(cfg, "CEFB", "TRST")
        run.cfg = wl
        rules["cef_crash_discount"]["open_slots"][0].update(status="open", entry_date="2026-09-29")
        rules["cef_crash_discount"]["open_slots"][1].update(status="open", entry_date="2026-09-29")
        book2 = R.sunday_book(run, st, gcfg, 80_000.0, 1.0, {}, "ira")
        assert book2["buys"] == [] and book2["waiting"][0]["ticker"] == "TRST" and "no free single-name slot" in book2["waiting"][0]["why"]
        assert book2["facts"]["single_names_open"] == 2 and book2["facts"]["single_names_max"] == 2
        # the governor scales a slot; the single-name cap is 5% of the IRA whatever the weight
        rules["cef_crash_discount"]["open_slots"] = [rules["cef_crash_discount"]["open_slots"][0]]
        rules["cef_crash_discount"]["open_slots"][0].update(status="pending_entry", entry_date=None)
        book3 = R.sunday_book(run, st, gcfg, 80_000.0, 0.5, {}, "ira")
        assert book3["buys"][0]["usd"] == 2_000.0 and book3["reserve_usd"] == 6_000.0 and book3["facts"]["single_name_cap_usd"] == 4_000.0
        gcfg_wide = copy.deepcopy(gcfg)
        gcfg_wide["sleeves"]["G3"]["rules"]["cef_crash_discount"]["slot_weight"] = 0.10
        book4 = R.sunday_book(run, st, gcfg_wide, 80_000.0, 1.0, {}, "ira")
        assert book4["buys"][0]["usd"] == 4_000.0
        # the hard stop: no buys, every held live slot is sold
        rules["cef_crash_discount"]["open_slots"][0].update(status="open", entry_date="2026-09-29")
        book5 = R.sunday_book(run, st, gcfg, 80_000.0, 0.25, {}, "ira", paused=True)
        assert book5["buys"] == [] and [(s["ticker"], s["reason"]) for s in book5["sells"]] == [("CEFA", "hard_stop")]
    finally:
        run.close()


def test_validator_rejects_more_single_names_than_the_caps_allow():
    from traderec.validator import growth_problems
    facts = {"orders": {"step1": [], "step2": [{"action": "buy", "ticker": "PCN", "usd": 4_000.0, "sleeve": "G3", "rank": 1},
                                              {"action": "buy", "ticker": "PTY", "usd": 4_500.0, "sleeve": "G3", "rank": 2}],
                        "max_orders": 3},
             "sleeves": [], "risk": {"required_for": [], "funds": {}},
             "g3": {"slots": [{"ticker": "PDI", "status": "open"}], "single_names_max": 2, "single_name_cap_usd": 4_000.0}}
    problems = growth_problems("GROWTH", facts)
    assert any("3 single names open or bought, more than the 2" in p for p in problems)
    assert any("PTY buy of $4,500 is above the single-name cap of $4,000" in p for p in problems)


def test_the_review_renders_the_gems_promotion_tests_next_to_the_edgar_tests():
    passed = G.cef_promotion_test(cef_events(30, 0.03))
    rows = [{"rule": "cef_crash_discount", "label": "CEF crash-discount rule", "status": "shadow", "n": 30, "closed": 30,
             "mean_excess": 0.03, "checks": passed["checks"], "passed": True, "checks_ok": 4, "checks_total": 4, "open": 1},
            {"rule": "crypto_trust_discount", "label": "crypto-trust discount rule", "status": "shadow", "n": 0, "closed": 0,
             "mean_excess": None, "checks": G.trust_promotion_test([])["checks"], "passed": False, "checks_ok": 0, "checks_total": 3}]
    edgar = [{"setup": "SH2", "label": "EDGAR SH2 special dividend", "enabled": True, "stats": {"n": 12, "mean": 0.011},
              "checks": [{"name": "trades", "ok": False}, {"name": "mean", "ok": True}], "passed": False},
             {"setup": "CEF", "label": "EDGAR CEF tender capture", "enabled": True, "stats": {"n": 2, "mean": 0.004}, "checks": [],
              "passed": None}]
    email = render_quarterly({"quarter": "2026-Q3", "label": "Q3 2026", "g3": rows, "edgar": edgar}, {})
    assert validate(email) == []
    text = flat(email.text)
    assert "CEF crash-discount rule shadow 30 +3% 4 of 4 yes" in text
    assert "crypto-trust discount rule shadow 0 — 0 of 3 no" in text
    assert "EDGAR SH2 special dividend shadow 12 +1.1% 1 of 2 no" in text and "EDGAR CEF tender capture shadow 2 +0.4% — no test pre-registered" in text
    assert "CEF crash-discount rule: its promotion test passed; set status: live in the constitution" in text
    assert "the reviews report and never promote" in text
    tampered = dataclasses.replace(email, text=email.text.replace("+3%", "+5%"))
    assert any('"+5%" is not registered' in p for p in validate(tampered))
    assert "PROMOTION TESTS" not in flat(render_quarterly({"quarter": "2026-Q3", "label": "Q3 2026"}, {}).text)


def test_g3_review_reads_the_state_by_asof():
    from types import SimpleNamespace
    events = cef_events(30, 0.03, start="2025-01-06")
    for e in events:
        e["exit_date"] = (pd.Timestamp(e["entry_date"]) + pd.Timedelta(days=90)).strftime("%Y-%m-%d")
    state = {"growth": {"sleeves": {"G3": {"rules": {
        "cef_crash_discount": {"status": "shadow", "events": events, "open_slots": [{"id": "x"}]},
        "country_devaluation": {"status": "shadow", "note": "owner decision"},
        "crypto_trust_discount": {"status": "shadow", "events": [], "open_slots": []}}}}}}
    cfg = SimpleNamespace(constitution={"growth": {"sleeves": {"G3": {"rules": {
        "cef_crash_discount": {"status": "shadow", "promotion": {"min_trades": 30, "min_mean_excess": 0.015}},
        "crypto_trust_discount": {"status": "shadow"}}}}}})
    run = SimpleNamespace(state=state, cfg=cfg)
    rows = {r["rule"]: r for r in reports.g3_review(run, "2026-12-31")}
    assert set(rows) == {"cef_crash_discount", "crypto_trust_discount"}
    assert rows["cef_crash_discount"]["passed"] is True and rows["cef_crash_discount"]["n"] == 30 and rows["cef_crash_discount"]["open"] == 1
    assert rows["cef_crash_discount"]["label"] == "CEF crash-discount rule" and rows["cef_crash_discount"]["basis"] == "random entry"
    earlier = {r["rule"]: r for r in reports.g3_review(run, "2025-06-30")}
    assert earlier["cef_crash_discount"]["n"] < 30 and earlier["cef_crash_discount"]["passed"] is False
    assert rows["crypto_trust_discount"]["n"] == 0 and rows["crypto_trust_discount"]["checks_total"] == 3


def test_slot_specs_cover_every_gems_number_and_a_trust_slot_has_no_z():
    facts = {"g3": {"promoted_rules": ["crypto_trust_discount"], "single_names_open": 1, "single_names_max": 2, "slots_usd": 4_000.0,
                    "sgov_usd": 8_000.0, "reserve_usd": 12_000.0,
                    "slots": [{"rule": "crypto_trust_discount", "ticker": "TRST", "status": "open", "usd": 4_000.0, "entry": "2026-10-05",
                               "exit_due": None, "discount": -0.31, "z": None, "signal_date": "2026-10-01"},
                              {"rule": "cef_crash_discount", "ticker": "PCN", "status": "pending_entry", "usd": 0.0, "discount": -0.2,
                               "z": -3.0, "signal_date": "2026-10-02"}],
                    "waiting": [{"ticker": "PCN", "why": "no free single-name slot (2 of 2 open)"}],
                    "shadow": {"cef_crash_discount": {"label": "CEF crash-discount rule", "status": "shadow", "n": 3, "mean_excess": None,
                                                      "basis": "random entry", "promotion": {"passed": False, "checks_ok": 1, "checks_total": 4}},
                               "crypto_trust_discount": {"label": "crypto-trust discount rule", "status": "live", "n": 3, "mean_excess": 0.12,
                                                         "basis": "the coin", "promotion": {"passed": True, "checks_ok": 3, "checks_total": 3}}}}}
    keys = {s["key"]: s for s in slot_specs(facts)}
    assert {"gems_live", "gems_slot_TRST", "gems_tally_cef_crash_discount", "gems_tally_crypto_trust_discount"} <= set(keys)
    assert "gems_slot_PCN" not in keys                                      # waiting: no numbers of its own
    assert "z" not in keys["gems_slot_TRST"]["template"] and "Mon 5 Oct" in keys["gems_slot_TRST"]["literals"]
    email = render_growth({**facts, "date": "2026-10-04", "execute_date": "2026-10-05", "summary": {"orders": 0}}, {"mode": "paper"})
    text = flat(email.text)
    assert "TRST (open): $4,000 since Mon 5 Oct; discount −31% at the signal." in text
    assert "PCN: its entry waits (no free single-name slot (2 of 2 open))." in text
    assert "CEF crash-discount rule: 3 shadow trades closed, no scored excess yet; 1 of 4 promotion checks pass." in text
    assert "crypto-trust discount rule: 3 shadow trades closed, mean excess +12% over the coin; 3 of 3 promotion checks pass." in text
    assert "its promotion test passed" not in text                            # the trust rule is already live
    assert validate(email) == []
