"""Print the markdown tables used in research/22-duration-cap-new-strategies.md (to stdout)."""
from __future__ import annotations

import numpy as np
import pandas as pd

import common22 as K

R = K.RESULTS


def pct(x, d=1, sign=True):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    return f"{100 * x:+.{d}f}%" if sign else f"{100 * x:.{d}f}%"


def num(x, d=1):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    return f"{x:.{d}f}"


def edge_cell(r):
    if r is None or r["n"] == 0:
        return "–"
    t = r.get("t_edge", np.nan)
    ts = f", t {t:+.1f}" if r["n"] >= 5 and np.isfinite(t) else ""
    return f"{int(r['n'])} · {pct(r['edge'])}{ts}"


def row(df, v, role, inst=None):
    x = df[(df["variant"] == v) & (df["role"] == role)]
    if inst is not None:
        x = x[x["instrument"] == inst]
    return x.iloc[0].to_dict() if len(x) else None


def table_a():
    a = pd.read_csv(R / "registry_a_index_fear.csv")
    u = pd.read_csv(R / "registry_a_union.csv")
    print("\n### (a) timing edge per trade: n · edge vs era-matched random entry (t)\n")
    print("| Signal | Filter | Design 1928–2007 H42 | H63 | H84 | Test SPY 2008–26 H42 | H63 | H84 |")
    print("|---|---|---|---|---|---|---|---|")
    for sig in ["DD-10", "DD-15", "DD-20", "VIX>=30", "VIX>=40", "VIX>=45", "VIX/VIX3M>=1", "DAY-3", "DAY-4"]:
        for filt in ("none", "up200"):
            cells = []
            for role in ("design", "test_exec"):
                for H in (42, 63, 84):
                    cells.append(edge_cell(row(a, f"{sig}|{filt}|H{H}", role)))
            print(f"| {sig} | {filt} | " + " | ".join(cells) + " |")
    cells = []
    for role in ("design", "test_exec"):
        for H in (42, 63, 84):
            cells.append(edge_cell(row(u, f"UNION|H{H}", role)))
    print("| Uptrend shock (union of VIX>=30 and DAY-3) | up200 | " + " | ".join(cells) + " |")
    print("\n*VIX/VIX3M: design 2006–2015, test 2016–2026.*")


def family_stats(df, v, role, label, inst=None):
    r = row(df, v, role, inst)
    if r is None or r["n"] == 0:
        return None
    return f"| {label} | {int(r['n'])} | {num(r['per_yr'], 2)} | {pct(r['mean_net'])} | {pct(r['median_net'])} | {num(100 * r['win'], 0)}% | {pct(r['worst'])} | {pct(r.get('mdd'), 0)} | {pct(r['edge'])} | {num(r.get('t_edge'))} | {num(r.get('p_placebo'), 2)} |"


def table_families():
    print("\n### Representative variants, executable instrument where one exists\n")
    print("| Family · variant · period | n | Trades/yr | Mean | Median | Win | Worst trade | Max DD at 1× | Edge vs placebo | t | Placebo p |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    a = pd.read_csv(R / "registry_a_index_fear.csv")
    u = pd.read_csv(R / "registry_a_union.csv")
    b = pd.read_csv(R / "registry_b_credit.csv")
    e = pd.read_csv(R / "registry_e_btc.csv")
    f = pd.read_csv(R / "registry_f_seasonal.csv")
    g = pd.read_csv(R / "registry_g_bonds.csv")
    h = pd.read_csv(R / "registry_h_gold.csv")
    i = pd.read_csv(R / "registry_i_macro.csv")
    lines = []
    for H in (42, 63, 84):
        lines.append(family_stats(u, f"UNION|H{H}", "full", f"(a) Uptrend shock H{H} · S&P 1928–2026"))
        lines.append(family_stats(u, f"UNION|H{H}", "full_exec", f"(a) Uptrend shock H{H} · SPY 1993–2026"))
        lines.append(family_stats(u, f"UNION|H{H}", "test_exec", f"(a) Uptrend shock H{H} · SPY 2008–26"))
    for H in (42, 63, 84):
        lines.append(family_stats(a, f"DD-20|none|H{H}", "test_exec", f"(a) S&P −20% first close H{H} · SPY 2008–26"))
        lines.append(family_stats(a, f"VIX>=45|none|H{H}", "full", f"(a) VIX≥45 H{H} · S&P 1928–2026"))
    for H in (42, 63, 84):
        lines.append(family_stats(b, f"ABS35|every|H{H}", "full", f"(b) Baa−10y≥3.5% H{H} · VWEHX 1980–2026"))
        lines.append(family_stats(b, f"ABS35|every|H{H}", "test_exec", f"(b) Baa−10y≥3.5% H{H} · HYG 2008–26"))
    lines.append(family_stats(b, "ABS35|every|H252", "test_exec_ref", "(b) reference: 12-month hold · HYG 2008–26"))
    for H in (60, 90, 120):
        lines.append(family_stats(e, f"200WMA|H{H}d", "full", f"(e) BTC ≤200-week avg, {H} days · 2015–26"))
        lines.append(family_stats(e, f"DD-75|H{H}d", "full", f"(e) BTC −75% from ATH, {H} days · 2011–26"))
    for H in (42, 63, 84):
        lines.append(family_stats(f, f"MIDTERM-SEP|H{H}", "design", f"(f) Midterm Q4 H{H} · S&P 1930–2006"))
        lines.append(family_stats(f, f"MIDTERM-SEP|H{H}", "test_exec", f"(f) Midterm Q4 H{H} · SPY 2010–22"))
        lines.append(family_stats(f, f"ALL-OCT|H{H}", "full", f"(f) End-October, all years H{H} · S&P 1928–2025"))
    for H in (42, 63, 84):
        lines.append(family_stats(g, f"UP50/21|H{H}|long", "full", f"(g) 10y +50bp/21d → long bond H{H} · 1962–2026"))
        lines.append(family_stats(g, f"UP50/21|H{H}|long", "test_exec", f"(g) 10y +50bp/21d → TLT H{H} · 2008–26"))
    for H in (42, 63, 84):
        lines.append(family_stats(h, f"DD15|none|H{H}", "design", f"(h) Gold −15% from 12-m high, {H // 21} months · monthly 1971–2007"))
        lines.append(family_stats(h, f"DD15|none|H{H}", "test_exec", f"(h) Gold −15% from 52-wk high H{H} · GLD 2008–26"))
    for H in (42, 63, 84):
        lines.append(family_stats(i, f"PAUSE|long|H{H}", "full", f"(i) Fed pause → long bond H{H} · 1955–2026"))
        lines.append(family_stats(i, f"PAUSE|spx|H{H}", "full", f"(i) Fed pause → S&P H{H} · 1955–2026"))
        lines.append(family_stats(i, f"RESTEEP|10y|H{H}", "full", f"(i) Curve re-steepens → 10y H{H} · 1967–2026"))
    for ln in lines:
        if ln:
            print(ln)


def table_d():
    P = pd.read_csv(R / "pooled_d_intl.csv")
    print("\n### (d) international, pooled across markets\n")
    print("| Variant | Role | Trades | Markets | Crisis-month clusters | Win | Mean | Median | Worst | Edge | t (naive) | t (clustered) |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for _, r in P.sort_values(["variant", "role"]).iterrows():
        print(f"| {r['variant']} | {r['role']} | {int(r['n'])} | {int(r['markets'])} | {int(r['clusters'])} | {100 * r['win']:.0f}% | {pct(r['mean_net'])} | {pct(r['median_net'])} | {pct(r['worst'])} | {pct(r['edge'])} | {r['t_naive']:.1f} | {r['t_cluster']:.1f} |")


def table_c():
    C = pd.read_csv(R / "registry_c_trend.csv")
    print("\n### (c) trend: Sharpe by lookback and re-decision interval (phase-averaged)\n")
    print("| Universe · period | Book | L | H21 | H42 | H63 | H84 |")
    print("|---|---|---|---|---|---|---|")
    for uni, per in (("LONG26", "design"), ("LONG26", "test"), ("MICRO8", "design"), ("MICRO8", "test"), ("ETF8", "test"), ("ETF8", "since2013")):
        for lo in (False, True):
            for L in (63, 126, 252):
                x = C[(C["universe"] == uni) & (C["period"] == per) & (C["long_only"] == lo) & (C["L"] == L)].set_index("H")
                if len(x) == 0:
                    continue
                cells = [f"{x.loc[H, 'sharpe']:.2f}" + (f" ({x.loc[H, 'sharpe_min']:.2f}–{x.loc[H, 'sharpe_max']:.2f})" if H > 21 else "") for H in (21, 42, 63, 84)]
                print(f"| {uni} {per} | {'long-only' if lo else 'long/short'} | {L} | " + " | ".join(cells) + " |")
    e = C[(C["universe"] == "ETF8") & (C["period"] == "test") & (C["long_only"])]
    print("\n| ETF8 long-only, 2008–26 | L | H | Sharpe | Return at 10%-vol scale | Max DD | Cost %/yr | Direction changes/yr | Rebalances/yr |")
    print("|---|---|---|---|---|---|---|---|---|")
    for _, r in e.iterrows():
        print(f"| | {r['L']} | {r['H']} | {r['sharpe']:.2f} | {r['ann_ret']:.1f}% | {r['mdd']:.0f}% | {r['cost']:.2f} | {r['flips_yr']:.1f} | {r['rebal_yr']:.0f} |")


def table_selection():
    s = pd.read_csv(R / "summary_selection.csv")
    print("\n### Design-selected variant per family → test\n")
    print("| Family | Variants | Selected on design data | Design n · edge (z) | Test n · edge (t) | Bonferroni t (family / all 260) | DSR test (family / 260) |")
    print("|---|---|---|---|---|---|---|")
    for _, r in s.iterrows():
        print(f"| {r['family']} | {r['N_family']} | {r['selected']} | {num(r['design_n'], 0)} · {pct(r['design_edge'])} ({num(r['design_z'])}) | {num(r['test_n'], 0)} · {pct(r['test_edge'])} ({num(r['test_t'])}) | {num(r['bonf_t_family'], 2)} / {num(r['bonf_t_total'], 2)} | {num(r['dsr_test_family'], 2)} / {num(r['dsr_test_total'], 2)} |")


def table_contrib():
    c = pd.read_csv(R / "summary_contributions.csv")
    d = pd.read_csv(R / "check_intl_dsr.csv")
    print("\n### Candidates: sizing and kappa-shrunk contribution, % of portfolio a year over T-bills\n")
    print("| Candidate | Hold | Episodes (κ) | Trades/yr | Edge/trade (full) | Test edge (t) | DSR test (fam / 260) | Notional | Δg/trade | Contribution: edge gone | forward drift | historical drift |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for _, r in c.iterrows():
        dsr = f"{num(r['dsr_test_Nfam'], 2)} / {num(r['dsr_test_Ntot'], 2)}"
        if r["label"].startswith("Intl"):
            x = d[(d["variant"] == f"DD-20|p10<1.3|H{r['H']}") & (d["role"] == "test_exec")]
            if len(x):
                dsr = f"{x.iloc[0]['dsr_N12']:.2f} / {x.iloc[0]['dsr_N260']:.2f} (clusters)"
        print(f"| {r['label']} | H{r['H']} | {int(r['n_eff'])} ({r['kappa']}) | {r['per_yr']:.2f} | {pct(r['full_edge'])} | {pct(r['test_edge'])} ({num(r['test_t'])}) | {dsr} | {100 * r['notional']:.1f}% | {r['dg_trade_bp']:.0f} bp | {pct(r['ctr_fwd_lo'], 2)} | {pct(r['ctr_fwd'], 2)} | {pct(r['ctr_hist'], 2)} |")


def table_stress():
    s = pd.read_csv(R / "summary_stress.csv")
    print("\n### Stress inputs: worst loss over 10 / 42 / 63 / 84 sessions\n")
    print("| Instrument | 10 | 42 | 63 | 84 | Notional at 2% stress (10-session) | (63-session) |")
    print("|---|---|---|---|---|---|---|")
    for _, r in s.iterrows():
        print(f"| {r['instrument']} | {pct(r['s10'], 0)} | {pct(r['s42'], 0)} | {pct(r['s63'], 0)} | {pct(r['s84'], 0)} | {0.02 / abs(r['s10']) * 100:.1f}% | {0.02 / abs(r['s63']) * 100:.1f}% |")


if __name__ == "__main__":
    table_selection()
    table_a()
    table_families()
    table_d()
    table_c()
    table_stress()
    table_contrib()
