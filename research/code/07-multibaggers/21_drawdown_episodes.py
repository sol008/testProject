"""List every drawdown episode deeper than 50% (peak -> trough -> recovery) for the famous multibaggers."""
import os, sys
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mdtable import md
SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
RES = "/home/user/testProject/research/code/07-multibaggers/results"
px = pd.read_pickle(os.path.join(SCR, "famous_prices.pkl"))
rows = []
for name, s in px.items():
    s = s[s > 0]
    if name == "MNST":
        s = s.loc["1995":]  # pre-1995 Hansen Natural was a sub-$0.05 (split-adj) penny stock with tick noise
    peak = s.cummax()
    dd = s / peak - 1
    ep = (s >= peak).cumsum()
    for k, g in dd.groupby(ep):
        if g.min() <= -0.5:
            pk_date = g.index[0]
            tr_date = g.idxmin()
            nxt = s.loc[g.index[-1]:]
            rec = nxt[nxt >= s.loc[pk_date]]
            rec_date = rec.index[0] if len(rec) and rec.index[0] > g.index[-1] - pd.Timedelta(days=1) and g.index[-1] != s.index[-1] else None
            rows.append({"asset": name, "peak": pk_date.date(), "trough": tr_date.date(), "depth_%": round(100 * g.min(), 1),
                         "months_peak_to_trough": round((tr_date - pk_date).days / 30.44, 0),
                         "recovered": rec_date.date() if rec_date is not None else "not yet",
                         "years_underwater": round(((rec_date if rec_date is not None else s.index[-1]) - pk_date).days / 365.25, 1)})
d = pd.DataFrame(rows)
d.to_csv(os.path.join(RES, "drawdown_episodes.csv"), index=False)
open(os.path.join(RES, "drawdown_episodes.md"), "w").write("# Every >=50% drawdown episode (daily closes)\n\n" + md(d) + "\n")
print(d.to_string())
