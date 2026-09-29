"""Owner fill comments on trade issues (design §7 gates: emails handled, practice fills vs the model).

The fills gate is track 18 §5.4(3) as pre-registered: ETFs on the AVERAGE gap (at most 10 bp), option spreads on the
AVERAGE gap in half-spreads (at most 20% of the half-spread, the half-spread being half the natural width the paper
fill stored). A comment line that fails a check is set aside with a logged reason, so one typo cannot decide the gate.
"""
import logging

import pytest

from traderec import feedback


def fields(rows):
    """parse_comment rows without the matched line text."""
    return [{k: v for k, v in r.items() if k != "line"} for r in rows]


def test_parse_comment_variants():
    assert fields(feedback.parse_comment("filled 6000 @ 766.10")) == [
        {"status": "filled", "ticker": None, "dollars": 6000.0, "price": 766.10}]
    assert fields(feedback.parse_comment("SPY filled $13,077 @ $640.49\nIEF filled 16587 @ 112.41"))[1] == {
        "status": "filled", "ticker": "IEF", "dollars": 16587.0, "price": 112.41}
    assert feedback.parse_comment("Skipped, I was travelling")[0]["status"] == "skipped"
    assert feedback.parse_comment("looks good, will do it tomorrow") == []
    assert feedback.parse_comment("filled 6000 @ 766.10.")[0]["price"] == 766.10       # a full stop is not a digit
    assert feedback.parse_comment("filled 2 @ 7.45 XSP")[0]["line"] == "filled 2 @ 7.45 XSP"


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
    assert out["n"] == 2 and out["mean_gap_bps"] == pytest.approx(5.0)
    assert out["median_gap_bps"] == pytest.approx(5.0) and out["fills_ok"] is True and out["etf_fills_ok"] is True


def test_review_without_github():
    out = feedback.review([{"url": "u", "trade_id": "T", "date": "2026-10-01", "tickers": ["SPY"]}], [],
                          fetch=lambda url: None)
    assert out["handled"] is None and out["fills_ok"] is None


def test_ticker_after_the_price_and_skip_with_ticker():
    assert fields(feedback.parse_comment("filled 2500 @ 612.40 QQQ")) == [
        {"status": "filled", "ticker": "QQQ", "dollars": 2500.0, "price": 612.40}]
    assert feedback.parse_comment("skipped GLD")[0]["ticker"] == "GLD"
    assert feedback.parse_comment("filled 6000 @ 766.10 thanks")[0]["ticker"] is None
    assert feedback.parse_comment("not skipped, filled 2 @ 7.45") == []          # a sentence, not a skip line
    assert feedback.parse_comment("Filled 2 @ 7.45 xsp")[0]["ticker"] is None     # lower case: not read as a ticker


def test_latest_comment_per_order_wins():
    issue = {"url": "u", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    fills = [{"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"}]
    out = feedback.review([issue], fills, fetch=lambda url: ["filled 6000 @ 770.00", "filled 6000 @ 700.07"])
    assert len(out["fills"]) == 1 and out["fills"][0]["owner"] == 700.07


# --------------------------------------------------------------- the ETF rule: the AVERAGE gap (track 18 §5.4(3))

ETF_ISSUES = [{"url": f"u{i}", "trade_id": f"T-{i}", "date": "2026-10-01", "tickers": ["SPY"]} for i in range(3)]
ETF_FILLS = [{"trade_id": f"T-{i}", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"}
             for i in range(3)]


def test_etf_gate_is_the_average_gap_not_the_median():
    """Fills at 0, 0 and +40 bp: the median |gap| is 0 bp, but the average is +13.3 bp, so the rule fails."""
    comments = {"u0": ["filled 6000 @ 700"], "u1": ["filled 6000 @ 700"], "u2": ["filled 6000 @ 702.80"]}
    out = feedback.review(ETF_ISSUES, ETF_FILLS, fetch=comments.get)
    assert out["median_gap_bps"] == pytest.approx(0.0)
    assert out["mean_gap_bps"] == pytest.approx(40.0 / 3)
    assert out["etf_fills_ok"] is False and out["fills_ok"] is False


def test_etf_gate_is_one_sided():
    """Fills better than the model pass: the rule's remedy is a more conservative model, which they don't call for."""
    comments = {f"u{i}": ["filled 6000 @ 697.20"] for i in range(3)}              # 40 bp better each time
    out = feedback.review(ETF_ISSUES, ETF_FILLS, fetch=comments.get)
    assert out["mean_gap_bps"] == pytest.approx(-40.0) and out["fills_ok"] is True
    at_limit = feedback.review(ETF_ISSUES, ETF_FILLS, fetch=lambda url: ["filled 6000 @ 700.70"])
    assert at_limit["mean_gap_bps"] == pytest.approx(10.0) and at_limit["fills_ok"] is True     # "at most 10 bp"


# ------------------------------------------------------------------ option spreads (PHASE_B_CONTRACTS §8)

SPREAD_ISSUE = {"url": "u-m4", "trade_id": "T-2026-09-29-M4", "date": "2026-09-29", "tickers": ["XSP"]}
# the paper fill as options/job.py stores it: 2 contracts at 7.45 with a natural width of 0.50 (half-spread 0.25)
SPREAD_FILL = {"trade_id": "T-2026-09-29-M4", "module": "M4", "ticker": "XSP", "side": "buy", "price": 7.45,
               "dollars": 1490.0, "fill_date": "2026-09-30", "multiplier": 100, "qty": 2.0, "natural_width": 0.50,
               "order_type": "spread_limit"}


def test_parse_spread_fill_comments():
    assert fields(feedback.parse_comment("filled 2 @ 7.45")) == [
        {"status": "filled", "ticker": None, "dollars": 2.0, "price": 7.45}]
    assert feedback.parse_comment("filled 2 @ 7.45 XSP")[0]["ticker"] == "XSP"
    assert fields(feedback.parse_comment("XSP filled 2 contracts @ $7.50")) == [
        {"status": "filled", "ticker": "XSP", "dollars": 2.0, "price": 7.5}]
    assert fields(feedback.parse_comment("filled 1 spread @ 1.45 DAL")) == [
        {"status": "filled", "ticker": "DAL", "dollars": 1.0, "price": 1.45}]
    assert feedback.parse_comment("Filled 3x @ 1.20")[0]["price"] == 1.20
    assert fields(feedback.parse_comment("skipped XSP"))[0] == {"status": "skipped", "ticker": "XSP", "dollars": None,
                                                                "price": None}
    assert feedback.parse_comment("filled -2 @ 7.45")[0]["dollars"] == -2.0        # parsed, then rejected
    bad = feedback.parse_comment("filled 2 @ 7.45.5")[0]
    assert bad["price"] is None and "not a number" in bad["problem"]


def test_spread_fills_are_measured_apart_in_half_spreads():
    etf_issue = {"url": "u-m1", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    etf_fill = {"trade_id": "T-1", "module": "M1", "ticker": "SPY", "side": "buy", "price": 700.0,
                "fill_date": "2026-10-02"}
    comments = {"u-m1": ["filled 6000 @ 700.35"], "u-m4": ["filled 2 contracts @ 7.50 XSP"]}
    out = feedback.review([etf_issue, SPREAD_ISSUE], [etf_fill, SPREAD_FILL], fetch=comments.get)
    assert out["measured"] == 2 and out["handled"] == 2                 # a spread comment counts as handled
    assert [f["ticker"] for f in out["fills"]] == ["SPY"] and out["mean_gap_bps"] == pytest.approx(5.0)
    (row,) = out["spread_fills"]
    assert row["spread"] is True and row["contracts"] == 2 and row["owner"] == 7.50 and row["model"] == 7.45
    assert row["gap_bps"] == pytest.approx(67.11, abs=0.01)             # (7.50 / 7.45 - 1) x 10,000: bp of the debit
    assert row["gap_usd"] == pytest.approx(5.0)                         # $0.05 per share = $5 per contract
    assert row["half_spread"] == pytest.approx(0.25)
    assert row["gap_half_spread"] == pytest.approx(0.20)                # $0.05 of a $0.25 half-spread
    assert out["spread_n"] == 1 and out["spread_median_gap_bps"] == pytest.approx(67.11, abs=0.01)
    assert out["spread_mean_gap_half_spread"] == pytest.approx(0.20)
    assert out["spread_fills_ok"] is True and out["fills_ok"] is True   # 20% of the half-spread: at the limit


def test_spread_gate_is_the_average_gap_in_half_spreads():
    too_dear = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["filled 2 @ 7.55"])
    assert too_dear["spread_mean_gap_half_spread"] == pytest.approx(0.40)
    assert too_dear["spread_fills_ok"] is False and too_dear["fills_ok"] is False
    assert too_dear["mean_gap_bps"] is None and too_dear["etf_fills_ok"] is None     # no ETF fill measured
    better = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["filled 2 @ 7.30"])
    assert better["spread_mean_gap_half_spread"] == pytest.approx(-0.60) and better["fills_ok"] is True
    skipped = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: ["skipped"])
    assert skipped["handled"] == 1 and skipped["spread_fills"] == [] and skipped["fills_ok"] is None


def test_a_spread_fill_without_a_natural_width_is_reported_but_not_averaged():
    no_width = {k: v for k, v in SPREAD_FILL.items() if k != "natural_width"}
    out = feedback.review([SPREAD_ISSUE], [no_width], fetch=lambda url: ["filled 2 @ 7.50"])
    assert out["spread_n"] == 1 and out["spread_measured"] == 0
    assert out["spread_fills"][0]["gap_half_spread"] is None
    assert out["spread_fills_ok"] is None and out["fills_ok"] is None                  # not measured: fail closed


@pytest.mark.parametrize("comment, per_share, typed", [
    ("filled 2 @ 7.45", 7.45, "per share"),
    ("filled 2 @ 745", 7.45, "per contract"),
    ("filled 2 @ 1490", 7.45, "total"),           # the email's own "total should be about $1,490"
    ("filled 2 @ 1500", 7.50, "total"),
    ("filled 1 @ 745", 7.45, "per contract"),
])
def test_spread_price_per_share_per_contract_or_total(comment, per_share, typed):
    (row,) = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: [comment])["spread_fills"]
    assert row["owner"] == pytest.approx(per_share) and row["typed"] == typed


def test_closing_gap_sign_and_totals():
    close_issue = dict(SPREAD_ISSUE, url="u-exit", date="2026-12-16")
    close_fill = dict(SPREAD_FILL, side="sell", price=12.30, fill_date="2026-12-17", dollars=2460.0)
    out = feedback.review([close_issue], [SPREAD_FILL, close_fill], fetch=lambda url: ["filled 2 @ 12.20"])
    (row,) = out["spread_fills"]
    assert row["model"] == 12.30                                        # the close, not the opening fill
    assert row["gap_bps"] == pytest.approx(81.30, abs=0.01)             # received less: worse, so positive
    assert row["gap_usd"] == pytest.approx(10.0) and row["gap_half_spread"] == pytest.approx(0.40)
    total = feedback.review([close_issue], [SPREAD_FILL, close_fill], fetch=lambda url: ["filled 2 @ 2460"])
    assert total["spread_fills"][0]["owner"] == pytest.approx(12.30) and total["spread_fills"][0]["gap_bps"] == 0


@pytest.mark.parametrize("comment, reason", [
    ("filled 0 @ 7.45", "whole number of at least one"),
    ("filled 2.5 @ 7.45", "whole number of at least one"),
    ("filled -2 @ 7.45", "whole number of at least one"),
    ("filled 3 @ 7.45", "more than the order's 2"),
    ("filled 1490 @ 7.45", "more than the order's 2"),         # the ETF habit: dollars in the contracts slot
    ("filled 2 @ 0", "above zero"),
    ("filled 2 @ -7.45", "above zero"),
    ("filled 2 @ 7.45.5", "not a number"),
    ("filled 2 @ 74.5", "more than 50%"),                      # a slipped decimal
    ("filled 2 @ 0.745", "more than 50%"),
    ("filled 2 @ 7.45 SPY", "SPY is not an order in this email"),
])
def test_nonsense_spread_comments_are_rejected_with_a_logged_reason(comment, reason, caplog):
    with caplog.at_level(logging.WARNING, logger="traderec.feedback"):
        out = feedback.review([SPREAD_ISSUE], [SPREAD_FILL], fetch=lambda url: [comment])
    assert out["spread_fills"] == [] and out["fills_ok"] is None and out["handled"] == 1
    (rej,) = out["rejected"]
    assert reason in rej["reason"] and rej["line"] and rej["trade_id"] == SPREAD_ISSUE["trade_id"]
    assert any(reason in r.getMessage() for r in caplog.records)


def test_without_the_orders_count_a_sanity_cap_applies():
    bare = {k: v for k, v in SPREAD_FILL.items() if k not in ("qty", "dollars")}
    ok = feedback.review([SPREAD_ISSUE], [bare], fetch=lambda url: ["filled 20 @ 7.45"])
    assert ok["spread_fills"][0]["contracts"] == 20
    capped = feedback.review([SPREAD_ISSUE], [bare], fetch=lambda url: ["filled 200 @ 7.45"])
    assert capped["spread_fills"] == [] and "sanity cap" in capped["rejected"][0]["reason"]


def test_one_typo_cannot_decide_the_gate():
    """The reviewer's case: a total typed in used to read as $14.90 (a +100% gap) and decide the spread gate."""
    issues = [dict(SPREAD_ISSUE, url=k, trade_id=f"T{k}") for k in "abc"]
    models = [dict(SPREAD_FILL, trade_id=f"T{k}") for k in "abc"]
    comments = {"a": ["filled 2 @ 1490"], "b": ["filled 2 @ 7.45"], "c": ["filled 2 @ 74.5"]}
    out = feedback.review(issues, models, fetch=comments.get)
    assert [r["owner"] for r in out["spread_fills"]] == pytest.approx([7.45, 7.45])
    assert out["spread_mean_gap_half_spread"] == pytest.approx(0.0) and out["fills_ok"] is True
    assert [r["line"] for r in out["rejected"]] == ["filled 2 @ 74.5"]


def test_etf_comments_are_checked_too():
    issue = {"url": "u", "trade_id": "T-1", "date": "2026-10-01", "tickers": ["SPY"]}
    fill = [{"trade_id": "T-1", "ticker": "SPY", "side": "buy", "price": 700.0, "fill_date": "2026-10-02"}]
    for comment, reason in (("filled 0 @ 700", "dollar amount"), ("filled 6000 @ 70.03", "more than 50%"),
                            ("filled 6000 @ 0", "above zero")):
        out = feedback.review([issue], fill, fetch=lambda url, c=comment: [c])
        assert out["fills"] == [] and reason in out["rejected"][0]["reason"], comment


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
