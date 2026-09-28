"""Tiny DataFrame -> GitHub markdown table helper (tabulate is not installed)."""
import pandas as pd


def md(df: pd.DataFrame, index: bool = False, floatfmt: str = "{:.2f}") -> str:
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, r in d.iterrows():
        cells = []
        for v in r.values:
            if isinstance(v, float):
                cells.append("" if pd.isna(v) else floatfmt.format(v).rstrip("0").rstrip(".") if "." in floatfmt.format(v) else floatfmt.format(v))
            else:
                cells.append(str(v))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)
