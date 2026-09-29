"""Owner fill comments on trade issues (design §7 gates: emails handled, practice fills vs the model)."""
import pytest

from traderec import feedback


def test_parse_comment_variants():
    assert feedback.parse_comment("filled 6000 @ 766.10") == [
        {"status": "filled", "ticker": None, "dollars": 6000.0, "price": 766.10}]
    assert feedback.parse_comment("SPY filled $13,077 @ $640.49\nIEF filled 16587 @ 112.41")[1] == {
        "status": "filled", "ticker": "IEF", "dollars": 16587.0, "price": 112.41}
    assert feedback.parse_comment("Skipped, I was travelling")[0]["status"] == "skipped"
    assert feedback.parse_comment("looks good, will do it tomorrow") == []


def test_api_url():
    assert feedback.api_comments_url("https://github.com/sol008/testProject/issues/12") == \
        "https://api.github.com/repos/sol008/testProject/issues/12/comments"
    assert feedback.api_comments_url("https://example.com/x") is None


def test_fetch_without_token_is_none(monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert feedback.fetch_comments("https://github.com/a/b/issues/1") is None


def test_review_measures_handled_and_gaps():
    issues = [
        {"url": "u1", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]},
        {"url": "u2", "trade_id": "T-2", "date": "2026-10-05", "tickers": ["IEF", "GLD"]},
        {"url": "u3", "trade_id": "T-3", "date": "2026-10-09", "tickers": ["IBIT"]},
    ]
    fills = [
        {"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"},
        {"trade_id": "T-2", "ticker": "IEF", "side": "sell", "price": 100.0, "fill_date": "2026-10-06"},
    ]
    comments = {"u1": ["filled 6000 @ 700.35"], "u2": ["IEF filled 5000 @ 99.95", "GLD skipped"], "u3": []}
    out = feedback.review(issues, fills, fetch=comments.get)
    assert out["measured"] == 3 and out["handled"] == 2
    gaps = {f["ticker"]: round(f["gap_bps"], 2) for f in out["fills"]}
    assert gaps == {"SPY": 5.0, "IEF": 5.0}          # paid 5 bp more; received 5 bp less
    assert out["median_gap_bps"] == pytest.approx(5.0) and out["fills_ok"] is True


def test_review_without_github():
    out = feedback.review([{"url": "u", "trade_id": "T", "date": "2026-10-01", "tickers": ["SPY"]}], [],
                          fetch=lambda url: None)
    assert out["handled"] is None and out["fills_ok"] is None


def test_ticker_after_the_price_and_skip_with_ticker():
    assert feedback.parse_comment("filled 2500 @ 612.40 QQQ") == [
        {"status": "filled", "ticker": "QQQ", "dollars": 2500.0, "price": 612.40}]
    assert feedback.parse_comment("skipped GLD")[0]["ticker"] == "GLD"
    assert feedback.parse_comment("filled 6000 @ 766.10 thanks")[0]["ticker"] is None


def test_latest_comment_per_order_wins():
    issue = {"url": "u", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    fills = [{"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"}]
    out = feedback.review([issue], fills, fetch=lambda url: ["filled 6000 @ 770.00", "filled 6000 @ 700.07"])
    assert len(out["fills"]) == 1 and out["fills"][0]["owner"] == 700.07


# ------------------------------------------------------------------ option spreads (PHASE_B_CONTRACTS §8)

SPREAD_ISSUE = {"url": "u-m4", "trade_id": "T-2026-09-29-M4", "date": "2026-09-29", "tickers": ["XSP"]}
SPREAD_FILL = {"trade_id": "T-2026-09-29-M4", "module": "M4", "ticker": "XSP", "side": "buy", "price": 7.45,
               "dollars": 1490.0, "fill_date": "2026-09-30", "multiplier": 100}


def test_parse_spread_fill_comments():
    assert feedback.parse_comment("filled 2 @ 7.45") == [
        {"status": "filled", "ticker": None, "dollars": 2.0, "price": 7.45}]
    assert feedback.parse_comment("filled 2 @ 7.45 XSP")[0]["ticker"] == "XSP"
    assert feedback.parse_comment("XSP filled 2 contracts @ $7.50") == [
        {"status": "filled", "ticker": "XSP", "dollars": 2.0, "price": 7.5}]
    assert feedback.parse_comment("filled 1 spread @ 1.45 DAL") == [
        {"status": "filled", "ticker": "DAL", "dollars": 1.0, "price": 1.45}]
    assert feedback.parse_comment("Filled 3x @ 1.20")[0]["price"] == 1.20
    assert feedback.parse_comment("skipped XSP")[0] == {"status": "skipped", "ticker": "XSP", "dollars": None,
                                                        "price": None}


def test_spread_fills_are_measured_apart_in_bp_of_the_net_price():
    etf_issue = {"url": "u-m1", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    etf_fill = {"trade_id": "T-1", "module": "M1", "ticker": "SPY", "side": "buy", "price": 700.0,
                "fill_date": "2026-10-02"}
    comments = {"u-m1": ["filled 6000 @ 700.35"], "u-m4": ["filled 2 contracts @ 7.50 XSP"]}
    out = feedback.review([etf_issue, SPREAD_ISSUE], [etf_fill, SPREAD_FILL], fetch=comments.get)
    assert out["measured"] == 2 and out["handled"] == 2                 # a spread comment counts as handled
    assert [f["ticker"] for f in out["fills"]] == ["SPY"] and out["median_gap_bps"] == pytest.approx(5.0)
    (row,) = out["spread_fills"]
    assert row["spread"] is True and row["contracts"] == 2 and row["owner"] == 7.50 and row["model"] == 7.45
    assert row["gap_bps"] == pytest.approx(67.11, abs=0.01)             # (7.50 / 7.45 - 1) x 10,000: bp of the debit
    assert row["gap_usd"] == pytest.approx(5.0)                         # $0.05 per share = $5 per contract
    assert out["spread_median_gap_bps"] == pytest.approx(67.11, abs=0.01)
    assert out["spread_fills_ok"] is True and out["fills_ok"] is True


def test_spread_gate_has_its_own_tolerance():
    too_dear = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["filled 2 @ 7.80"])
    assert too_dear["spread_median_gap_bps"] > feedback.SPREAD_FILL_TOLERANCE_BPS
    assert too_dear["spread_fills_ok"] is False and too_dear["fills_ok"] is False
    assert too_dear["median_gap_bps"] is None                           # no ETF fill measured
    skipped = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["skipped"])
    assert skipped["handled"] == 1 and skipped["spread_fills"] == [] and skipped["fills_ok"] is None


def test_spread_price_per_contract_and_closing_gap_sign():
    per_contract = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["filled 2 @ 745"])
    assert per_contract["spread_fills"][0]["owner"] == pytest.approx(7.45)
    assert per_contract["spread_fills"][0]["gap_bps"] == pytest.approx(0.0)
    close_issue = dict(SPREAD_ISSUE, url="u-exit", date="2026-12-16")
    close_fill = dict(SPREAD_FILL, side="sell", price=12.30, fill_date="2026-12-17")
    out = feedback.review([close_issue], [SPREAD_FILL, close_fill], fetch=lambda url: ["filled 2 @ 12.20"])
    (row,) = out["spread_fills"]
    assert row["model"] == 12.30                                        # the close, not the opening fill
    assert row["gap_bps"] == pytest.approx(81.30, abs=0.01)             # received less: worse, so positive
    assert row["gap_usd"] == pytest.approx(10.0)


def test_spread_fills_are_recognised_without_the_spread_keys():
    base = {"trade_id": "T", "ticker": "SPY", "side": "buy", "price": 9.8, "fill_date": "2026-10-02"}
    assert feedback.is_spread_fill({**base, "module": "W8"})           # Phase A keys only: a spread-only module
    assert feedback.is_spread_fill({**base, "module": "X1", "multiplier": 100})
    assert feedback.is_spread_fill({**base, "module": "X1", "order_type": "spread_limit"})
    assert not feedback.is_spread_fill({**base, "module": "M1"})
    assert not feedback.is_spread_fill({**base, "module": "M1", "multiplier": 1})
    etf_only = feedback.review([{"url": "u", "trade_id": "T", "date": "2026-10-01", "tickers": ["SPY"]}],
                               [dict(base, module="M1", price=700.0)], fetch=lambda url: ["filled 6000 @ 700.07"])
    assert etf_only["spread_fills"] == [] and etf_only["spread_fills_ok"] is None and etf_only["fills_ok"] is True
