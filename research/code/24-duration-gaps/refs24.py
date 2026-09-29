"""Track 24: check every literature citation used in the report against Crossref (the DOI registry).

For each reference we query Crossref's bibliographic search with the title and first author, and keep the best
match whose first-author surname matches and whose year is within +-1 of the cited year (working-paper vs journal
years differ), preferring the journal version over an SSRN/NBER copy.  A reference counts as "checked" when such a
match exists.  The raw answers are cached in the scratchpad so the check re-runs offline.  (OpenAlex, used by
track 22, throttled this session with HTTP 429; Crossref is the registry the DOIs come from.)
Output: results/references_checked.csv.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse

sys.dont_write_bytecode = True

import pandas as pd  # noqa: E402
import requests  # noqa: E402

from common24 import RESULTS, SCRATCH  # noqa: E402

CACHE = SCRATCH / "crossref"
CACHE.mkdir(parents=True, exist_ok=True)

# (key, first-author surname, year, title used for the search, what we use it for[, expected venue substring])
REFS = [
    ("MP2001", "Mitchell", 2001, "Characteristics of risk and return in risk arbitrage", "merger arb returns, put-like payoff"),
    ("BS2002", "Baker", 2002, "Limited arbitrage in mergers and acquisitions", "merger arb abnormal returns"),
    ("JJ2010", "Jetley", 2010, "The shrinking merger arbitrage spread: reasons and implications", "spread decay after 2002"),
    ("GS2014", "Giglio", 2014, "No news is news: do markets underreact to nothing?", "completion hazard vs time"),
    ("OP2015", "Offenberg", 2015, "How do acquirers choose between mergers and tender offers?", "tender offers close faster"),
    ("DGLR2017", "Dew-Becker", 2017, "The price of variance risk", "variance premium concentrated at short maturities"),
    ("ELW2010", "Egloff", 2010, "The term structure of variance swap rates and optimal variance swap investments", "VRP term structure"),
    ("CW2009", "Carr", 2009, "Variance risk premiums", "variance risk premium"),
    ("IN2015", "Israelov", 2015, "Covered calls uncovered", "option selling = beta + small VRP"),
    ("MG1999", "Moskowitz", 1999, "Do industries explain momentum?", "industry momentum"),
    ("JT1993", "Jegadeesh", 1993, "Returns to buying winners and selling losers: implications for stock market efficiency", "3-12 month momentum holds"),
    ("BT1989", "Bernard", 1989, "Post-earnings-announcement drift: delayed price response or risk premium?", "PEAD over 60 days"),
    ("BT1990", "Bernard", 1990, "Evidence that stock prices do not fully reflect the implications of current earnings for future earnings", "drift realised at next announcements"),
    ("CGSSS2009", "Chordia", 2009, "Liquidity and the post-earnings-announcement drift", "PEAD in illiquid stocks"),
    ("M2022", "Martineau", 2022, "Rest in peace post-earnings announcement drift", "PEAD gone in large caps"),
    ("P1995", "Pontiff", 1995, "Closed-end fund premia and returns: implications for financial market equilibrium", "CEF discounts predict returns"),
    ("LST1991", "Lee", 1991, "Investor sentiment and the closed-end fund puzzle", "CEF discounts", "Journal of Finance"),
    ("BBGJ2010", "Bradley", 2010, "Activist arbitrage: a study of open-ending attempts of closed-end funds", "CEF activism"),
    ("CNS2004", "Chen", 2004, "The price response to S&P 500 index additions and deletions: evidence of asymmetry and a new explanation", "deletion rebound"),
    ("GSm2025", "Greenwood", 2025, "The disappearing index effect", "S&P inclusion effect decay"),
    ("Mad2003", "Madhavan", 2003, "The Russell reconstitution effect", "Russell reconstitution"),
    ("Pet2011", "Petajisto", 2011, "The index premium and its hidden cost for index funds", "index premium"),
    ("Keim1983", "Keim", 1983, "Size-related anomalies and stock return seasonality: further empirical evidence", "January small-cap effect"),
    ("Rein1983", "Reinganum", 1983, "The anomalous stock market behavior of small firms in January: empirical tests for tax-loss selling effects", "tax-loss selling"),
    ("HH2006", "Haug", 2006, "The January effect", "January effect persistence"),
    ("HS2013", "Hartzmark", 2013, "The dividend month premium", "dividend-month effect (<1 month)"),
    ("Cheng2019", "Cheng", 2019, "The VIX premium", "VIX futures premium"),
    ("SC2014", "Simon", 2014, "The VIX futures basis: evidence and trading strategies", "VIX basis carry"),
    ("CMW1993", "Cusatis", 1993, "Restructuring through spinoffs: the stock market evidence", "spin-off drift"),
    ("CMP2012", "Cohen", 2012, "Decoding inside information", "insider routine vs opportunistic"),
    ("MLP2016", "McLean", 2016, "Does academic research destroy stock return predictability?", "post-publication decay"),
    ("BLdP2014", "Bailey", 2014, "The deflated Sharpe ratio: correcting for selection bias, backtest overfitting and non-normality", "deflated Sharpe"),
    ("HLZ2016", "Harvey", 2016, "and the cross-section of expected returns", "multiple testing", "Review of Financial Studies"),
    ("UM2009", "Ungar", 2009, "The cash-secured PutWrite strategy and performance of related benchmark indexes", "PUT index"),
]


def search(title: str, author: str) -> list[dict]:
    key = "".join(ch for ch in (author + title).lower() if ch.isalnum())[:90]
    f = CACHE / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    url = ("https://api.crossref.org/works?rows=6&mailto=research@example.com&query.bibliographic="
           + urllib.parse.quote(f"{title} {author}"))
    for i in range(5):
        try:
            r = requests.get(url, timeout=40)
            if r.status_code == 200:
                items = r.json()["message"]["items"]
                slim = [dict(doi=it.get("DOI"), title=(it.get("title") or [""])[0],
                             venue=(it.get("container-title") or [""])[0] if it.get("container-title") else "",
                             year=((it.get("issued") or {}).get("date-parts") or [[None]])[0][0],
                             authors=[a.get("family", "") for a in it.get("author", [])][:6], type=it.get("type"))
                        for it in items]
                f.write_text(json.dumps(slim))
                return slim
        except Exception:  # noqa: BLE001
            pass
        time.sleep(3 * (i + 1))
    return []


def main():
    rows = []
    for ref in REFS:
        key, sur, yr, title, use = ref[:5]
        venue_hint = ref[5] if len(ref) > 5 else None
        res = search(title + (f" {venue_hint}" if venue_hint else ""), sur)
        cands = []
        for w in res:
            auth = " ".join(w.get("authors") or []).lower().replace("-", "")
            if venue_hint and venue_hint.lower() not in (w.get("venue") or "").lower():
                continue
            if sur.lower().replace("-", "") in auth and w.get("year") and abs(int(w["year"]) - yr) <= 1 and w.get("doi"):
                journal = bool(w.get("venue")) and not str(w["doi"]).startswith(("10.2139", "10.3386"))
                cands.append((0 if journal else 1, abs(int(w["year"]) - yr), w))
        cands.sort(key=lambda c: (c[0], c[1]))
        best = cands[0][2] if cands else (res[0] if res else {})
        rows.append(dict(key=key, cited_as=f"{sur} ({yr})", use=use, checked=bool(cands),
                         doi=best.get("doi"), cr_title=best.get("title"), cr_year=best.get("year"),
                         venue=best.get("venue"), authors="; ".join(best.get("authors") or [])))
        time.sleep(0.3)
    df = pd.DataFrame(rows)
    df.to_csv(RESULTS / "references_checked.csv", index=False)
    with pd.option_context("display.width", 250, "display.max_colwidth", 70):
        print(df[["key", "checked", "doi", "cr_year", "venue", "cr_title"]].to_string(index=False))
    print("checked:", int(df.checked.sum()), "of", len(df))


if __name__ == "__main__":
    main()
