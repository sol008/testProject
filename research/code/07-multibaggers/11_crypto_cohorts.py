"""
Crypto cohort study: for each Jan-1 snapshot 2014-2025, take the CMC top-N (ex stablecoins,
ex wrapped/staked duplicates) and follow each coin to 2026-09-27 and to fixed 1/3/5-year horizons.
Coins that disappear from CMC's tracked listing are 'untracked' (dead or delisted); a few known
token migrations are mapped to their successor with the official swap ratio.
Outputs markdown tables to results/crypto_*.md and a CSV of per-coin outcomes.
"""
import os, json, glob
import numpy as np
import pandas as pd
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
CR = os.path.join(SCR, "crypto")
RES = "/home/user/testProject/research/code/07-multibaggers/results"
os.makedirs(RES, exist_ok=True)

snaps = {}
for f in sorted(glob.glob(os.path.join(CR, "cmc_*.json"))):
    d = os.path.basename(f)[4:14]
    snaps[d] = {x["id"]: x for x in json.load(open(f))}
dates = sorted(snaps)
LAST = dates[-1]

STABLE_SYMS = {"USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "PAX", "GUSD", "HUSD", "USDD", "FDUSD",
               "PYUSD", "USDE", "USDS", "FRAX", "LUSD", "SAI", "USDK", "EURS", "XAUT", "PAXG", "BITUSD",
               "USNBT", "XUSD", "UST", "USTC", "USDJ", "USDN", "SUSD", "EURT", "USD1", "RLUSD", "USDX",
               "BSD", "NUSD", "CUSD", "USDB", "USDG", "BFUSD", "USD0", "USDTB", "USDF", "SBD", "BITCNY",
               "CNHT", "ALUSD", "MIM", "DOLA", "GHO", "CRVUSD", "USDO", "EUROC", "EURC", "XSGD", "TRYB"}
STABLE_TAGS = {"stablecoin", "usd-stablecoin", "asset-backed-stablecoin", "fiat-stablecoin",
               "algorithmic-stablecoin", "eur-stablecoin", "gold-stablecoin"}
# id -> (successor id, successor tokens received per old token)
MIGR = {3513: (32684, 1.0),      # FTM -> S (Sonic)
        3890: (28321, 1.0),      # MATIC -> POL
        1904: (3077, 100.0),     # VEN -> VET
        1776: (3635, 27.643),    # MCO -> CRO
        28683: (28194, 1000.0),  # 1000SATS -> SATS
        5830: (5939, 1.0),       # NXM -> wNXM
        2239: (7278, 0.01),      # LEND -> AAVE
        1982: (9444, 1.0),       # KNC legacy -> KNC
        }


def is_excluded(x):
    sym = (x.get("symbol") or "").upper()
    name = (x.get("name") or "").lower()
    tags = set(x.get("tags") or [])
    last = snaps[LAST].get(x["id"])
    if last:
        tags |= set(last.get("tags") or [])
    if sym in STABLE_SYMS or tags & STABLE_TAGS:
        return True
    if any(k in name for k in ["wrapped", "staked", "bridged", "binance-peg", "restaked", "liquid staking"]):
        return True
    if sym in {"WBTC", "WETH", "STETH", "WSTETH", "WEETH", "CBBTC", "BTCB", "RENBTC", "HBTC", "WBETH",
               "RETH", "CBETH", "METH", "EZETH", "RSETH", "SOLVBTC", "LBTC", "JITOSOL", "MSOL", "BNSOL",
               "WTRX", "WBNB", "TBTC", "SUSDE", "SUSDS", "STKAAVE", "WEETH", "OSETH", "SFRXETH", "CLBTC"}:
        return True
    return False


def price_at(cid, d, ratio=1.0):
    """price of coin cid at snapshot d (following migrations); None if untracked"""
    x = snaps[d].get(cid)
    if x is not None:
        p = x["quotes"][0]["price"]
        return p * ratio if p else None
    if cid in MIGR:
        nid, r = MIGR[cid]
        return price_at(nid, d, ratio * r)
    return None


def last_seen(cid, upto):
    ds = [d for d in dates if d <= upto and cid in snaps[d]]
    if not ds:
        return None, None
    return ds[-1], snaps[ds[-1]][cid]["quotes"][0]["price"]


rows = []
for y in range(2014, 2026):
    d0 = f"{y}-01-01"
    lst = sorted([x for x in snaps[d0].values() if x.get("cmcRank")], key=lambda x: x["cmcRank"])
    lst = [x for x in lst if not is_excluded(x)]
    for rank_ex, x in enumerate(lst[:100], 1):
        p0 = x["quotes"][0]["price"]
        if not p0:
            continue
        rec = {"cohort": y, "id": x["id"], "symbol": x["symbol"], "name": x["name"], "rank": rank_ex,
               "mcap0": x["quotes"][0]["marketCap"], "p0": p0}
        for h in (1, 3, 5):
            dh = f"{y+h}-01-01"
            if dh > LAST:
                rec[f"m{h}y"] = np.nan
                continue
            ph = price_at(x["id"], dh)
            rec[f"untracked{h}y"] = ph is None
            if ph is None:  # untracked by then: use last seen price (upper bound on value)
                ds, pl = last_seen(x["id"], dh)
                ph = pl
            rec[f"m{h}y"] = ph / p0
        pe = price_at(x["id"], LAST)
        rec["untracked_end"] = pe is None
        if pe is None:
            ds, pe = last_seen(x["id"], LAST)
        rec["m_end"] = pe / p0
        rec["in_top100_end"] = (x["id"] in snaps[LAST] and snaps[LAST][x["id"]]["cmcRank"] <= 110) or \
                               (x["id"] in MIGR and MIGR[x["id"]][0] in snaps[LAST] and snaps[LAST][MIGR[x["id"]][0]]["cmcRank"] <= 110)
        rows.append(rec)

df = pd.DataFrame(rows)
df.to_csv(os.path.join(RES, "crypto_cohort_coins.csv"), index=False)

btc = {d: snaps[d][1]["quotes"][0]["price"] for d in dates}
eth = {d: snaps[d][1027]["quotes"][0]["price"] for d in dates if 1027 in snaps[d]}


def summarize(sub, y, mcol, d_end):
    btc_m = btc[d_end] / btc[f"{y}-01-01"]
    m = sub[mcol].dropna()
    w = sub.loc[m.index, "mcap0"]
    return {
        "cohort": y, "N": len(m), "BTC_x": round(btc_m, 2),
        "median_x": round(m.median(), 2),
        "pct_gain": round(100 * (m > 1).mean(), 1),
        "pct_beat_BTC": round(100 * (m > btc_m).mean(), 1),
        "pct_10x": round(100 * (m >= 10).mean(), 1),
        "pct_down90": round(100 * (m <= 0.1).mean(), 1),
        "EW_x": round(m.mean(), 2),
        "EWcap100_x": round(m.clip(upper=100).mean(), 2),
        "EWexBTC_x": round(m[sub.loc[m.index, "id"] != 1].mean(), 2),
        "CW_x": round((m * w).sum() / w.sum(), 2),
        "best": sub.loc[m.idxmax(), "symbol"] + f" ({m.max():.0f}x)",
    }


out = []
for y in range(2014, 2026):
    sub = df[df.cohort == y]
    r = summarize(sub, y, "m_end", LAST)
    r["pct_untracked"] = round(100 * sub.untracked_end.mean(), 1)
    r["pct_still_top100"] = round(100 * sub.in_top100_end.mean(), 1)
    out.append(r)
t_end = pd.DataFrame(out)
out20 = []
for y in range(2014, 2026):
    sub = df[(df.cohort == y) & (df["rank"] <= 20)]
    r = summarize(sub, y, "m_end", LAST)
    r["pct_untracked"] = round(100 * sub.untracked_end.mean(), 1)
    out20.append(r)
t_end20 = pd.DataFrame(out20)
fixed20 = []
for h in (1, 3, 5):
    for y in range(2014, 2026):
        if f"{y+h}-01-01" > LAST:
            continue
        sub = df[(df.cohort == y) & (df["rank"] <= 20)]
        r = summarize(sub, y, f"m{h}y", f"{y+h}-01-01")
        r["h"] = h
        fixed20.append(r)
t_fixed20 = pd.DataFrame(fixed20)

fixed = []
for h in (1, 3, 5):
    for y in range(2014, 2026):
        if f"{y+h}-01-01" > LAST:
            continue
        sub = df[df.cohort == y]
        r = summarize(sub, y, f"m{h}y", f"{y+h}-01-01")
        r["h"] = h
        r["pct_untracked"] = round(100 * sub[f"untracked{h}y"].mean(), 1)
        fixed.append(r)
t_fixed = pd.DataFrame(fixed)

# top-10 (ex stables) turnover
turn = []
for y in range(2014, 2026):
    d0 = f"{y}-01-01"
    lst = [x for x in sorted(snaps[d0].values(), key=lambda x: x["cmcRank"] or 1e9) if not is_excluded(x)][:10]
    lastlst = [x for x in sorted(snaps[LAST].values(), key=lambda x: x["cmcRank"] or 1e9) if not is_excluded(x)][:10]
    lastids = {x["id"] for x in lastlst}
    still = [x["symbol"] for x in lst if x["id"] in lastids or (x["id"] in MIGR and MIGR[x["id"]][0] in lastids)]
    beat = sum(1 for x in lst if x["id"] != 1 and (price_at(x["id"], LAST) or 0) / x["quotes"][0]["price"] > btc[LAST] / btc[d0])
    turn.append({"cohort": y, "top10": " ".join(x["symbol"] for x in lst), "still_top10_now": " ".join(still),
                 "n_nonBTC_beating_BTC_to_now": beat})
t_turn = pd.DataFrame(turn)

with open(os.path.join(RES, "crypto_cohorts.md"), "w") as f:
    f.write(f"# Crypto cohorts: CMC top-100 (ex stablecoins/wrapped) on Jan-1 of each year, held to {LAST}\n\n")
    f.write(md(t_end) + "\n\n")
    for h in (1, 3, 5):
        f.write(f"## Fixed {h}-year horizon\n\n")
        f.write(md(t_fixed[t_fixed.h == h].drop(columns="h")) + "\n\n")
        sub = t_fixed[t_fixed.h == h]
    f.write("## Top-20 only, held to end\n\n" + md(t_end20) + "\n\n")
    f.write("## Top-20 only, fixed 5-year horizon\n\n" + md(t_fixed20[t_fixed20.h == 5].drop(columns="h")) + "\n\n")
    f.write("## Top-20 only, fixed 3-year horizon\n\n" + md(t_fixed20[t_fixed20.h == 3].drop(columns="h")) + "\n\n")
    f.write("## Top-10 turnover\n\n" + md(t_turn) + "\n")
    # pooled
    f.write("\n## Pooled fixed-horizon stats (all cohorts, coin-level)\n\n")
    for h in (1, 3, 5):
        m = df[f"m{h}y"].dropna()
        bt = []
        for _, r in df.dropna(subset=[f"m{h}y"]).iterrows():
            bt.append(btc[f"{int(r.cohort)+h}-01-01"] / btc[f"{int(r.cohort)}-01-01"])
        bt = np.array(bt)
        f.write(f"- {h}y: N={len(m)}, median multiple {m.median():.2f}, % >=10x {100*(m>=10).mean():.1f}%, "
                f"% <=0.1x {100*(m<=0.1).mean():.1f}%, % beat BTC same window {100*(m.values>bt).mean():.1f}%\n")
print(t_end.to_string())
print(t_fixed.to_string())
print(t_turn.to_string())
print(t_end20.to_string())
print(t_fixed20[t_fixed20.h == 5].to_string())

# ---- annually rebalanced indices: BTC vs ETH vs EW/CW top-10 and top-20 (ex stables) -----------
yrs = [f"{y}-01-01" for y in range(2014, 2027)] + [LAST]
idx_rows = []
lev = {"BTC": 1.0, "ETH": 1.0, "EW_top10": 1.0, "CW_top10": 1.0, "EW_top20": 1.0, "EW_top100": 1.0}
for d0, d1 in zip(yrs[:-1], yrs[1:]):
    lst = [x for x in sorted(snaps[d0].values(), key=lambda x: x["cmcRank"] or 1e9) if not is_excluded(x)]
    r = {}
    for n in (10, 20, 100):
        mult, caps = [], []
        for x in lst[:n]:
            p0 = x["quotes"][0]["price"]
            p1 = price_at(x["id"], d1)
            if p1 is None:
                _, p1 = last_seen(x["id"], d1)
            mult.append(p1 / p0)
            caps.append(x["quotes"][0]["marketCap"])
        mult, caps = np.array(mult), np.array(caps)
        r[f"EW_top{n}"] = np.clip(mult, 0, 100).mean()  # cap single-coin annual multiple at 100x (illiquid prints)
        if n == 10:
            r["CW_top10"] = (mult * caps).sum() / caps.sum()
    r["BTC"] = btc[d1] / btc[d0]
    r["ETH"] = (eth[d1] / eth[d0]) if (d0 in eth and d1 in eth) else np.nan
    for k in lev:
        if np.isfinite(r.get(k, np.nan)):
            lev[k] *= r[k]
    idx_rows.append({"period": f"{d0[:4]}->{d1[:7]}", **{k: round(v, 2) for k, v in r.items()}})
t_idx = pd.DataFrame(idx_rows)
with open(os.path.join(RES, "crypto_cohorts.md"), "a") as f:
    f.write("\n## Annually rebalanced: yearly multiples (Jan-1 to Jan-1; last row to latest date)\n\n" + md(t_idx) + "\n")
    f.write("\nCumulative growth of $1 (2014-01-01 to latest; ETH from 2016 snapshot): " +
            ", ".join(f"{k}: {v:,.1f}" for k, v in lev.items()) + "\n")
print(t_idx.to_string())
print(lev)
