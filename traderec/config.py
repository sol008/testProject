"""Load the YAML configuration: accounts, the strategy constitution and the instrument whitelist."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"
STATE_DIR = REPO_ROOT / "state"


@dataclass(frozen=True)
class Config:
    account: dict[str, Any]
    constitution: dict[str, Any]
    whitelist: dict[str, Any]
    constitution_sha256: str

    @property
    def version(self) -> str:
        return str(self.constitution["version"])

    def module(self, name: str) -> dict[str, Any]:
        return self.constitution["modules"][name]

    def shadow(self, name: str) -> dict[str, Any]:
        return self.constitution["shadow"][name]

    @property
    def risk(self) -> dict[str, Any]:
        return self.constitution["risk"]

    @property
    def fills(self) -> dict[str, Any]:
        return self.constitution["fills"]

    @property
    def data(self) -> dict[str, Any]:
        return self.constitution["data"]

    @property
    def mode(self) -> str:
        return str(self.account.get("mode", "paper"))

    def is_whitelisted(self, ticker: str) -> bool:
        return ticker in (self.whitelist.get("robinhood") or {}) or ticker in (self.whitelist.get("coinbase") or {})

    def slippage_bps(self, ticker: str) -> float:
        table = self.fills["slippage_bps"]
        return float(table.get(ticker, table["default"]))


def load_config(config_dir: Path | None = None) -> Config:
    d = Path(config_dir) if config_dir else CONFIG_DIR
    const_text = (d / "constitution.yaml").read_text()
    return Config(
        account=yaml.safe_load((d / "account.yaml").read_text()),
        constitution=yaml.safe_load(const_text),
        whitelist=yaml.safe_load((d / "whitelist.yaml").read_text()),
        constitution_sha256=hashlib.sha256(const_text.encode()).hexdigest(),
    )
