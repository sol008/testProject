"""Command line: `python -m traderec <command>`.

    init          [--nav 100000] [--date D] [--if-missing]   create state/state.json and an empty ledger
    daily         [--date D] [--dry-run] [--force]            22:17 ET job: fills, marks, M1/M2/M3, emails
    weekly        [--date D] [--dry-run] [--force]            Sunday-night ET job: the Bitcoin switch (M3)
    monthly       [--month YYYY-MM] [--dry-run] [--force]     the monthly review email
    verify-ledger                                             recompute the ledger's hash chain
    status                                                    print the paper book

Dates are New York (ET) dates. Defaults: daily = the latest session whose close is final (so a run delayed
past midnight still processes the evening it was meant for), weekly = the most recent Sunday, monthly = the
month that just ended. Exit codes: 0 done (or nothing to do),
3 today's data is not available yet (retry later), 1 error.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import STATE_DIR, load_config

EXIT_OK, EXIT_ERROR, EXIT_RETRY = 0, 1, 3


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m traderec", description=__doc__.split("\n\n")[0])
    p.add_argument("--state-dir", type=Path, default=STATE_DIR, help="state directory (default: state/)")
    p.add_argument("--config-dir", type=Path, default=None, help="config directory (default: config/)")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("init", help="create the state and an empty ledger")
    s.add_argument("--nav", type=float, default=None, help="paper notional (scales account.yaml start cash)")
    s.add_argument("--date", default=None, help="creation date (ET, YYYY-MM-DD)")
    s.add_argument("--if-missing", action="store_true", help="do nothing if the state already exists")

    for name, helptext in (("daily", "after-close run (22:17 ET)"), ("weekly", "Bitcoin switch (Sunday night ET)")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--date", default=None, help="ET date to run for (default: see above)")
        s.add_argument("--dry-run", action="store_true", help="work on a copy of the state; write emails to state/outbox")
        s.add_argument("--force", action="store_true", help="re-run the most recent run from its pre-run snapshot")

    s = sub.add_parser("monthly", help="monthly review email")
    s.add_argument("--month", default=None, help="YYYY-MM (default: the month that just ended)")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true")

    # Phase B (docs/PHASE_B_CONTRACTS.md)
    s = sub.add_parser("options", help="10:17 ET options job: chain snapshots and paper spread fills")
    s.add_argument("--date", default=None, help="ET date to run for (default: today in New York)")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true")
    s = sub.add_parser("hourly", help="hourly 24/7 crypto job (shadow books)")
    s.add_argument("--dry-run", action="store_true")
    s = sub.add_parser("quarterly", help="quarterly review email")
    s.add_argument("--quarter", default=None, help="YYYY-Qn (default: the quarter that just ended)")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true")
    s = sub.add_parser("annual", help="annual review email")
    s.add_argument("--year", default=None, help="YYYY (default: the year that just ended)")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true")

    sub.add_parser("verify-ledger", help="recompute the ledger's hash chain")
    sub.add_parser("status", help="print the paper book")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    cfg = load_config(args.config_dir)
    from . import pipeline  # imported late so `--help` works without the data stack

    if args.command == "init":
        res = pipeline.run_init(cfg, args.state_dir, nav=args.nav, created=args.date, if_missing=args.if_missing)
        print(res.summary())
        return EXIT_OK
    if args.command == "verify-ledger":
        ok, why = pipeline.verify_ledger(args.state_dir)
        print(("OK: " if ok else "FAILED: ") + why)
        return EXIT_OK if ok else EXIT_ERROR
    if args.command == "status":
        print(pipeline.status_text(cfg, args.state_dir))
        return EXIT_OK

    from .data import LiveProvider
    provider = LiveProvider(cfg)
    if args.command == "daily":
        res = pipeline.run_daily(cfg, provider, args.state_dir, date=args.date, dry_run=args.dry_run,
                                 force=args.force)
    elif args.command == "weekly":
        res = pipeline.run_weekly(cfg, provider, args.state_dir, date=args.date, dry_run=args.dry_run,
                                  force=args.force)
    elif args.command == "options":
        from .options.job import run_options
        res = run_options(cfg, provider, args.state_dir, date=args.date, dry_run=args.dry_run, force=args.force)
    elif args.command == "hourly":
        from .runners.crypto import run_hourly
        res = run_hourly(cfg, provider, args.state_dir, dry_run=args.dry_run)
    elif args.command == "quarterly":
        from .reports import run_quarterly
        res = run_quarterly(cfg, provider, args.state_dir, quarter=args.quarter, dry_run=args.dry_run,
                            force=args.force)
    elif args.command == "annual":
        from .reports import run_annual
        res = run_annual(cfg, provider, args.state_dir, year=args.year, dry_run=args.dry_run, force=args.force)
    else:
        res = pipeline.run_monthly(cfg, provider, args.state_dir, month=args.month, dry_run=args.dry_run,
                                   force=args.force)
    print(res.summary())
    if res.status == "data_missing":
        return EXIT_RETRY
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
