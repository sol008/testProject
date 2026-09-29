"""Option-chain snapshots kept in git: state/options/<date>/<root>-<HHMM>.csv.gz (docs/PHASE_B_CONTRACTS.md §5).

A raw CBOE file is about 6-13 MB per root, so git keeps a filtered sample of it. The sample stays under
`options.snapshots.max_bytes_per_day` (100 KB) across all roots and runs of a day:

1. Every contract the book depends on is always kept: the legs of pending and open spreads, and of the
   modules' and shadow books' open trades.
2. Roots a runner asked for (`roots_needed`) also get a surface sample:
   - expiries 20-120 days out, at most one a week, up to 12, spread evenly;
   - per expiry and right, the listed strikes nearest a grid of 2.5% steps within ±25% of spot.
3. When a file would not fit its share of the day's budget, the surface is coarsened (twice the strike step,
   half the expiries) until it fits. The legs alone are always written.

The file is a CSV of CHAIN_COLUMNS after a first line `#meta {json}` (underlying, asof, spot, source,
raw_sha256, rows_total). It is gzipped with a zero mtime, so the same sample always gives the same bytes. The
ledger's `snapshot` record holds the raw payload's SHA-256 (what the fills saw) and the stored file's SHA-256.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from traderec.options.chain import CHAIN_COLUMNS, OptionChain, chain_root, parse_occ

SNAPSHOT_DIR = "options"
META_PREFIX = "#meta "
DEFAULTS = {"max_bytes_per_day": 100_000, "min_dte": 20, "max_dte": 120, "max_expiries": 12,
            "moneyness": 0.25, "strike_step": 0.025}
MAX_LEVEL = 6                  # coarsening steps tried before falling back to the legs alone
_DECIMALS = {"strike": 3, "bid": 4, "ask": 4, "mid": 4, "iv": 4, "delta": 4, "gamma": 6, "theta": 4, "vega": 4}
_COUNTS = ("open_interest", "volume")


def snapshot_config(cfg_snapshots: dict | None) -> dict[str, Any]:
    """options.snapshots from the constitution, with DEFAULTS for missing keys."""
    return {**DEFAULTS, **(cfg_snapshots or {})}


def snapshot_dir(state_root: Path, date: str) -> Path:
    """state/options/<date>/ under the state directory `state_root`."""
    return Path(state_root) / SNAPSHOT_DIR / date


def snapshot_name(chain: OptionChain) -> str:
    """"XSP-1017.csv.gz": the chain's root and the ET hour and minute of its quotes."""
    ts = pd.Timestamp(chain.asof)
    return f"{chain.underlying}-{ts.strftime('%H%M')}.csv.gz"


def day_bytes(state_root: Path, date: str, *, exclude: tuple[str, ...] = ()) -> int:
    """Bytes of the snapshot files already stored for `date`, except the file names in `exclude`."""
    folder = snapshot_dir(state_root, date)
    if not folder.is_dir():
        return 0
    return sum(p.stat().st_size for p in folder.glob("*.csv.gz") if p.name not in exclude)


def _weekly(expiries: list[str]) -> list[str]:
    """The last listed expiry of each ISO week (the Friday one when listed), in date order."""
    by_week: dict[tuple[int, int], str] = {}
    for e in sorted(expiries):
        iso = pd.Timestamp(e).isocalendar()
        by_week[(iso[0], iso[1])] = e
    return sorted(by_week.values())


def _surface(chain: OptionChain, cfg: dict[str, Any], level: int) -> pd.DataFrame:
    """The surface sample at coarsening `level` (0 = finest)."""
    f = chain.frame
    if f.empty or not chain.spot:
        return f.iloc[0:0]
    day = pd.Timestamp(str(chain.asof)[:10])
    dte = (pd.to_datetime(f["expiry"]) - day).dt.days
    lo, hi = chain.spot * (1 - float(cfg["moneyness"])), chain.spot * (1 + float(cfg["moneyness"]))
    near = f[(dte >= int(cfg["min_dte"])) & (dte <= int(cfg["max_dte"])) & (f["strike"] >= lo) & (f["strike"] <= hi)]
    if near.empty:
        return near
    expiries = _weekly([str(e) for e in near["expiry"].unique()])
    n = max(1, int(cfg["max_expiries"]) >> level)
    if len(expiries) > n:
        picks = np.unique(np.round(np.linspace(0, len(expiries) - 1, n)).astype(int))
        expiries = [expiries[i] for i in picks]
    step = float(cfg["strike_step"]) * (2 ** level)
    k = int(float(cfg["moneyness"]) / step + 1e-9)
    grid = chain.spot * (1.0 + step * np.arange(-k, k + 1))
    parts = []
    for _, g in near[near["expiry"].isin(expiries)].groupby(["expiry", "right"], sort=True):
        strikes = np.unique(g["strike"].to_numpy(dtype=float))
        chosen = {float(strikes[int(np.argmin(np.abs(strikes - x)))]) for x in grid}
        parts.append(g[g["strike"].isin(chosen)])
    return pd.concat(parts) if parts else near.iloc[0:0]


def sample(chain: OptionChain, keep_occ: set[str], cfg_snapshots: dict | None = None, *, level: int = 0,
           surface: bool = True) -> pd.DataFrame:
    """The rows to store: every contract in `keep_occ`, plus the surface sample at `level` when `surface`."""
    cfg = snapshot_config(cfg_snapshots)
    f = chain.frame
    parts = [f[f["occ"].isin(keep_occ)]]
    if surface:
        parts.append(_surface(chain, cfg, level))
    rows = pd.concat(parts).drop_duplicates("occ")
    return rows.sort_values(["expiry", "right", "strike", "occ"], kind="stable")[CHAIN_COLUMNS].reset_index(drop=True)


def encode(chain: OptionChain, rows: pd.DataFrame) -> bytes:
    """The gzipped file: a `#meta {json}` line, then the rows as CSV (prices rounded, counts as integers)."""
    meta = {"underlying": chain.underlying, "asof": chain.asof, "spot": chain.spot, "source": chain.source,
            "raw_sha256": chain.raw_sha256, "rows_total": int(len(chain.frame))}
    out = rows.copy()
    for col, places in _DECIMALS.items():
        out[col] = pd.to_numeric(out[col], errors="coerce").round(places)
    for col in _COUNTS:
        out[col] = pd.to_numeric(out[col], errors="coerce").round().astype("Int64")
    text = META_PREFIX + json.dumps(meta, sort_keys=True) + "\n" + out.to_csv(index=False, lineterminator="\n")
    return gzip.compress(text.encode("utf-8"), compresslevel=9, mtime=0)


def load_snapshot(path: Path) -> OptionChain:
    """Read a stored snapshot back as an OptionChain (for reviews and re-pricing on real quotes)."""
    text = gzip.decompress(Path(path).read_bytes()).decode("utf-8")
    first, _, body = text.partition("\n")
    if not first.startswith(META_PREFIX):
        raise ValueError(f"{path} is not a traderec option snapshot")
    meta = json.loads(first[len(META_PREFIX):])
    frame = pd.read_csv(io.StringIO(body), dtype={"occ": str, "root": str, "right": str, "expiry": str,
                                                  "last_trade_time": str})
    for col in CHAIN_COLUMNS:
        if col not in ("occ", "root", "right", "expiry", "last_trade_time"):
            frame[col] = pd.to_numeric(frame[col], errors="coerce").astype(float)
    return OptionChain(underlying=meta["underlying"], asof=meta["asof"], spot=float(meta["spot"]),
                       source=meta["source"], frame=frame[CHAIN_COLUMNS], raw_sha256=meta.get("raw_sha256"))


def _write(path: Path, data: bytes) -> None:
    """Atomic write: a temp file in the same folder, then os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".snap-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def store(state_root: Path, date: str, chain: OptionChain, keep_occ: set[str], cfg_snapshots: dict | None, *,
          surface: bool, budget: int) -> dict[str, Any]:
    """Write the sampled snapshot of `chain` for `date`, within `budget` bytes where the sample allows.

    The surface is coarsened level by level until the file fits `budget`. If even the coarsest surface does
    not fit, only the legs are written: they are always kept, whatever the budget.

    Returns {"path" (relative to the state directory), "bytes", "file_sha256", "rows", "rows_total",
    "level", "surface", "legs_kept", "legs_missing"}. legs_missing lists the `keep_occ` contracts of this
    chain's root that the chain does not list.
    """
    level, used_surface = 0, surface
    while True:
        rows = sample(chain, keep_occ, cfg_snapshots, level=level, surface=used_surface)
        data = encode(chain, rows)
        if len(data) <= budget or not used_surface:
            break
        if level >= MAX_LEVEL:
            used_surface = False
            continue
        level += 1
    path = snapshot_dir(state_root, date) / snapshot_name(chain)
    _write(path, data)
    listed = set(chain.frame["occ"])
    mine = {o for o in keep_occ if _chain_of(o) == chain.underlying}
    return {"path": path.relative_to(Path(state_root)).as_posix(), "bytes": len(data),
            "file_sha256": hashlib.sha256(data).hexdigest(), "rows": int(len(rows)),
            "rows_total": int(len(chain.frame)), "level": level if used_surface else None, "surface": used_surface,
            "legs_kept": sorted(mine & listed), "legs_missing": sorted(mine - listed)}


def _chain_of(occ: str) -> str | None:
    """The chain an OCC symbol belongs to ("SPXW..." -> "SPX"), or None for a malformed symbol."""
    try:
        return chain_root(parse_occ(occ)["root"])
    except ValueError:
        return None
