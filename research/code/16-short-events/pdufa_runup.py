"""FDA decision dates (track 05 event file, 2020-26): can a trader earn the pre-decision run-up
without taking the binary risk (buy t-30, sell t-1), or the post-approval fade?

Input: research/code/05-special-situations/output/biotech_events.csv (XBI-adjusted returns;
approvals = Drugs@FDA original NME NDA/BLA approvals; CRLs = openFDA letters; matched sponsors).
Caveats: the action date is not always the pre-announced PDUFA goal date; CRL letters in openFDA
are a selective sample; n is small; survivors with Yahoo data only.
Cost: 2% round trip for 'small/volatile' (prior 60d vol > 60%), 0.3% otherwise.
"""
import numpy as np
import pandas as pd

from common import OUT, save_csv, trade_stats

SRC = OUT.parent.parent / "05-special-situations" / "output" / "biotech_events.csv"


def main():
    b = pd.read_csv(SRC, parse_dates=["date"])
    b["small"] = b["prior_vol"] > 0.6
    b["cost"] = np.where(b["small"], 0.02, 0.003)
    rows = []
    for grp, g in [("small/volatile", b[b["small"]]), ("large/calm", b[~b["small"]]), ("ALL", b)]:
        for typ, gg in [("approval+CRL pooled", g), ("approval", g[g["type"] != "CRL"]), ("CRL", g[g["type"] == "CRL"])]:
            rows.append({"group": grp, "events": typ, "trade": "run-up long t-30->t-1 (net)", **trade_stats(gg["pre_-30_-1"] - gg["cost"], per_year=len(gg) / 6.7)})
            rows.append({"group": grp, "events": typ, "trade": "hold through decision t-1->t+2 (net)", **trade_stats(gg["event_-1_+2"] - gg["cost"], per_year=len(gg) / 6.7)})
            rows.append({"group": grp, "events": typ, "trade": "post-event drift long t+2->t+30 (net)", **trade_stats(gg["post_+2_+30"] - gg["cost"], per_year=len(gg) / 6.7)})
            rows.append({"group": grp, "events": typ, "trade": "post-event drift SHORT t+2->t+30 (net)", **trade_stats(-gg["post_+2_+30"] - gg["cost"] - 0.02, per_year=len(gg) / 6.7)})
    t = pd.DataFrame(rows)
    save_csv(t, "pdufa_runup.csv")
    pd.set_option("display.width", 220)
    print(t[["group", "events", "trade", "n", "mean_%", "median_%", "t", "win_%", "p5_%", "max_loss_%"]].to_string())
    # break-even approval probability for holding through the decision (small caps)
    s = b[b["small"]]
    up = s.loc[s["type"] != "CRL", "event_-1_+2"].mean()
    dn = s.loc[s["type"] == "CRL", "event_-1_+2"].mean()
    print("small caps: mean approval move %.3f, mean CRL move %.3f, break-even p = %.2f" % (up, dn, -dn / (up - dn)))


if __name__ == "__main__":
    main()
