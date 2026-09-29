"""Re-run track 22 end to end (about 1 minute with the scratchpad cache warm).

The cache folder (scratchpad/22-duration-new/cache) symlinks the caches of tracks 13, 06, 15 and 17;
missing series (VWEHX, HYG, JNK, ANGL, TLT, IEF, GC=F, DGS20, ...) are downloaded on first use.
Family (c) needs TRACK15_SCRATCH pointing at track 15's scratchpad (set below).
"""
import os
import runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.environ.setdefault("TRACK15_SCRATCH",
                      "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/15-short-futures-crypto")
os.chdir(HERE)
for s in ["fa_index_fear", "fb_credit", "fc_trend", "fd_intl", "fe_btc", "ff_seasonal", "fg_bonds", "fh_gold",
          "fi_macro", "summary", "checks", "report_tables"]:
    print(f"==== {s}", flush=True)
    runpy.run_path(str(HERE / f"{s}.py"), run_name="__main__")
