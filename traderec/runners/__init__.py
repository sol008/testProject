"""Phase B module runners: the pipeline calls these hooks (docs/PHASE_B_CONTRACTS.md §7).

Each runner module exposes `daily(run, checks)` for the 22:17 ET run. Spread modules (m4, macro) also expose
`on_spread_fill(run, fill, intent)` and `on_spread_cancel(run, intent, reason)` for the 10:17 ET options job,
and any runner may expose `options_job(run, chains)` and `roots_needed(run)`.

Order in the daily run: M1 -> W10 -> M4 -> M2 -> M3 -> W8/W9 -> Phase A shadow -> SHADOW_RUNNERS.
Trading runners raise like Phase A modules; shadow runners are guarded (an exception becomes an alert).
"""
from __future__ import annotations

from . import crypto, edgar, m4, macro, macro_shadows, option_shadows

# Shadow books (no emails), run after the Phase A shadow book, each inside the pipeline's guard.
SHADOW_RUNNERS = ("option_shadows", "crypto", "edgar", "macro_shadows")
# Modules whose paper orders are spreads filled by the options job, and the runner that owns them.
SPREAD_MODULES = {"M4": m4, "W8": macro, "W9": macro}
# Runners that do work at the 10:17 ET snapshot (options_job) or ask for roots to snapshot (roots_needed).
OPTIONS_JOB_RUNNERS = ("m4", "macro", "option_shadows")

__all__ = ["OPTIONS_JOB_RUNNERS", "SHADOW_RUNNERS", "SPREAD_MODULES", "crypto", "edgar", "m4", "macro",
           "macro_shadows", "option_shadows"]
