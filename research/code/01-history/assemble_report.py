"""Fill the generated catalog tables into a saved copy of the track-01 report.

Usage (after saving the report text to the given path):
    python3 research/code/01-history/assemble_report.py research/01-greatest-trades-and-blowups.md

Replaces the placeholders
    {{CATALOG_MASTER}}   <- output/catalog_master.md  (67-row master table)
    {{CATALOG_CARDS}}    <- output/catalog_cards.md   (per-trade cards: signals, sizing, failure modes, sources)
    {{BLOWUPS_TABLE}}    <- output/blowups_table.md   (35-row blowups table)
Re-generates the tables first (catalog.py) so the report always matches trade_catalog.csv / blowups.csv.
"""
from __future__ import annotations

import sys
from pathlib import Path

import catalog
from common import OUT_DIR


def main(path: str) -> None:
    catalog.main()
    p = Path(path)
    txt = p.read_text()
    for key, fname in (("{{CATALOG_MASTER}}", "catalog_master.md"), ("{{CATALOG_CARDS}}", "catalog_cards.md"),
                       ("{{BLOWUPS_TABLE}}", "blowups_table.md")):
        if key not in txt:
            print(f"placeholder {key} not found - skipped")
            continue
        txt = txt.replace(key, (OUT_DIR / fname).read_text().strip() + "\n")
    p.write_text(txt)
    print(f"filled tables into {p}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "research/01-greatest-trades-and-blowups.md")
