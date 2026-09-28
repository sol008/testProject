#!/usr/bin/env python3
"""Reachability / shape probe for candidate data sources (track 09 - infrastructure).

Makes ONE small, unauthenticated (or public-demo-key) request per endpoint and records
HTTP status, latency, and a short content sample. No secrets are used or printed.
Public demo keys used: Alpha Vantage "demo", EODHD "demo", FMP "demo" (documented by vendors).

Usage:  python3 probe_data_sources.py [out.json]
"""
import json
import socket
import sys
import time
from datetime import date, timedelta

import requests

UA_BROWSER = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/126.0 Safari/537.36")
# SEC requires a descriptive User-Agent with contact info; placeholder address used here.
UA_SEC = "TradeRecResearch research-probe@example.org"

today = date.today()
# last weekday before today (for daily files)
d = today - timedelta(days=1)
while d.weekday() >= 5:
    d -= timedelta(days=1)
LAST_BDAY = d

PROBES = [
    # name, method, url, kwargs
    ("yahoo_chart_v8", "GET", "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d", {"headers": {"User-Agent": UA_BROWSER}}),
    ("fred_graph_csv_nokey", "GET", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", {}),
    ("fred_api_nokey", "GET", "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json", {}),
    ("sec_company_tickers", "GET", "https://www.sec.gov/files/company_tickers.json", {"headers": {"User-Agent": UA_SEC}}),
    ("sec_submissions_AAPL", "GET", "https://data.sec.gov/submissions/CIK0000320193.json", {"headers": {"User-Agent": UA_SEC}}),
    ("sec_companyfacts_AAPL", "GET", "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", {"headers": {"User-Agent": UA_SEC}}),
    ("sec_frames", "GET", "https://data.sec.gov/api/xbrl/frames/us-gaap/AccountsPayableCurrent/USD/CY2024Q4I.json", {"headers": {"User-Agent": UA_SEC}}),
    ("sec_efts_fulltext_tender", "GET", "https://efts.sec.gov/LATEST/search-index?q=%22tender%20offer%22&forms=SC%20TO-T&dateRange=custom&startdt=" + (today - timedelta(days=30)).isoformat() + "&enddt=" + today.isoformat(), {"headers": {"User-Agent": UA_SEC}}),
    ("sec_current_form4_atom", "GET", "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=10&output=atom", {"headers": {"User-Agent": UA_SEC}}),
    ("sec_daily_index", "GET", "https://www.sec.gov/Archives/edgar/daily-index/", {"headers": {"User-Agent": UA_SEC}}),
    ("cboe_delayed_options_SPY", "GET", "https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json", {"headers": {"User-Agent": UA_BROWSER}}),
    ("cboe_vix_history_csv", "GET", "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", {"headers": {"User-Agent": UA_BROWSER}}),
    ("coingecko_ping", "GET", "https://api.coingecko.com/api/v3/ping", {}),
    ("coingecko_price", "GET", "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd", {}),
    ("kraken_ticker", "GET", "https://api.kraken.com/0/public/Ticker?pair=XBTUSD", {}),
    ("coinbase_exchange_ticker", "GET", "https://api.exchange.coinbase.com/products/BTC-USD/ticker", {"headers": {"User-Agent": UA_BROWSER}}),
    ("coinbase_spot", "GET", "https://api.coinbase.com/v2/prices/BTC-USD/spot", {}),
    ("deribit_index", "GET", "https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd", {}),
    ("polymarket_gamma_markets", "GET", "https://gamma-api.polymarket.com/markets?limit=3&active=true&closed=false", {}),
    ("polymarket_clob", "GET", "https://clob.polymarket.com/markets?next_cursor=", {}),
    ("kalshi_markets", "GET", "https://api.elections.kalshi.com/trade-api/v2/markets?limit=3&status=open", {}),
    ("alphavantage_demo_daily", "GET", "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&apikey=demo", {}),
    ("alphavantage_demo_earnings_cal", "GET", "https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=demo", {}),
    ("fmp_demo_quote", "GET", "https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=demo", {}),
    ("polygon_nokey", "GET", "https://api.polygon.io/v2/aggs/ticker/AAPL/prev", {}),
    ("massive_nokey", "GET", "https://api.massive.com/v2/aggs/ticker/AAPL/prev", {}),
    ("tiingo_nokey", "GET", "https://api.tiingo.com/api/test", {}),
    ("eodhd_demo_eod", "GET", "https://eodhd.com/api/eod/AAPL.US?api_token=demo&fmt=json&from=" + (today - timedelta(days=7)).isoformat(), {}),
    ("nasdaq_data_link_nokey", "GET", "https://data.nasdaq.com/api/v3/datatables/NDAQ/RTAT10.json?qopts.per_page=1", {}),
    ("openfigi_mapping", "POST", "https://api.openfigi.com/v3/mapping", {"json": [{"idType": "TICKER", "idValue": "AAPL", "exchCode": "US"}]}),
    ("finra_regsho_daily_file", "GET", f"https://cdn.finra.org/equity/regsho/daily/CNMSshvol{LAST_BDAY:%Y%m%d}.txt", {}),
    ("finra_api_short_interest", "GET", "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=2", {"headers": {"Accept": "application/json"}}),
    ("gdelt_doc_api", "GET", "https://api.gdeltproject.org/api/v2/doc/doc?query=%22tender%20offer%22&mode=artlist&maxrecords=3&format=json", {}),
    ("google_news_rss", "GET", "https://news.google.com/rss/search?q=%22definitive%20agreement%22%20acquire&hl=en-US&gl=US&ceid=US:en", {"headers": {"User-Agent": UA_BROWSER}}),
    ("sec_press_rss", "GET", "https://www.sec.gov/news/pressreleases.rss", {"headers": {"User-Agent": UA_SEC}}),
    ("openfda_drugsfda", "GET", "https://api.fda.gov/drug/drugsfda.json?limit=1", {}),
    ("nasdaq_earnings_calendar", "GET", f"https://api.nasdaq.com/api/calendar/earnings?date={(today + timedelta(days=1)).isoformat()}", {"headers": {"User-Agent": UA_BROWSER, "Accept": "application/json"}}),
    ("finnhub_nokey", "GET", "https://finnhub.io/api/v1/calendar/earnings", {}),
    ("treasury_yield_csv", "GET", f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{today.year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={today.year}&page&_format=csv", {"headers": {"User-Agent": UA_BROWSER}}),
    ("cftc_cot_socrata", "GET", "https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=1", {}),
    ("finviz_quote_page", "GET", "https://finviz.com/quote.ashx?t=AAPL", {"headers": {"User-Agent": UA_BROWSER}}),
    ("stooq_csv", "GET", "https://stooq.com/q/d/l/?s=spy.us&i=d", {}),
    # Email / LLM API reachability (unauthenticated -> expect 401/403/404; NOTHING is sent)
    ("anthropic_models_nokey", "GET", "https://api.anthropic.com/v1/models", {"headers": {"anthropic-version": "2023-06-01"}}),
    ("resend_nokey", "GET", "https://api.resend.com/domains", {}),
    ("postmark_nokey", "GET", "https://api.postmarkapp.com/server", {"headers": {"Accept": "application/json"}}),
    ("mailgun_nokey", "GET", "https://api.mailgun.net/v3/domains", {}),
    ("sendgrid_nokey", "GET", "https://api.sendgrid.com/v3/scopes", {}),
    ("aws_ses_nokey", "GET", "https://email.us-east-1.amazonaws.com/v2/email/account", {}),
    ("gmail_api_nokey", "GET", "https://gmail.googleapis.com/gmail/v1/users/me/profile", {}),
    ("github_api", "GET", "https://api.github.com/rate_limit", {}),
]

SMTP_PROBES = [("smtp.gmail.com", 587), ("smtp.gmail.com", 465), ("smtp.resend.com", 587), ("smtp.resend.com", 465), ("email-smtp.us-east-1.amazonaws.com", 587)]


def probe_http(name, method, url, kwargs):
    t0 = time.time()
    try:
        r = requests.request(method, url, timeout=25, **kwargs)
        dt = time.time() - t0
        ctype = r.headers.get("content-type", "")
        body = r.text[:300].replace("\n", " ")
        return {"name": name, "url": url.split("apikey")[0], "status": r.status_code, "secs": round(dt, 2),
                "bytes": len(r.content), "ctype": ctype[:40], "sample": body,
                "ratelimit_hdrs": {k: v for k, v in r.headers.items() if "limit" in k.lower() or "retry" in k.lower()}}
    except Exception as e:  # noqa: BLE001
        return {"name": name, "url": url, "status": None, "secs": round(time.time() - t0, 2), "error": f"{type(e).__name__}: {str(e)[:200]}"}


def probe_smtp(host, port):
    t0 = time.time()
    try:
        s = socket.create_connection((host, port), timeout=8)
        s.close()
        return {"name": f"smtp {host}:{port}", "status": "tcp-connect-ok", "secs": round(time.time() - t0, 2)}
    except Exception as e:  # noqa: BLE001
        return {"name": f"smtp {host}:{port}", "status": None, "secs": round(time.time() - t0, 2), "error": f"{type(e).__name__}: {str(e)[:120]}"}


def probe_yfinance():
    out = []
    try:
        import yfinance as yf
        t0 = time.time()
        h = yf.Ticker("SPY").history(period="5d")
        out.append({"name": "yfinance_history_SPY", "status": "ok" if len(h) else "empty", "rows": len(h), "secs": round(time.time() - t0, 2),
                    "last_close": None if h.empty else float(h["Close"].iloc[-1]), "last_date": None if h.empty else str(h.index[-1].date())})
        t0 = time.time()
        tk = yf.Ticker("AAPL")
        exps = tk.options
        chain = tk.option_chain(exps[0]) if exps else None
        out.append({"name": "yfinance_options_AAPL", "status": "ok" if exps else "empty", "n_expirations": len(exps),
                    "first_exp": exps[0] if exps else None,
                    "n_calls": 0 if chain is None else len(chain.calls), "cols": [] if chain is None else list(chain.calls.columns)[:14],
                    "secs": round(time.time() - t0, 2)})
        t0 = time.time()
        df = yf.download(["AAPL", "MSFT", "NVDA", "BTC-USD", "^VIX"], period="1mo", progress=False, auto_adjust=True)
        out.append({"name": "yfinance_download_5tickers", "status": "ok" if len(df) else "empty", "rows": len(df), "secs": round(time.time() - t0, 2)})
        t0 = time.time()
        try:
            ed = tk.get_earnings_dates(limit=4)
            out.append({"name": "yfinance_earnings_dates", "status": "ok" if ed is not None and len(ed) else "empty", "rows": 0 if ed is None else len(ed), "secs": round(time.time() - t0, 2)})
        except Exception as e:  # noqa: BLE001
            out.append({"name": "yfinance_earnings_dates", "status": None, "error": f"{type(e).__name__}: {str(e)[:150]}"})
        t0 = time.time()
        try:
            cal = tk.calendar
            out.append({"name": "yfinance_calendar", "status": "ok" if cal else "empty", "keys": list(cal.keys())[:8] if isinstance(cal, dict) else str(type(cal)), "secs": round(time.time() - t0, 2)})
        except Exception as e:  # noqa: BLE001
            out.append({"name": "yfinance_calendar", "status": None, "error": f"{type(e).__name__}: {str(e)[:150]}"})
    except Exception as e:  # noqa: BLE001
        out.append({"name": "yfinance", "status": None, "error": f"{type(e).__name__}: {str(e)[:200]}"})
    return out


def main():
    results = []
    for p in PROBES:
        results.append(probe_http(*p))
        time.sleep(0.25)  # be polite (SEC fair-access: <=10 req/s)
    for h, port in SMTP_PROBES:
        results.append(probe_smtp(h, port))
    results.extend(probe_yfinance())
    out = sys.argv[1] if len(sys.argv) > 1 else "probe_results.json"
    with open(out, "w") as f:
        json.dump({"run_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "results": results}, f, indent=1)
    for r in results:
        st = r.get("status")
        extra = r.get("error") or (r.get("sample", "")[:110] if isinstance(r.get("sample"), str) else "")
        print(f"{r['name']:34s} {str(st):16s} {r.get('secs', '')!s:6s} {extra}")


if __name__ == "__main__":
    main()
