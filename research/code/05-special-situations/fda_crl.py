"""FDA Complete Response Letters (openFDA transparency/crl, published since mid-2025).

Summarises: letters by year, share of CRL'd applications later approved, and the
most common deficiency themes (keyword counts in letter text: manufacturing/CMC,
clinical efficacy, safety, bioequivalence, facility inspection).
Base-rate input for biotech binary events (PDUFA dates).

Run: python fda_crl.py     Output: output/fda_crl_summary.json
"""
from __future__ import annotations

import json
import re

import pandas as pd

from common import get_json, save_json

API = "https://api.fda.gov/transparency/crl.json"

THEMES = {
    "manufacturing/CMC/facility": r"facilit|manufactur|CMC|chemistry, manufacturing|Form FDA 483|inspection|cGMP|sterility|drug substance",
    "clinical efficacy/adequate & well-controlled": r"adequate and well-controlled|substantial evidence of effectiveness|efficacy|did not demonstrate|failed to demonstrate|primary endpoint",
    "safety": r"safety|adverse|risk-benefit|benefit-risk|hepatotoxic|cardiac",
    "bioequivalence/PK": r"bioequivalen|pharmacokinetic|relative bioavailability",
    "labeling/REMS only": r"REMS|labeling",
}


def main():
    rows, skip = [], 0
    while True:
        d = get_json(API, {"limit": 100, "skip": skip}, sleep=0.3)
        res = d.get("results", [])
        rows += res
        skip += len(res)
        if not res or skip >= d["meta"]["results"]["total"]:
            break
    df = pd.DataFrame(rows)
    df["year"] = pd.to_numeric(df["letter_year"], errors="coerce")
    out = {"n_letters": int(len(df)), "last_updated_note": "openFDA CRL dataset (initial release Jul-2025 covered CRLs for later-approved products 2020-24; newer CRLs published as issued)"}
    out["by_year"] = df.groupby("year").size().astype(int).to_dict()
    out["approval_status_counts"] = df["approval_status"].value_counts().to_dict()
    txt = df["text"].fillna("")
    out["theme_share_of_letters"] = {k: round(float(txt.str.contains(v, flags=re.I, regex=True).mean()), 3) for k, v in THEMES.items()}
    recent = df[df["year"] >= 2024]
    out["recent_2024plus"] = {"n": int(len(recent)), "approval_status": recent["approval_status"].value_counts().to_dict()}
    save_json(out, "fda_crl_summary.json")
    print(json.dumps(out, indent=1, default=str))


if __name__ == "__main__":
    main()
