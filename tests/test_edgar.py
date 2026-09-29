"""EDGAR/FINRA shadow screens: parsers on recorded fixtures, the screen rules, scoring, the promotion tests, the
HTTP client (User-Agent, pacing, retries, budget) and the runner end to end (offline).

Fixtures (tests/fixtures/edgar/) are real EDGAR/FINRA payloads recorded on 29 Sep 2026, trimmed: EFTS search results
keep the fields the adapter reads, larger HTML documents lose their attributes and hidden XBRL header, the Avanos
merger proxy is cut to the two paragraphs used, and e-mail addresses are removed. Prices are synthetic.
"""
from __future__ import annotations

import json as jsonlib
import re
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from traderec import pipeline
from traderec.config import load_config
from traderec.data import FakeProvider, LiveProvider
from traderec.data import edgar as E
from traderec.market_calendar import ET, is_trading_day
from traderec.modules import edgar_screens as S
from traderec.runners import edgar as R
from traderec.state import save_state

FX = Path(__file__).parent / "fixtures" / "edgar"
EMPTY = {"hits": {"total": {"value": 0, "relation": "eq"}, "hits": []}}


def fx_json(name: str):
    return jsonlib.loads((FX / name).read_text(encoding="utf-8"))


def fx_text(name: str) -> str:
    return (FX / name).read_text(encoding="utf-8", errors="ignore")


def doc_text(name: str) -> str:
    return E.html_to_text(fx_text(name))


# ----------------------------------------------------------------------------------------------------------
# Fakes: an SEC/FINRA session serving the recorded payloads, and synthetic daily bars
# ----------------------------------------------------------------------------------------------------------

class Resp:
    def __init__(self, status: int = 200, body: bytes | str = b"", ctype: str = "application/json") -> None:
        self.status_code = status
        self.content = body if isinstance(body, bytes) else body.encode("utf-8")
        self.headers = {"content-type": ctype}

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def json(self):
        return jsonlib.loads(self.content)


class FakeSec:
    """Serves recorded payloads by URL. An unregistered search is empty; an unregistered document is a 404."""

    def __init__(self) -> None:
        self.searches: dict[tuple, dict] = {}
        self.files: dict[tuple[str, str], bytes] = {}
        self.json: dict[str, object] = {}
        self.status: dict[str, int] = {}          # URL fragment -> forced HTTP status
        self.calls: list[tuple[str, dict, dict]] = []

    def search(self, forms: str, start: str, payload: dict | str, *, end: str | None = None, q: str = "",
               ciks: str = "") -> None:
        self.searches[(forms, start, end or start, q, ciks)] = fx_json(payload) if isinstance(payload, str) else payload

    def load_documents(self) -> "FakeSec":
        for p in FX.iterdir():
            m = re.match(r"^(?:doc|form4)_(\d{10}-\d{2}-\d{6})_(.+)$", p.name)
            if m:
                self.files[(m.group(1).replace("-", ""), m.group(2))] = p.read_bytes()
            m = re.match(r"^submissions_(\d+)\.json$", p.name)
            if m:
                self.json[E.SUBMISSIONS_URL.format(cik=int(m.group(1)))] = fx_json(p.name)
            m = re.match(r"^concept_(\d+)\.json$", p.name)
            if m:
                self.json[E.CONCEPT_URL.format(cik=int(m.group(1)), taxonomy="dei",
                                               tag="EntityCommonStockSharesOutstanding")] = fx_json(p.name)
        return self

    def get(self, url, params=None, headers=None, timeout=None, **kwargs):
        params = dict(params or {})
        self.calls.append((url, params, dict(headers or {})))
        for frag, status in self.status.items():
            if frag in url:
                return Resp(status, "<html><title>Refused by the test</title></html>", "text/html")
        if url == E.EFTS_URL:
            if params.get("from"):
                return Resp(200, jsonlib.dumps(EMPTY))
            key = (params["forms"], params["startdt"], params["enddt"], params.get("q", ""), params.get("ciks", ""))
            return Resp(200, jsonlib.dumps(self.searches.get(key, EMPTY)))
        if "/Archives/edgar/data/" in url:
            key = tuple(url.split("/")[-2:])
            return Resp(200, self.files[key], "text/html") if key in self.files else Resp(404, "nope", "text/html")
        if url in self.json:
            return Resp(200, jsonlib.dumps(self.json[url]))
        return Resp(404, "{}")

    def archive_calls(self) -> int:
        return sum(1 for url, _, _ in self.calls if "/Archives/" in url)


class FakeFinra:
    def __init__(self, rows: dict[str, list] | None = None, files: dict[str, str] | None = None) -> None:
        self.rows, self.files, self.calls = rows or {}, files or {}, []

    def post(self, url, json=None, headers=None, timeout=None):
        sym = json["compareFilters"][0]["fieldValue"]
        self.calls.append(("post", sym))
        rows = self.rows.get(sym)
        return Resp(200, jsonlib.dumps(rows)) if rows is not None else Resp(204, "")

    def get(self, url, headers=None, timeout=None, **kwargs):
        self.calls.append(("get", url))
        for frag, text in self.files.items():
            if frag in url:
                return Resp(200, text, "text/csv")
        return Resp(403, "<Error>AccessDenied</Error>", "application/xml")


def sessions(start: str, end: str) -> pd.DatetimeIndex:
    return pd.DatetimeIndex([d for d in pd.date_range(start, end, freq="B") if is_trading_day(d)])


def make_bars(start: str, end: str, price: float, *, drift: float = 0.0, volume: float = 100_000.0,
              dividends: dict[str, float] | None = None, prices: dict[str, float] | None = None) -> pd.DataFrame:
    """Synthetic bars: closes growing by `drift` a session, opens at 1.001x the prior close, yfinance-style
    adj_close for `dividends` (ex-date -> per-share amount)."""
    idx = sessions(start, end)
    close = pd.Series(price * (1.0 + drift) ** np.arange(len(idx)), index=idx)
    for day, px in (prices or {}).items():
        close[pd.Timestamp(day)] = px
    open_ = close.shift(1).fillna(close.iloc[0]) * 1.001
    factor = pd.Series(1.0, index=idx)
    for day, amount in sorted((dividends or {}).items()):
        t = pd.Timestamp(day)
        prev = float(close[close.index < t].iloc[-1])
        factor[factor.index < t] *= 1.0 - amount / prev
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close) * 1.01,
                         "low": np.minimum(open_, close) * 0.99, "close": close, "adj_close": close * factor,
                         "volume": volume})


@pytest.fixture()
def cfg():
    return load_config()


def no_sleep(_s: float) -> None:
    return None


def world(tmp_path: Path, cfg, bars: dict[str, pd.DataFrame], sec: FakeSec, finra: FakeFinra | None = None,
          created: str = "2025-01-02"):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created=created)
    provider = FakeProvider(bars=bars, tbill_rate=0.04)
    provider.edgar = E.EdgarClient(session=sec, sleep=no_sleep, workers=2)
    provider.finra = E.FinraClient(session=finra or FakeFinra(), sleep=no_sleep)
    return state_dir, provider


def run_day(cfg, state_dir: Path, provider, day: str, monkeypatch, hour: int = 22, minute: int = 30):
    y, m, d = (int(x) for x in day.split("-"))
    monkeypatch.setattr(R, "_now_et", lambda: datetime(y, m, d, hour, minute, tzinfo=ET))
    run = pipeline.Run(cfg, provider, state_dir, "daily", day)
    R.daily(run, {})
    save_state(run.paths.state, run.state)
    return run


def run_days(cfg, state_dir, provider, start: str, end: str, monkeypatch):
    last = None
    for day in sessions(start, end):
        last = run_day(cfg, state_dir, provider, day.strftime("%Y-%m-%d"), monkeypatch)
    return last


def book(run) -> dict:
    return run.state["shadow"]["EDGAR"]


def shadow_records(run, event: str | None = None) -> list[dict]:
    recs = [r["payload"] for r in run.ledger.records("shadow") if r["payload"].get("book") == "EDGAR"]
    return [r for r in recs if event is None or r.get("event") == event]


# ----------------------------------------------------------------------------------------------------------
# Parsers on recorded payloads
# ----------------------------------------------------------------------------------------------------------

def test_display_name_and_efts_grouping():
    assert E.display_name("Colliers International Group Inc.  (CIGI)  (CIK 0000913353)") == {
        "name": "Colliers International Group Inc.", "tickers": ["CIGI"], "cik": 913353}
    assert E.display_name("REDWOOD TRUST INC  (RWT, RWTN, RWT-PA)  (CIK 0000930236)")["tickers"] == [
        "RWT", "RWTN", "RWT-PA"]
    assert E.display_name("MacLeod Alan Robert  (CIK 0002154450)") == {
        "name": "MacLeod Alan Robert", "tickers": [], "cik": 2154450}
    hits, total = E.parse_efts(fx_json("efts_13d_20250904.json"))
    assert total == len(hits)
    originals = E.group_filings(hits, forms=("SCHEDULE 13D",))
    assert [f["entities"][0]["tickers"] for f in originals] == [["OCG"], ["GEG", "GEGGL"], ["BILL"]]
    bill = originals[-1]
    assert bill["entities"][1]["name"] == "Starboard Value LP" and bill["docs"][0]["filename"] == "primary_doc.xml"
    assert all(f["form"] == "SCHEDULE 13D" for f in originals)          # amendments dropped
    with pytest.raises(E.DataError):
        E.parse_efts({"message": "Internal server error"})


def test_parse_form4_and_purchase_rules():
    cme = E.parse_form4((FX / "form4_0001212852-26-000005_wk-form4_1790626530.xml").read_bytes())
    assert cme["issuer"] == {"cik": 1156375, "name": "CME GROUP INC.", "symbol": "CME"}
    assert cme["owners"][0]["director"] and not cme["owners"][0]["officer"]
    assert [t["code"] for t in cme["transactions"]] == ["J", "J", "P"]
    p = S.form4_purchase(cme, "2026-09-28", "0001212852-26-000005")
    assert p["shares"] == pytest.approx(292.55) and p["value"] == pytest.approx(292.55 * 268.76)
    assert p["first_trade"] == p["last_trade"] == "2026-09-25"            # the Form 5 "J" lines are excluded
    saba = E.parse_form4((FX / "form4_0001510281-26-000313_primary_doc.xml").read_bytes())
    assert saba["owners"][0]["ten_pct"] and S.form4_purchase(saba, "2026-09-28", "x") is None   # 10% holder only
    qvc = E.parse_form4((FX / "form4_0001493152-26-044626_ownership.xml").read_bytes())
    assert len(qvc["owners"]) >= 2 and S.form4_purchase(qvc, "2026-09-28", "x") is None
    lowry = E.parse_form4((FX / "form4_0001628280-26-063744_wk-form4_1790629729.xml").read_bytes())
    p = S.form4_purchase(lowry, "2026-09-28", "a")
    assert p["owner"] == "Lowry Robert T" and p["officer"] and p["vwap"] == pytest.approx(43.48)
    assert S.form4_purchase(lowry, "2026-10-12", "a") is None               # filed 17 days after the trade
    amended = dict(lowry, document_type="4/A")
    assert S.form4_purchase(amended, "2026-09-28", "a") is None
    with pytest.raises(E.DataError):
        E.parse_form4("<ownershipDocument><broken")


def test_insider_cluster_window_lockout_and_distinct_owners():
    def buy(owner, day, value=10_000.0):
        return {"owner_cik": owner, "date": day, "adsh": f"{owner}-{day}", "shares": value / 10, "value": value,
                "top": owner == 1}

    ps = [buy(1, "2026-01-02"), buy(1, "2026-01-20")]
    assert S.insider_cluster(ps) is None                                    # one insider twice is not a cluster
    ps.append(buy(2, "2026-01-31"))                                         # day 30 of 1-02's window
    cl = S.insider_cluster(ps)
    assert cl["date"] == "2026-01-31" and cl["insiders"] == 2 and cl["n_top"] == 1
    assert cl["completing"] == ["2-2026-01-31"] and cl["value"] == pytest.approx(30_000.0)
    late = [buy(1, "2026-01-02"), buy(2, "2026-02-01")]                     # day 31: outside the window
    assert S.insider_cluster(late) is None
    assert S.insider_cluster(ps, not_before="2026-02-01") is None           # locked out until then
    assert S.insider_cluster(ps + [buy(3, "2026-02-10")], not_before="2026-02-01")["date"] == "2026-02-10"


def test_parse_special_dividend_declarations_only():
    esp = E.parse_special_dividend(doc_text("doc_0001174947-26-000848_ex99-1.htm"))
    assert (esp["amount"], esp["record_date"], esp["payable_date"], esp["contingent"]) == (
        0.75, "2026-09-18", "2026-09-25", False)
    assert E.parse_special_dividend(doc_text("doc_0001174947-26-000848_form8k-36314_esp.htm"))["amount"] == 0.75
    indv = E.parse_special_dividend(doc_text("doc_0001104659-26-108417_tm2623753d7_ex99-1.htm"))
    assert indv["amount"] == 8.13 and indv["record_date"] == "2026-10-30" and indv["contingent"]
    for name in ("doc_0001437749-26-030186_ex_1014976.htm",       # earnings release: a special dividend already paid
                 "doc_0001104659-26-106725_sga-20260910xex99d1.htm",   # a regular quarterly dividend
                 "doc_0001104659-26-099202_tm2623702d1_ex99.htm"):      # mentions a past special dividend
        assert E.parse_special_dividend(doc_text(name)) is None, name
    text = ("The Board declared a special dividend of $2.00 per share, payable on November 3, 2026 to holders of "
            "record at the close of business on October 20, 2026. The ex-dividend date is October 20, 2026.")
    assert E.parse_special_dividend(text)["ex_date"] == "2026-10-20"


def test_special_dividend_ex_date_and_check():
    parsed = {"amount": 0.75, "record_date": "2026-09-18", "payable_date": "2026-09-25", "ex_date": None,
              "contingent": False}
    assert S.special_dividend_ex_date(parsed, 45.0) == ("2026-09-18", "record date (T+1)")
    assert S.special_dividend_ex_date(dict(parsed, record_date="2026-09-19"), 45.0)[0] == "2026-09-18"  # a Saturday
    big = dict(parsed, amount=12.0)                                     # >= 25% of the price: ex after payment
    assert S.special_dividend_ex_date(big, 45.0)[0] == "2026-09-28"
    assert S.special_dividend_ex_date(dict(parsed, ex_date="2026-09-17"), 45.0)[0] == "2026-09-17"
    divs = {d: 0.25 for d in ("2024-12-10", "2025-03-10", "2025-06-10", "2025-09-10", "2025-12-10", "2026-03-10",
                              "2026-06-10")}
    bars = make_bars("2024-06-03", "2026-09-08", 45.0, dividends=divs)
    assert S.infer_dividends(bars).round(4).tolist() == [0.25] * 7
    ok = S.special_dividend_check(parsed, bars, "2026-09-08", 45.0, R.DEFAULTS["SH2"])
    assert ok["ok"] and ok["exit_due"] == "2026-09-17" and ok["regular_median"] == pytest.approx(0.25)
    small = S.special_dividend_check(dict(parsed, amount=0.30), bars, "2026-09-08", 45.0, R.DEFAULTS["SH2"])
    assert not small["ok"] and any("median regular dividend" in r for r in small["reasons"])
    far = S.special_dividend_check(dict(parsed, record_date="2026-12-31"), bars, "2026-09-08", 45.0,
                                   R.DEFAULTS["SH2"])
    assert any("outside 3-75" in r for r in far["reasons"])
    cont = S.special_dividend_check(dict(parsed, contingent=True), bars, "2026-09-08", 45.0, R.DEFAULTS["SH2"])
    assert any("contingent" in r for r in cont["reasons"])


def test_parse_merger_terms_and_updates():
    terms = E.parse_merger_terms(doc_text("doc_0001104659-26-072432_tm2614353-2_defm14a.htm"))
    assert (terms["cash"], terms["stock"], terms["cvr"], terms["financing_condition"]) == (25.0, False, False, False)
    mixed = E.parse_merger_terms("Each share will be converted into the right to receive (i) $10.00 in cash and "
                                 "(ii) 0.25 shares of Parent Class A common stock. The merger is subject to a "
                                 "financing condition.")
    assert mixed["cash"] == 10.0 and mixed["stock"] and mixed["financing_condition"] is True
    cvr = E.parse_merger_terms("converted into the right to receive $4.00 in cash plus one contingent value right")
    assert cvr["cvr"] and not cvr["stock"] and cvr["financing_condition"] is None
    vote = E.parse_merger_update(doc_text("doc_0001606498-26-000096_avns-20260722.htm"), ["5.07", "7.01", "9.01"])
    assert vote["vote"] == "approved" and vote["regulatory"] is None
    release = E.parse_merger_update(doc_text("doc_0001606498-26-000096_avnsform8k_07222026xex991.htm"), ["5.07"])
    assert (release["vote"], release["regulatory"], release["expected_close"]) == ("approved", "received",
                                                                                   "2026-07-27")
    done = E.parse_merger_update(doc_text("doc_0001606498-26-000115_avns-20260727.htm"),
                                 ["1.01", "1.02", "2.01", "3.01"])
    assert done["completed"] and not done["terminated"]                 # Item 1.02 here is the credit agreement
    iridium = E.parse_merger_update(doc_text("doc_0000950103-26-014464_dp253851_8k.htm"), ["5.07", "8.01"])
    assert iridium["vote"] == "approved" and iridium["regulatory"] == "pending" and iridium["expected_close"] is None
    broken = E.parse_merger_update("On May 1, 2026 the Company terminated the Merger Agreement with Parent.",
                                   ["1.02"])
    assert broken["terminated"] and not broken["completed"]
    quarter = E.parse_merger_update("The merger is expected to close in the third quarter of 2026.", [])
    assert quarter["expected_close"] == "2026-09-30" and quarter["close_basis"] == "quarter_end"


def test_merger_trigger_and_apply():
    deal = {"cash": 25.0, "stock": False, "financing_condition": False}
    deal = S.merger_apply(deal, {"vote": "approved", "regulatory": "received", "expected_close": "2026-07-27"},
                          "2026-07-22")
    assert deal["vote_date"] == deal["regulatory_date"] == deal["last_update"] == "2026-07-22"
    chk = S.merger_trigger(deal, "2026-07-22", {"max_days_to_close": 30})
    assert chk["ok"] and chk["days_to_close"] == 5
    assert S.merger_apply(deal, {"vote": None}, "2026-07-24")["last_update"] == "2026-07-22"   # no merger news
    far = S.merger_trigger(dict(deal, expected_close="2026-09-30"), "2026-07-22", {"max_days_to_close": 30})
    assert not far["ok"] and "70 days away" in far["reasons"][0]
    for broken, reason in (({"financing_condition": None}, "financing condition not stated"),
                           ({"stock": True}, "stock component"), ({"regulatory_date": None}, "regulatory"),
                           ({"completed": True}, "already completed")):
        assert any(reason in r for r in S.merger_trigger(dict(deal, **broken), "2026-07-22", {})["reasons"])


def test_parse_cef_tender_terms_and_result():
    swz = E.parse_cef_tender(doc_text("doc_0001999371-25-020802_ex99-a1iv.htm"))
    assert (swz["pct_nav"], swz["size_pct"], swz["size_shares"], swz["expiry"], swz["pricing_next_day"]) == (
        0.98, 0.24, 4_000_000.0, "2026-01-20", True)
    assert swz["shares_outstanding"] == pytest.approx(4_000_000 / 0.24)
    nfj = E.parse_cef_tender(doc_text("doc_0001193125-26-163126_d31950dsctoc.htm"))
    assert (nfj["pct_nav"], nfj["size_pct"], nfj["commence"], nfj["expiry"]) == (0.99, 0.25, "2026-09-01", None)
    release = E.parse_cef_tender(doc_text("doc_0001999371-25-020802_ex99-a5ii.htm"))
    assert release["pct_nav"] == 0.98 and release["pricing_next_day"]
    cond = E.parse_cef_tender("The Board approved a performance-related conditional tender offer for up to 25 "
                              "percent of the Fund's then issued and outstanding shares at a price equal to 98.5 "
                              "percent of the Fund's net asset value per share")
    assert cond["conditional"] and cond["pct_nav"] == 0.985 and cond["size_pct"] == 0.25
    result = E.parse_cef_tender_result(doc_text("doc_0001999371-26-001460_swz-sctoia_012226.htm"))
    assert result == {"accepted": pytest.approx(0.3323), "price": 6.81}
    assert E.parse_cef_tender_result("a proration factor of 0.2789 was applied")["accepted"] == pytest.approx(0.2789)
    assert E.parse_cef_tender_result("the proration factor was 27.89%")["accepted"] == pytest.approx(0.2789)
    assert E.parse_cef_tender_result("nothing to see") == {"accepted": None, "price": None}


def test_cef_tender_check():
    terms = {"pct_nav": 0.98, "expiry": "2026-01-20", "conditional": False}
    ok = S.cef_tender_check(terms, 5.90, 7.30, "2025-12-22", R.DEFAULTS["CEF"])
    assert ok["ok"] and ok["discount"] == pytest.approx(5.90 / 7.30 - 1) and ok["days_to_expiry"] == 29
    narrow = S.cef_tender_check(terms, 7.00, 7.30, "2025-12-22", R.DEFAULTS["CEF"])
    assert not narrow["ok"] and "narrower" in narrow["reasons"][0]
    late = S.cef_tender_check(dict(terms, expiry="2026-09-30"), 5.9, 7.3, "2026-04-21", R.DEFAULTS["CEF"])
    assert any("60-day cap" in r for r in late["reasons"])
    assert "no NAV" in S.cef_tender_check(terms, 5.9, None, "2025-12-22", R.DEFAULTS["CEF"])["reasons"]
    assert any("conditional" in r for r in S.cef_tender_check(dict(terms, conditional=True), 5.9, 7.3, "2025-12-22",
                                                               R.DEFAULTS["CEF"])["reasons"])


def test_point_in_time_shares_and_finra():
    fin = fx_json("concept_919864.json")
    assert E.parse_shares_outstanding(fin, "2026-09-28")["shares"] == 4_333_002
    assert E.parse_shares_outstanding(fin, "2026-08-12")["shares"] == 4_329_971    # the 08-13 filing not yet out
    assert E.parse_shares_outstanding(fin, "2024-01-01") is None
    assert E.parse_concept_value({"units": {"USD": [{"end": "2025-06-30", "val": 9.89e10, "filed": "2026-02-26"}]}},
                                 "2026-09-28", "USD", 550)["value"] == 9.89e10
    rows = fx_json("finra_si_CME.json")
    latest = E.parse_finra_si_rows(rows, "2026-09-28")
    assert latest["settlement_date"] == "2026-09-15" and latest["short_qty"] == 5_801_564
    assert E.parse_finra_si_rows(rows, "2026-09-26")["settlement_date"] == "2026-08-31"   # published 12 days later
    bill = E.parse_finra_si_file(fx_text("finra_shrt20260915.csv"), "BILL")
    assert len(bill) == 1 and E.parse_finra_si_rows(bill, "2026-09-30")["days_to_cover"] == 6.38


def test_html_to_text_keeps_split_words_and_drops_hidden_xbrl():
    raw = ("<html><head><title>x</title></head><body><ix:header>hidden 123</ix:header>"
           "<p>expire on J<span>anuary</span> 20,&nbsp;2026</p><div>next</div></body></html>")
    assert E.html_to_text(raw) == "expire on January 20, 2026 next"
    assert E.yahoo_symbol("BRK.B") == "BRK-B" and E.yahoo_symbol("NASDAQ: XYZ") == "XYZ"
    assert E.yahoo_symbol("NONE") is None and E.yahoo_symbol("") is None


# ----------------------------------------------------------------------------------------------------------
# Market features, scoring and the promotion tests
# ----------------------------------------------------------------------------------------------------------

def test_market_features_universe_cost_and_benchmark():
    bars = make_bars("2026-06-01", "2026-09-28", 10.0, volume=200_000)
    f = S.market_features(bars, "2026-09-28")          # a session: measured through the session before it
    assert f["last_bar"] == "2026-09-25" and f["price"] == 10.0 and f["dvol20"] == pytest.approx(2_000_000)
    assert not f["stale"] and S.market_features(bars, "2026-10-20")["stale"]
    assert S.universe_check(f, 4e8, R.DEFAULTS["SH1"]["universe"]) == []
    reasons = S.universe_check(dict(f, price=4.0), None, R.DEFAULTS["SH1"]["universe"])
    assert any("price" in r for r in reasons) and "market cap unknown" in reasons
    assert S.cost_for(2.5e10) == ("large", 0.0015) and S.cost_for(1.0e9) == ("small", 0.008)
    assert S.cost_for(None) == ("unknown", 0.02)
    assert S.benchmark_for(2.0e9) == "SPY" and S.benchmark_for(1.9e9) == "IWM" and S.benchmark_for(None) == "IWM"
    assert S.market_cap(None, 10.0, 5e8) == (5e8, "public_float") and S.market_cap(1e6, 10.0) == (1e7, "shares")
    assert S.nth_session_after("2025-09-05", 20) == "2025-10-03"
    assert S.first_session_after("2026-04-03") == "2026-04-06"          # Good Friday


def test_window_returns_filing_reaction_and_exits():
    stock = make_bars("2026-01-02", "2026-03-31", 50.0, drift=0.002)
    bench = make_bars("2026-01-02", "2026-03-31", 400.0, drift=0.001)
    start = S.entry_day(stock, "2026-02-02")
    assert start == pd.Timestamp("2026-02-03")
    end = S.follow_exit(stock, start, 20)
    assert end == stock.index[stock.index.get_loc(start) + 20]
    rets = S.window_returns(stock, bench, start, end, cost=0.003)
    raw_close = stock.at[end, "close"] / stock.at[start, "close"] - 1
    raw_open = stock.at[end, "close"] / stock.at[start, "open"] - 1
    b_close = bench.at[end, "close"] / bench.at[start, "close"] - 1
    b_open = bench.at[end, "close"] / bench.at[start, "open"] - 1
    assert rets["close"]["raw"] == pytest.approx(raw_close) and rets["open"]["raw"] == pytest.approx(raw_open)
    assert rets["close"]["net"] == pytest.approx(raw_close - b_close - 0.003)
    assert rets["open"]["excess"] == pytest.approx(raw_open - b_open)
    reaction = S.filing_reaction(stock, bench, "2026-02-02")
    pre = pd.Timestamp("2026-01-30")
    assert reaction == pytest.approx((stock.at[start, "close"] / stock.at[pre, "close"] - 1)
                                     - (bench.at[start, "close"] / bench.at[pre, "close"] - 1))
    assert S.follow_exit(stock, stock.index[-3], 20) is None


def test_dividend_detection_and_merger_and_tender_scores():
    bars = make_bars("2026-06-01", "2026-10-30", 45.0, dividends={"2026-09-18": 1.00})   # special 0.75 + regular
    assert S.observed_ex_date(bars, "2026-09-18", 0.75) == "2026-09-18"
    assert S.observed_ex_date(bars, "2026-09-18", 5.00) is None
    score = S.score_merger({"open": 24.5, "close": 24.6}, pd.Timestamp("2026-07-23"), pd.Timestamp("2026-07-27"),
                           25.0, cost=0.008)
    assert score["days"] == 4 and score["close"]["raw"] == pytest.approx(25 / 24.6 - 1)
    assert score["close"]["annualized"] == pytest.approx((1 + 25 / 24.6 - 1 - 0.008) ** (365 / 4) - 1)
    fund = make_bars("2025-12-01", "2026-02-27", 5.9)
    spy = make_bars("2025-12-01", "2026-02-27", 600.0)
    cef = S.score_cef(fund, spy, pd.Timestamp("2025-12-22"), pd.Timestamp("2026-01-23"), 0.3323, 6.81, cost=0.02)
    proceeds = 0.3323 * 6.81 + (1 - 0.3323) * 5.9
    assert cef["open"]["raw"] == pytest.approx(proceeds / fund.at[pd.Timestamp("2025-12-22"), "open"] - 1)
    assert cef["close"]["net"] == pytest.approx(proceeds / 5.9 - 1 - 0.02)
    none = S.score_cef(fund, spy, pd.Timestamp("2025-12-22"), pd.Timestamp("2026-01-23"), 0.5, None, cost=0.0)
    assert none["accepted"] == 0.0 and none["close"]["raw"] == pytest.approx(0.0)


def _events(setup: str, returns: list[float], start: str = "2020-01-15", **extra) -> list[dict]:
    months = pd.date_range(start, periods=len(returns), freq="MS")
    return [{"setup": setup, "status": "closed", "signal_date": (m + pd.Timedelta(days=14)).strftime("%Y-%m-%d"),
             "exit_date": (m + pd.Timedelta(days=40)).strftime("%Y-%m-%d"),
             "scores": {"x": {"return": r, "exit_date": "2020-02-01"}}, **extra} for m, r in zip(months, returns)]


def test_promotion_tests():
    rng = np.random.default_rng(7)
    strong = list(0.02 + rng.normal(0, 0.02, 70))
    evs = _events("SH1", strong, filing_reaction=0.004)
    res = S.promotion_test(evs, "SH1", R.DEFAULTS["SH1"]["promotion"])
    assert res["stats"]["n"] == 70 and res["passed"] is True and not res["demote"]
    fast = S.promotion_test(_events("SH1", strong, filing_reaction=0.02), "SH1", R.DEFAULTS["SH1"]["promotion"])
    assert fast["passed"] is False                     # the market still prices filings fast: no promotion
    few = S.promotion_test(_events("SH1", strong[:20], filing_reaction=0.0), "SH1", R.DEFAULTS["SH1"]["promotion"])
    assert few["passed"] is False and not few["checks"][0]["ok"]
    losing = S.promotion_test(_events("SH2", [-0.01] * 35), "SH2", R.DEFAULTS["SH2"]["promotion"])
    assert losing["passed"] is False and losing["demote"]
    deals = _events("SH4", [0.006] * 30, hold_days=20, tbill=0.04)
    ok = S.promotion_test(deals, "SH4", R.DEFAULTS["SH4"]["promotion"])
    assert ok["passed"] and ok["checks"][1]["value"] == pytest.approx(0.006 * 365 / 20)
    broke = S.promotion_test(deals[:-1] + _events("SH4", [-0.45], hold_days=20, tbill=0.04), "SH4",
                             R.DEFAULTS["SH4"]["promotion"])
    assert not broke["checks"][2]["ok"]                # a 45% break at a 5% weight costs 2.25% of the book
    cef = S.promotion_test(_events("CEF", [0.03, 0.01]), "CEF", None)
    assert cef["passed"] is None and cef["stats"]["n"] == 2
    rows = S.book_summary(evs + deals, month="2020-03")
    assert {r["name"].split()[1] for r in rows} == {"SH1", "SH4"} and all(r["signals"] == 1 for r in rows)
    recent = [{"setup": "SH3", "status": "closed", "signal_date": d, "filing_reaction": fr,
               "scores": {"20": {"return": net, "close": {"excess": gross}}}}
              for d, fr, gross, net in (("2023-01-10", 0.05, 0.04, 0.03), ("2025-02-03", 0.02, 0.01, 0.0),
                                        ("2025-09-01", 0.04, -0.01, -0.02))]
    split = S.reaction_split(recent, "SH3", "2025-09-30")          # the 2023 event is outside the 24 months
    assert split["n"] == 2 and split["filing_reaction_median"] == pytest.approx(0.03)
    assert split["follower_gross_mean"] == pytest.approx(0.0) and split["follower_net_mean"] == pytest.approx(-0.01)


# ----------------------------------------------------------------------------------------------------------
# HTTP clients: User-Agent, fair-access pacing, retries, budgets
# ----------------------------------------------------------------------------------------------------------

def test_user_agent_comes_from_the_environment(monkeypatch):
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    assert E.sec_user_agent() == E.DEFAULT_USER_AGENT and "@" not in E.DEFAULT_USER_AGENT
    monkeypatch.setenv("SEC_USER_AGENT", "Owner Name owner-contact")
    sec = FakeSec()
    E.EdgarClient(session=sec, sleep=no_sleep).search("4", "2026-09-28", "2026-09-28")
    assert sec.calls[0][2]["User-Agent"] == "Owner Name owner-contact"


def test_rate_limiter_paces_across_calls():
    now = [100.0]
    slept: list[float] = []

    def sleep(s: float) -> None:
        slept.append(round(s, 6))
        now[0] += s

    limiter = E.RateLimiter(8.0, clock=lambda: now[0], sleep=sleep)
    for _ in range(3):
        limiter.wait()
    assert slept == [0.125, 0.125]
    assert E.RateLimiter(50.0).interval == pytest.approx(0.1)              # never faster than 10 a second


def test_client_retries_refusals_and_budget():
    class Flaky(FakeSec):
        def __init__(self, fails: int) -> None:
            super().__init__()
            self.fails = fails

        def get(self, url, params=None, headers=None, timeout=None, **kw):
            if url == E.EFTS_URL and self.fails:
                self.fails -= 1
                self.calls.append((url, dict(params or {}), {}))
                return Resp(500, '{"message": "Internal server error"}')
            return super().get(url, params, headers, timeout)

    sec = Flaky(2)
    sec.search("4", "2026-09-28", "efts_form4_P_20260928.json", q="P")
    client = E.EdgarClient(session=sec, sleep=no_sleep)
    assert len(client.search("4", "2026-09-28", "2026-09-28", q="P")) == 8 and client.stats["retries"] == 2
    with pytest.raises(E.DataError):
        E.EdgarClient(session=Flaky(9), sleep=no_sleep).search("4", "2026-09-28", "2026-09-28")
    refused = FakeSec()
    refused.status["/Archives/"] = 403
    with pytest.raises(E.EdgarAccessDenied, match="Refused by the test"):
        E.EdgarClient(session=refused, sleep=no_sleep).document([1], "0000000000-26-000001", "a.htm")
    assert refused.archive_calls() == 1                                     # a 403 is not retried
    sec = FakeSec().load_documents()
    sec.status["/data/999/"] = 404
    client = E.EdgarClient(session=sec, sleep=no_sleep)
    text = client.document([999, 919864], "0001628280-26-063744", "wk-form4_1790629729.xml")   # 404, then found
    assert "Finward" in text and sec.archive_calls() == 2
    client.start(documents=1)
    client.document([919864], "0001628280-26-063744", "wk-form4_1790629729.xml")
    with pytest.raises(E.BudgetExhausted):
        client.document([919864], "0001628280-26-063746", "wk-form4_1790629824.xml")
    now = [0.0]
    timed = E.EdgarClient(session=sec, sleep=no_sleep, clock=lambda: now[0])
    timed.start(seconds=5)
    now[0] = 6.0
    with pytest.raises(E.BudgetExhausted):
        timed.search("4", "2026-09-28", "2026-09-28")


def test_search_pages_through_results():
    class Paged(FakeSec):
        def get(self, url, params=None, headers=None, timeout=None, **kw):
            self.calls.append((url, dict(params or {}), {}))
            frm = int((params or {}).get("from") or 0)
            hits = [{"_id": f"0000000001-26-{frm + i:06d}:d.htm", "_source": {"form": "8-K", "file_date": "2026-09-28",
                                                                               "ciks": ["1"], "display_names": []}}
                    for i in range(min(100, 150 - frm))]
            return Resp(200, jsonlib.dumps({"hits": {"total": {"value": 150}, "hits": hits}}))

    sec = Paged()
    hits = E.EdgarClient(session=sec, sleep=no_sleep).search("8-K", "2026-09-28", "2026-09-28")
    assert len(hits) == 150 and [c[1].get("from") for c in sec.calls] == [None, 100]


def test_finra_client_api_then_file():
    rows = fx_json("finra_si_CME.json")
    finra = E.FinraClient(session=FakeFinra(rows={"CME": rows}), sleep=no_sleep)
    assert finra.short_interest("CME", "2026-09-28")["days_to_cover"] == 3.34
    fallback = FakeFinra(files={"shrt20260915": fx_text("finra_shrt20260915.csv")})
    si = E.FinraClient(session=fallback, sleep=no_sleep).short_interest("BILL", "2026-09-29")
    assert si["settlement_date"] == "2026-09-15" and ("post", "BILL") in fallback.calls
    assert E.FinraClient(session=FakeFinra(), sleep=no_sleep).short_interest("ZZZZ", "2026-09-29") is None


# ----------------------------------------------------------------------------------------------------------
# The runner, end to end
# ----------------------------------------------------------------------------------------------------------

def test_sh3_activist_13d_event_entry_and_score(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("SCHEDULE 13D,SC 13D", "2025-09-04", "efts_13d_20250904.json")
    bars = {"BILL": make_bars("2025-01-02", "2025-12-31", 45.0, drift=0.001, volume=2_000_000),
            "SPY": make_bars("2025-01-02", "2025-12-31", 640.0, drift=0.0005, volume=5e7),
            "OCG": make_bars("2025-01-02", "2025-12-31", 3.0), "GEG": make_bars("2025-01-02", "2025-12-31", 12.0)}
    finra = FakeFinra(rows={"BILL": [
        {"settlementDate": "2025-08-15", "symbolCode": "BILL", "currentShortPositionQuantity": 10_000_000,
         "averageDailyVolumeQuantity": 2_000_000, "daysToCoverQuantity": 5.0},
        {"settlementDate": "2025-08-29", "symbolCode": "BILL", "currentShortPositionQuantity": 11_000_000,
         "averageDailyVolumeQuantity": 2_000_000, "daysToCoverQuantity": 5.5}]})   # published after 09-04
    state_dir, provider = world(tmp_path, cfg, bars, sec, finra)
    run = run_day(cfg, state_dir, provider, "2025-09-04", monkeypatch)
    evs = book(run)["events"]
    assert [(e["setup"], e["ticker"], e["signal_date"]) for e in evs] == [("SH3", "BILL", "2025-09-04")]
    ev = evs[0]
    assert ev["details"]["activist"] == "STARBOARD VALUE" and ev["bench"] == "SPY" and ev["cost"] == 0.003
    assert ev["entry_due"] == "2025-09-05" and ev["exit_due"] == "2025-10-03" and not ev["late"]
    assert ev["mcap"] == pytest.approx(101_628_611 * float(bars["BILL"].at[pd.Timestamp("2025-09-03"), "close"]))
    si = ev["short_interest"]
    assert si["settlement_date"] == "2025-08-15" and si["si_pct"] == pytest.approx(10_000_000 / 101_628_611)
    assert [r["event"] for r in shadow_records(run)] == ["signal"]
    assert book(run)["cursor"]["SH3"] == "2025-09-04" and book(run)["lockout"]["SH3:1786352"] == "2025-12-03"
    run = run_days(cfg, state_dir, provider, "2025-09-05", "2025-10-03", monkeypatch)
    ev = book(run)["events"][0]
    assert ev["status"] == "closed" and ev["entry_date"] == "2025-09-05" and ev["exit_date"] == "2025-10-03"
    b, s = bars["BILL"], bars["SPY"]
    t0, t1 = pd.Timestamp("2025-09-05"), pd.Timestamp("2025-10-03")
    expected = (b.at[t1, "close"] / b.at[t0, "close"] - 1) - (s.at[t1, "close"] / s.at[t0, "close"] - 1) - 0.003
    assert ev["scores"]["20"]["return"] == pytest.approx(expected) and ev["scores"]["20"]["basis"] == "close"
    assert ev["filing_reaction"] is not None and ev["forecast"]["outcome"] in (0, 1)
    assert [r["event"] for r in shadow_records(run)] == ["signal", "entry", "scored"]


def test_sh1_cluster_near_miss_warmup_and_pass(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("4", "2026-09-28", "efts_form4_P_20260928.json", q="P")
    fnwd = make_bars("2026-01-02", "2026-12-31", 43.5, volume=50_000)
    bars = {"FNWD": fnwd, "IWM": make_bars("2026-01-02", "2026-12-31", 250.0, volume=3e7),
            "SPY": make_bars("2026-01-02", "2026-12-31", 700.0, volume=5e7)}
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    b = book(run)
    assert set(b["insiders"]) == {"919864", "1156375", "1318008"}          # Finward, CME, Zumiez purchases
    assert len(b["insiders"]["919864"]) == 4 and not b["events"]            # warm-up: no clusters yet
    assert "SH1:919864" not in b["lockout"] and len([k for k in b["seen"] if k.startswith("SH1:")]) == 8

    # with a full window collected, the four Finward insiders form a cluster; at $188m it is a near-miss
    b["started"]["SH1"] = "2026-08-01"
    b["cursor"]["SH1"] = "2026-09-25"
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    near = shadow_records(run, "filtered")
    assert len(near) == 1 and near[0]["setup"] == "SH1" and near[0]["ticker"] == "FNWD"
    assert near[0]["details"]["insiders"] == 4 and any("market cap" in r for r in near[0]["reasons"])
    assert book(run)["lockout"]["SH1:919864"] == "2026-12-27" and not book(run)["events"]
    assert sec.archive_calls() == 8                                          # the second run fetched nothing again

    # the same cluster passes a lower cap floor: an event entered at the next open, out after 20 sessions
    cfg2 = load_config()
    cfg2.constitution["shadow"]["EDGAR"]["SH1"]["universe"]["min_mcap"] = 1.0e8
    b = book(run)
    b["lockout"].pop("SH1:919864")
    save_state(run.paths.state, run.state)
    run = run_day(cfg2, state_dir, provider, "2026-09-28", monkeypatch)
    ev = book(run)["events"][0]
    assert (ev["setup"], ev["ticker"], ev["entry_basis"], ev["bench"], ev["cost"]) == ("SH1", "FNWD", "open", "IWM",
                                                                                      0.02)
    assert ev["details"]["insiders"] == 4 and ev["exit_due"] == "2026-10-27" and ev["signal_date"] == "2026-09-28"
    run = run_days(cfg2, state_dir, provider, "2026-09-29", "2026-10-27", monkeypatch)
    ev = book(run)["events"][0]
    assert ev["status"] == "closed" and ev["scores"]["20"]["basis"] == "open"
    assert ev["scores"]["20"]["return"] == pytest.approx(ev["scores"]["20"]["open"]["net"])


def test_sh1_ticker_check_rejects_a_mismatched_price(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("4", "2026-09-28", "efts_form4_P_20260928.json", q="P")
    bars = {"FNWD": make_bars("2026-01-02", "2026-12-31", 100.0, volume=50_000)}   # not the insiders' $43.48
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-09-28")
    b = R._book(run.state)
    b["started"]["SH1"], b["cursor"]["SH1"] = "2026-08-01", "2026-09-25"
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    near = shadow_records(run, "filtered")
    assert near and any("ticker check failed" in r for r in near[0]["reasons"])


def test_sh2_special_dividend_event_and_exit_before_the_ex_date(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("8-K", "2026-09-08", "efts_specdiv_20260908.json", q=R.DEFAULTS["SH2"]["query"])
    sec.search("8-K", "2026-09-17", "efts_specdiv_20260917.json", q=R.DEFAULTS["SH2"]["query"])
    regular = {d: 0.25 for d in ("2024-12-10", "2025-03-10", "2025-06-10", "2025-09-10", "2025-12-10", "2026-03-10",
                                 "2026-06-10")}
    esp = make_bars("2024-06-03", "2026-10-30", 45.0, volume=40_000, dividends={**regular, "2026-09-18": 1.00})
    indv = make_bars("2025-06-02", "2026-10-30", 30.0, volume=1e6)
    bars = {"ESP": esp, "INDV": indv, "IWM": make_bars("2024-06-03", "2026-10-30", 250.0, volume=3e7)}
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2026-09-08", monkeypatch)
    evs = book(run)["events"]
    assert [(e["setup"], e["ticker"]) for e in evs] == [("SH2", "ESP")]
    det = evs[0]["details"]
    assert (det["amount"], det["ex_date"], det["ex_basis"]) == (0.75, "2026-09-18", "record date (T+1)")
    assert det["regular_median"] == pytest.approx(0.25) and evs[0]["exit_due"] == "2026-09-18"
    assert evs[0]["mcap"] == pytest.approx(2_995_922 * 45.0) and evs[0]["cost"] == 0.02   # shares filed 2026-05-12
    assert "SH2:0002007587-26-000106" in book(run)["seen"]                  # its exhibit is not on file: skipped
    run = run_days(cfg, state_dir, provider, "2026-09-09", "2026-09-18", monkeypatch)
    ev = book(run)["events"][0]
    assert ev["status"] == "closed" and ev["exit_date"] == "2026-09-17"      # the close before the ex-date
    assert ev["details"]["ex_date_observed"] == "2026-09-18"
    t0, t1, iwm = pd.Timestamp("2026-09-09"), pd.Timestamp("2026-09-17"), bars["IWM"]
    raw = esp.at[t1, "adj_close"] / esp.at[t0, "adj_close"] - 1
    bench = iwm.at[t1, "adj_close"] / iwm.at[t0, "adj_close"] - 1
    assert ev["scores"]["ex-1"]["return"] == pytest.approx(raw - bench - 0.02)
    near = shadow_records(run, "filtered")
    assert [(r["ticker"], r["reasons"][0][:10]) for r in near] == [("INDV", "contingent")]   # 2026-09-17


def test_sh4_near_completion_merger_from_vote_to_cash(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("8-K,DEFA14A", "2026-07-22", "efts_merger_20260722.json", q='"merger"')
    sec.search("DEFM14A", "2025-07-22", "efts_avns_defm14a.json", end="2026-07-22", ciks="0001606498")
    sec.search("8-K,DEFA14A", "2026-07-30", "efts_avns_20260730.json", ciks="0001606498")
    avns = make_bars("2025-06-02", "2026-07-28", 24.6, volume=1e6, prices={"2026-07-23": 24.70})
    state_dir, provider = world(tmp_path, cfg, {"AVNS": avns}, sec)
    run = run_day(cfg, state_dir, provider, "2026-07-22", monkeypatch)
    ev = book(run)["events"][0]
    assert (ev["setup"], ev["ticker"], ev["adsh"]) == ("SH4", "AVNS", "0001606498-26-000096")
    det = ev["details"]
    assert (det["cash"], det["vote_date"], det["regulatory_date"], det["expected_close"], det["days_to_close"]) == (
        25.0, "2026-07-22", "2026-07-22", "2026-07-27", 5)
    assert ev["tbill"] == 0.04 and ev["cost"] == 0.008                       # $1.15bn: the $0.3-2bn bucket
    assert [r["event"] for r in shadow_records(run)] == ["watch", "signal"]
    run = run_days(cfg, state_dir, provider, "2026-07-23", "2026-07-30", monkeypatch)
    ev = book(run)["events"][0]
    score = ev["scores"]["deal"]
    assert ev["status"] == "closed" and score["outcome"] == "completed" and score["exit_date"] == "2026-07-27"
    assert score["return"] == pytest.approx(25.0 / 24.70 - 1 - 0.008) and ev["hold_days"] == 4
    assert "1606498" not in book(run)["deals"]                               # pruned once the event closed


def test_cef_tender_capture_near_miss_and_event_with_final_amendment(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("SC TO-I,SC TO-C", "2025-12-19", "efts_cef_20251219.json", q='"net asset value"')
    sec.search("SC TO-I/A", "2026-01-20", "efts_swz_amend.json", end="2026-01-23", ciks="0000813623")
    swz = make_bars("2025-06-02", "2026-03-31", 5.90, volume=400_000, prices={"2026-01-23": 6.05})
    nav = make_bars("2025-06-02", "2026-03-31", 7.30)
    bars = {"SWZ": swz, "XSWZX": nav, "SPY": make_bars("2025-06-02", "2026-03-31", 600.0)}
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2025-12-19", monkeypatch)
    near = shadow_records(run, "filtered")
    assert len(near) == 1 and any("market cap" in r for r in near[0]["reasons"])   # $98m: under the $300m floor
    assert near[0]["details"]["discount"] == pytest.approx(5.90 / 7.30 - 1)

    cfg2 = load_config()
    cfg2.constitution["shadow"]["EDGAR"]["CEF"]["universe"]["min_mcap"] = 5.0e7
    state_dir2, provider2 = world(tmp_path / "b", cfg2, bars, sec)
    run = run_day(cfg2, state_dir2, provider2, "2025-12-19", monkeypatch)
    ev = book(run)["events"][0]
    assert (ev["setup"], ev["ticker"], ev["entry_due"], ev["exit_due"]) == ("CEF", "SWZ", "2025-12-22", "2026-01-23")
    assert ev["forecast"] is None and ev["details"]["pct_nav"] == 0.98
    run = run_days(cfg2, state_dir2, provider2, "2025-12-22", "2026-01-23", monkeypatch)
    ev = book(run)["events"][0]
    score = ev["scores"]["tender"]
    assert ev["status"] == "closed" and score["exit_date"] == "2026-01-23"
    assert (score["accepted"], score["tender_price"], score["accepted_basis"]) == (pytest.approx(0.3323), 6.81,
                                                                                    "final amendment")
    entry = swz.at[pd.Timestamp("2025-12-22"), "open"]
    assert score["return"] == pytest.approx((0.3323 * 6.81 + 0.6677 * 6.05) / entry - 1 - ev["cost"])


def test_cef_announcement_months_ahead_is_a_near_miss(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("SC TO-I,SC TO-C", "2026-04-20", "efts_cef_20260420.json", q='"net asset value"')
    sec.json[E.SUBMISSIONS_URL.format(cik=1260563)] = {"cik": "0001260563", "name": "Virtus", "tickers": ["NFJ"],
                                                      "exchanges": ["NYSE"]}
    bars = {"NFJ": make_bars("2025-06-02", "2026-06-30", 12.0, volume=300_000)}   # no NAV series either
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2026-04-20", monkeypatch)
    near = shadow_records(run, "filtered")
    assert len(near) == 1 and "no expiration date" in near[0]["reasons"] and "no NAV" in near[0]["reasons"]
    assert any("no NAV series XNFJX" in a["message"] for a in run.state["alerts"])


def test_fail_closed_on_refused_documents_and_retry(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("4", "2026-09-28", "efts_form4_P_20260928.json", q="P")
    sec.search("SCHEDULE 13D,SC 13D", "2026-09-28", "efts_13d_20250904.json")
    sec.status["/Archives/"] = 403
    state_dir, provider = world(tmp_path, cfg, {}, sec)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    b = book(run)
    assert "SH1" not in b["cursor"] and b["cursor"]["SH3"] == "2026-09-28"   # SH3 needs no documents
    msgs = [a["message"] for a in run.state["alerts"] if a["kind"] == "data"]
    assert any("SEC_USER_AGENT" in m for m in msgs)
    assert any(r["event"] == "data_missing" and r["setup"] == "SH1" for r in shadow_records(run))
    assert not any(k.startswith("SH1:") for k in b["seen"])
    del sec.status["/Archives/"]
    run = run_day(cfg, state_dir, provider, "2026-09-29", monkeypatch)
    assert book(run)["cursor"]["SH1"] == "2026-09-29" and len(book(run)["insiders"]["919864"]) == 4


def test_fail_closed_when_edgar_search_is_down(tmp_path, cfg, monkeypatch):
    sec = FakeSec()
    sec.status["efts.sec.gov"] = 503
    state_dir, provider = world(tmp_path, cfg, {}, sec)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    assert not book(run)["cursor"]
    assert sum(1 for a in run.state["alerts"] if a["kind"] == "data") == 5   # one per setup
    assert len([r for r in shadow_records(run) if r["event"] == "data_missing"]) == 5


def test_a_day_is_final_after_22_et_and_catch_up_is_bounded(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("SCHEDULE 13D,SC 13D", "2025-09-04", "efts_13d_20250904.json")
    bars = {"BILL": make_bars("2025-01-02", "2025-12-31", 45.0, volume=2e6)}
    strict = load_config()
    strict.constitution["shadow"]["EDGAR"]["provisional_before_final"] = False
    state_dir, provider = world(tmp_path / "strict", strict, bars, sec)
    run = run_day(strict, state_dir, provider, "2025-09-04", monkeypatch, hour=21, minute=40)
    assert not book(run)["events"]                      # before 22:05 ET: only yesterday's complete filings
    assert set(book(run)["cursor"].values()) == {"2025-09-03"}
    assert "2025-09-04" not in {c[1].get("startdt") for c in sec.calls if c[0] == E.EFTS_URL}
    run = run_day(strict, state_dir, provider, "2025-09-05", monkeypatch)   # the next evening catches 09-04 up
    assert [(e["ticker"], e["signal_date"], e["late"]) for e in book(run)["events"]] == [("BILL", "2025-09-04",
                                                                                          True)]
    # the default also screens the day provisionally before 22:05 ET (the winter daily slot is 21:17 EST):
    # the event is on record before its entry, and the day is screened again, for good, by the next run
    state_dir, provider = world(tmp_path / "default", cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2025-09-04", monkeypatch, hour=21, minute=17)
    assert [(e["ticker"], e["late"]) for e in book(run)["events"]] == [("BILL", False)]
    assert set(book(run)["cursor"].values()) == {"2025-09-03"}
    run = run_day(cfg, state_dir, provider, "2025-09-05", monkeypatch)
    assert len(book(run)["events"]) == 1 and set(book(run)["cursor"].values()) == {"2025-09-05"}
    b = book(run)
    b["cursor"] = {k: "2025-08-01" for k in R.ORDER}
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2025-09-15", monkeypatch)
    assert any("were not screened" in a["message"] for a in run.state["alerts"])
    assert all(v == "2025-09-15" for v in book(run)["cursor"].values())


def test_work_cap_carries_over_and_dedupes(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("4", "2026-09-28", "efts_form4_P_20260928.json", q="P")
    cfg.constitution["shadow"]["EDGAR"]["max_documents"] = 3
    state_dir, provider = world(tmp_path, cfg, {"TGT": make_bars("2026-06-01", "2026-09-30", 40.0)}, sec)
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-09-25")
    _open_event(run, "SH3", signal_date="2026-09-25", entry_due="2026-09-28")
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    b = book(run)
    assert "SH1" not in b["cursor"] and b["last_run"]["carried_over"]
    assert len([k for k in b["seen"] if k.startswith("SH1:")]) == 3
    assert (b["events"][0]["status"], b["events"][0]["entry_date"]) == ("open", "2026-09-28")   # still scored
    for _ in range(3):
        run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    b = book(run)
    assert b["cursor"]["SH1"] == "2026-09-28" and len([k for k in b["seen"] if k.startswith("SH1:")]) == 8
    assert sec.archive_calls() == 8                                          # every document fetched once


def test_a_price_budget_stop_leaves_the_filing_for_the_next_run(tmp_path, cfg, monkeypatch):
    sec = FakeSec().load_documents()
    sec.search("SCHEDULE 13D,SC 13D", "2025-09-04", "efts_13d_20250904.json")
    bars = {"BILL": make_bars("2025-01-02", "2025-12-31", 45.0, volume=2e6)}
    cfg.constitution["shadow"]["EDGAR"]["max_price_lookups"] = 0
    state_dir, provider = world(tmp_path, cfg, bars, sec)
    run = run_day(cfg, state_dir, provider, "2025-09-04", monkeypatch)
    b = book(run)
    assert not b["events"] and "SH3:0000921895-25-002532" not in b["seen"] and "SH3:1786352" not in b["lockout"]
    assert b["last_run"]["carried_over"] and "SH3" not in b["cursor"]
    cfg.constitution["shadow"]["EDGAR"]["max_price_lookups"] = 40
    run = run_day(cfg, state_dir, provider, "2025-09-05", monkeypatch)
    assert [(e["ticker"], e["signal_date"]) for e in book(run)["events"]] == [("BILL", "2025-09-04")]


def _open_event(run, setup: str, **fields) -> dict:
    ev = {"id": f"{setup}-x", "setup": setup, "signal_date": "2026-03-02", "detected": "2026-03-02", "late": False,
          "ticker": "TGT", "cik": 42, "entry_due": "2026-03-03", "entry_basis": "close", "exit_due": None,
          "cost": 0.008, "bench": "IWM", "details": {}, "status": "pending_entry", "scores": {},
          "forecast": {"p": 0.95, "question": "q"}, **fields}
    R._book(run.state)["events"].append(ev)
    return ev


def test_sh4_break_and_time_stop_exits(tmp_path, cfg, monkeypatch):
    tgt = make_bars("2025-06-02", "2026-06-30", 40.0, prices={"2026-03-11": 31.0})
    state_dir, provider = world(tmp_path, cfg, {"TGT": tgt}, FakeSec())
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-03-02")
    _open_event(run, "SH4")
    R._book(run.state)["deals"]["42"] = {"cik": 42, "cash": 42.0, "triggered": "2026-03-02",
                                         "last_update": "2026-03-02"}
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2026-03-03", monkeypatch)
    assert book(run)["events"][0]["status"] == "open" and book(run)["events"][0]["time_stop"] == "2026-05-01"
    book(run)["deals"]["42"].update(terminated=True, terminated_date="2026-03-10")
    save_state(run.paths.state, run.state)
    run = run_day(cfg, state_dir, provider, "2026-03-11", monkeypatch)
    score = book(run)["events"][0]["scores"]["deal"]
    assert (score["outcome"], score["exit_date"]) == ("terminated", "2026-03-11")      # the close after the break
    assert score["return"] == pytest.approx(31.0 / 40.0 - 1 - 0.008)
    assert book(run)["events"][0]["forecast"]["outcome"] == 0

    state_dir, provider = world(tmp_path / "b", cfg, {"TGT": tgt}, FakeSec())
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-03-02")
    _open_event(run, "SH4")
    R._book(run.state)["deals"]["42"] = {"cik": 42, "cash": 42.0, "triggered": "2026-03-02",
                                         "last_update": "2026-03-02"}
    save_state(run.paths.state, run.state)
    run = run_days(cfg, state_dir, provider, "2026-03-03", "2026-05-01", monkeypatch)
    score = book(run)["events"][0]["scores"]["deal"]
    assert (score["outcome"], score["exit_date"], score["days"]) == ("time_stop", "2026-05-01", 59)


def test_cef_exit_without_a_final_amendment_uses_the_offer_terms(tmp_path, cfg, monkeypatch):
    fund = make_bars("2025-11-03", "2026-03-31", 20.0, prices={"2026-02-13": 21.0})
    nav = make_bars("2025-11-03", "2026-03-31", 24.0)
    bars = {"CEFX": fund, "XCEFXX": nav, "SPY": make_bars("2025-11-03", "2026-03-31", 600.0)}
    state_dir, provider = world(tmp_path, cfg, bars, FakeSec())
    run = pipeline.Run(cfg, provider, state_dir, "daily", "2026-01-09")
    _open_event(run, "CEF", ticker="CEFX", signal_date="2026-01-09", entry_due="2026-01-12", entry_basis="open",
                exit_due="2026-02-13", cost=0.008, bench="SPY", forecast=None,
                details={"pct_nav": 0.98, "size_pct": 0.25, "expiry": "2026-02-10", "pricing_next_day": True,
                         "nav_symbol": "XCEFXX"})
    save_state(run.paths.state, run.state)
    run = run_days(cfg, state_dir, provider, "2026-01-12", "2026-02-13", monkeypatch)
    ev = book(run)["events"][0]
    score = ev["scores"]["tender"]
    assert ev["status"] == "closed" and score["exit_date"] == "2026-02-13"
    assert (score["accepted_basis"], score["price_basis"]) == ("offer size (every holder tenders)",
                                                               "pct of NAV at pricing")
    assert score["tender_price"] == pytest.approx(0.98 * 24.0)
    entry = fund.at[pd.Timestamp("2026-01-12"), "open"]
    assert score["return"] == pytest.approx((0.25 * 0.98 * 24.0 + 0.75 * 21.0) / entry - 1 - 0.008)


def test_sh1_prefilter_health_alert(tmp_path, cfg, monkeypatch):
    sec = FakeSec()
    sec.search("4", "2026-09-28", {"hits": {"total": {"value": 372, "relation": "eq"}, "hits": []}})
    state_dir, provider = world(tmp_path, cfg, {}, sec)
    run = run_day(cfg, state_dir, provider, "2026-09-28", monkeypatch)
    assert any("pre-filter found no Form 4 among 372" in a["message"] for a in run.state["alerts"])


def test_no_source_disabled_and_live_provider_wiring(tmp_path, cfg, monkeypatch):
    state_dir = tmp_path / "state"
    pipeline.run_init(cfg, state_dir, created="2026-09-01")
    run = pipeline.Run(cfg, FakeProvider(bars={}), state_dir, "daily", "2026-09-28")
    R.daily(run, {})
    assert any("no EDGAR source" in n for n in run.result.notes)
    off = load_config()
    off.constitution["shadow"]["EDGAR"]["enabled"] = False
    run = pipeline.Run(off, FakeProvider(bars={}), state_dir, "daily", "2026-09-28")
    R.daily(run, {})
    assert "cursor" not in run.state["shadow"]["EDGAR"] and not run.result.notes   # disabled: not even a note
    monkeypatch.setenv("SEC_USER_AGENT", "Owner Name owner-contact")
    live = LiveProvider(cfg, session=FakeSec(), sleep=no_sleep)
    run = pipeline.Run(cfg, live, state_dir, "daily", "2026-09-28")
    edgar_src, finra_src = R.sources(run, R.config(run))
    assert isinstance(edgar_src, E.EdgarClient) and isinstance(finra_src, E.FinraClient)
    assert edgar_src.user_agent == "Owner Name owner-contact" and live.edgar is edgar_src


def test_config_block_matches_the_code_defaults(cfg):
    block = cfg.shadow("EDGAR")
    assert block["enabled"] is True and R.DEFAULTS["enabled"] is False     # the code alone never switches it on
    assert {k: v for k, v in block.items() if k != "enabled"} == {k: v for k, v in R.DEFAULTS.items()
                                                                  if k != "enabled"}
    assert isinstance(block["SH1"]["universe"]["min_mcap"], float)          # YAML 1.1 needs "3.0e+8", not "3.0e8"


def test_the_pipeline_runs_the_screens_offline(tmp_path, cfg):
    from test_pipeline import LAUNCH, Recorder, SynthProvider

    pipeline.run_init(cfg, tmp_path, created=LAUNCH)
    res = pipeline.run_daily(cfg, SynthProvider(), tmp_path, date=LAUNCH, services=Recorder().services())
    assert res.status == "ok" and any("EDGAR shadow skipped" in n for n in res.notes)


def test_no_email_addresses_in_the_edgar_files():
    root = Path(__file__).resolve().parent.parent
    files = [root / "traderec/data/edgar.py", root / "traderec/modules/edgar_screens.py",
             root / "traderec/runners/edgar.py", root / "docs/phase-b/edgar.md", Path(__file__)]
    files += [p for p in FX.iterdir() if p.is_file()]
    rx = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}")
    for p in files:
        if p.exists():
            assert not rx.search(p.read_text(encoding="utf-8", errors="ignore")), p.name
    assert all(p.stat().st_size <= 200_000 for p in FX.iterdir())
