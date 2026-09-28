#!/usr/bin/env python3
"""Monthly LLM cost model for the trade-recommendation system (track 09).

Prices: Claude API list prices from https://platform.claude.com/docs/en/about-claude/pricing
(accessed 2026-09-28). Web search = $10 per 1,000 searches; web fetch = tokens only.
Token volumes below are ASSUMPTIONS (documented inline), not measurements -- re-baseline with
response.usage once the pipeline exists.

Usage: python3 cost_model.py
"""
from dataclasses import dataclass

PRICES = {  # USD per million tokens
    #                 input  output  cache_write_5m  cache_read
    "claude-opus-5-5":   (4.00, 20.00, 5.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 2.50, 0.20),
    "claude-haiku-4-5":  (1.00,  5.00, 1.25, 0.10),
}
WEB_SEARCH_USD = 10.0 / 1000
BATCH_DISCOUNT = 0.5  # Batch API: 50% off tokens (not used for time-sensitive daily scan)


@dataclass
class Run:
    """Token profile of ONE run of a pipeline stage (summed over all API calls in that run)."""
    uncached_in: int      # fresh input tokens (fact sheets, tool results not yet cached)
    cache_write: int      # prefix written to 5-min cache (system prompt + tools + early turns)
    cache_read: int       # prefix re-read on later turns of the same agentic loop
    out: int              # output tokens INCLUDING thinking tokens
    searches: int = 0     # server-side web_search calls


def run_cost(model: str, r: Run, batch: bool = False) -> float:
    pin, pout, pcw, pcr = PRICES[model]
    tok = (r.uncached_in * pin + r.cache_write * pcw + r.cache_read * pcr + r.out * pout) / 1e6
    if batch:
        tok *= BATCH_DISCOUNT
    return tok + r.searches * WEB_SEARCH_USD


# ---- Assumed workloads ------------------------------------------------------------------
TRADING_DAYS = 21
SCENARIOS = {
    # Deterministic screens emit few candidates; one short LLM triage call, 2 searches.
    "lean":  dict(triage=Run(20_000, 8_000, 0, 3_000, 2),        recs_per_month=2),
    # Agentic loop (~6 turns): news check on up to 5 candidates, 6 searches.
    "base":  dict(triage=Run(40_000, 15_000, 90_000, 10_000, 6),  recs_per_month=4),
    # Busy market: 15 candidates, 15 searches, long tool results.
    "heavy": dict(triage=Run(120_000, 30_000, 350_000, 25_000, 15), recs_per_month=8),
}
# Per recommended trade: Opus writes the plain-English email from the fact sheet (+1 retry
# if the number validator rejects the draft).
WRITE_UP = Run(35_000, 0, 0, 8_000, 0)
WRITE_UP_RETRY_RATE = 0.5
# Monthly calibration: ledger + metrics tables (computed in Python) -> review + proposed
# parameter changes + monthly report. Several calls; not latency-sensitive (batch-able).
CALIBRATION = Run(250_000, 20_000, 100_000, 40_000, 5)


def monthly(triage_model: str, scen: dict, writer: str = "claude-opus-5-5",
            calib_model: str = "claude-opus-5-5", calib_batch: bool = False) -> dict:
    daily = run_cost(triage_model, scen["triage"]) * TRADING_DAYS
    recs = run_cost(writer, WRITE_UP) * scen["recs_per_month"] * (1 + WRITE_UP_RETRY_RATE)
    calib = run_cost(calib_model, CALIBRATION, batch=calib_batch)
    return {"daily_scan": daily, "trade_writeups": recs, "monthly_calibration": calib,
            "total": daily + recs + calib}


def main():
    print("Monthly Claude API cost (USD), 21 trading days; writer+calibration on claude-opus-5-5\n")
    hdr = f"{'scenario':8s} {'triage model':18s} {'daily scan':>11s} {'write-ups':>10s} {'calibration':>12s} {'TOTAL':>8s}"
    print(hdr)
    print("-" * len(hdr))
    for sname, scen in SCENARIOS.items():
        for m in PRICES:
            c = monthly(m, scen)
            print(f"{sname:8s} {m:18s} {c['daily_scan']:11.2f} {c['trade_writeups']:10.2f} "
                  f"{c['monthly_calibration']:12.2f} {c['total']:8.2f}")
    print("\nPer-run costs (single call-set):")
    for sname, scen in SCENARIOS.items():
        for m in PRICES:
            print(f"  triage/{sname:5s} on {m:18s}: ${run_cost(m, scen['triage']):.3f}")
    print(f"  one trade write-up on opus-5-5  : ${run_cost('claude-opus-5-5', WRITE_UP):.3f}")
    print(f"  calibration on opus-5-5          : ${run_cost('claude-opus-5-5', CALIBRATION):.3f}"
          f" (batch: ${run_cost('claude-opus-5-5', CALIBRATION, batch=True):.3f})")


if __name__ == "__main__":
    main()
