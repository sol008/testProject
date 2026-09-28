"""Machine-readable synthesis for the recommendation-engine design:
  output/archetypes.csv     edge archetypes scored on payoff, identifiability, frequency, access, survivability
  output/survivorship.csv   famous winner vs. the same bet that lost, with denominator evidence
  output/design_rules.csv   proposed engine rules with default parameters (to be calibrated)

Scores are judgmental (1 = poor, 5 = good), informed by the computed tables in this folder
(generational_lows, exante_rules, opportunity_frequency, crash_base_rates, peg_breaks,
long_winner_pain, sizing_sim) and the literature cited in catalog.py.
"""
from __future__ import annotations

import pandas as pd

from common import OUT_DIR

ARCHETYPES = [
    # code, name, examples, typical multiple, identifiability, setups/decade, access, survivability, main failure modes, survivorship, verdict, rank
    ("CRISIS-I", "Crisis buying of broad markets", "1932, 1942, 1974, 1982, 2009, 2020, 2025 lows; Templeton 1939",
     "1.5-2x real in 5y; 50-1,800x over decades", 5, "US >=40% drawdown ~0.4; VIX>=40 ~3.6; each foreign index 0.2-1.5", 5, 5,
     "Being early (further -30% to -77%); country failure (Japan 1990, China 2007); leverage; panic selling",
     "Low (unlevered US); high across countries", "CORE deployment rule (tranches)", 1),
    ("CONVEX", "Cheap convexity before a regime change", "Tudor/Taleb 1987; Cornwall, Paulson, Burry, Bass, Lahde 2007; Universa & Ackman 2020",
     "30-100x on premium; +20-70% of NAV when it pays", 3, "~1-1.5 paying events (>=20% S&P fall within 3 months: 1.35/decade since 1945)", 4, 4,
     "Premium bleed (~-3%/yr tail index); wrong strike/expiry; not monetising; OTC counterparty",
     "High", "OPPORTUNISTIC with strict premium budget; proceeds redeployed via CRISIS-I", 2),
    ("FORCED", "Forced/structural seller; liquidity provision", "Graham's GEICO block; Templeton lock-up shorts; Buffett GS/BAC; Arnold vs Amaranth",
     "1.2-3x (more in crises)", 4, "continuous; clustered in crises", 3, 4,
     "Catching falling knives; the forced selling continues", "Moderate", "SATELLITE (index deletions, spin-offs, CEF discounts, tax-loss, fallen angels)", 3),
    ("INFO", "Legal information-processing edge", "Thales; Munger/Belridge; Burry's prospectus reading; Arnold; Theo's polls",
     "2-30x", 3, "continuous", 4, 3, "Overconfidence (hit-rate overestimation); crowding; MNPI legal risk",
     "High", "SATELLITE - the AI engine's natural comparative advantage; always haircut probabilities", 4),
    ("CRISIS-C", "Crisis buying of impaired franchises / distressed assets", "AmEx 1964; WaPo 1973; GEICO 1976; Li Ka-shing; Slim; Carvana 2022; Nvidia 2022",
     "2.5-130x", 3, "10+ per bear market", 4, 3, "Value traps; bankruptcy; dilution", "High",
     "SATELLITE via baskets of 10-30 names or senior securities", 5),
    ("COMPOUND", "Long-duration compounding of a winner", "GEICO 1948; Coca-Cola; Amazon; Monster; Nvidia; BYD",
     "10-6,000x over 10-40 years", 2, "continuous (~7 US 100-baggers/yr in hindsight)", 5, 3,
     "50-96% drawdowns; decade-flat periods; the 96% of stocks that are not winners", "Extreme",
     "SATELLITE: let winners run, trim above 20-25% of portfolio", 6),
    ("MANIA-L", "Riding a reflexive mania and exiting", "Thomas Guy; Cantillon; Tesla 2019-21; MSTR; BTC cycles; silver 2025-26",
     "5-500x", 3, "1-3 major (+ crypto cycles)", 5, 2, "Round-trips of -50% to -99.8%; late entry; re-entry; leverage cascades",
     "Very high", "SATELLITE with trend filter + profit ladder + cooling-off; small", 7),
    ("PEG", "Peg / policy-regime break", "Soros 1985 & 1992; Druckenmiller DM 1989; gold 1971; SNB 2015",
     "10-80% underlying; 5-50x on options", 3, "1-3 major; EM breaks ~yearly", 2, 4,
     "Peg holds (carry, squeezes); capital controls; broker failure", "Medium", "OPPORTUNISTIC, defined risk, <=1-2% max loss", 8),
    ("EVENT", "Special situations", "Hertz 2020; SPAC warrants 2020",
     "2-15x", 3, "several per year", 4, 2, "Ch.11 equity usually -> 0; dilution", "High", "OPPORTUNISTIC, small", 9),
    ("EARLY", "Early adoption (venture-like)", "BTC; ETH ICO; SOL; Alibaba; Facebook",
     "1,000-2,500,000x", 1, "1-3 mega", 2, 1, "Total loss is the base case", "Extreme", "LOTTERY budget only (<=1% total)", 10),
    ("SHORT", "Fundamental short (fraud / leverage / bubble)", "Chanos-Enron; Einhorn-Lehman; Livermore 1929",
     "<=1x on shares; puts 5-20x", 2, "several", 3, 1, "Squeezes; being early; borrow recall; short bans", "Very high",
     "AVOID naked shorts; tiny put positions only", 11),
    ("SQUEEZE", "Corner / short squeeze", "Northern Pacific 1901; Vanderbilt; VW 2008; GME 2021",
     "3-125x in days-months", 2, "~1 mega", 4, 1, "Violent reversal; high-SI stocks underperform; manipulation law", "Extreme",
     "AVOID (<=0.5% lottery at most)", 12),
]

SURVIVORSHIP = [
    ("Soros & Druckenmiller vs GBP (1992)", "HKD attackers (1998; 2016-20); CNY shorts squeezed (2016); DKK 2015; SNB-floor vol sellers (Everest 2015)",
     "HKD 1.5% and DKK ~1% robust ranges since 1998/1999 (peg_holds.csv); Frankel & Rose (1996)"),
    ("Paulson / Burry / Bass (2007)", "JGB 'widowmaker'; Tiger 1999-2000; Hayman after 2008 (~1.6%/yr to 2015); Kynikos funds closed 2023; Hindenburg closed 2025",
     "Short-constrained stocks underperform but with high variance and squeeze risk (Asquith, Pathak & Ritter 2005)"),
    ("Tudor / Taleb / Universa / Ackman (crash convexity)", "Tail-hedge buyers 2009-2019; the viral 2013-14 '1929 analog' chart",
     "CBOE Eurekahedge Tail Risk index ~-3.2%/yr 2008-2020; median rolling 12m ~-7%"),
    ("Keith Gill / VW / Northern Pacific (squeezes)", "Late GME (-88%) and AMC (-99.8%) buyers; BBBY (bankrupt 2023); Piggly Wiggly 1923; Hunt silver 1980",
     "Short-constrained stocks -2.15%/month EW 1988-2002 (Asquith, Pathak & Ritter 2005)"),
    ("Nvidia / Amazon / Monster / GEICO (compounders)", "Cisco (21.4 yrs under water incl. dividends), Intel (17.5), MSTR (24.7), Lucent, Nortel, Enron",
     "4.3% of US stocks = all net wealth; 57% lag T-bills (Bessembinder 2018); >40% of R3000 stocks with unrecovered -70% (J.P. Morgan)"),
    ("BTC / ETH / SOL (early adoption)", "LUNA, FTT, most 2017-18 ICOs, 2021-25 memecoins", "53.2% of ~20.2m tokens since 2021 dead; 11.6m died in 2025 (CoinGecko 2026)"),
    ("Templeton 1939 / 1932 / 2009 (crisis buying)", "Japan 1990 (33 yrs to price break-even), Shanghai 2007 & Hang Seng 2018 (unrecovered), Russia 1917 / China 1949 (total loss), 1929 margin buyers",
     "Jorion & Goetzmann (1999): the US is the survivor market"),
    ("Carvana / Hertz (distressed equity)", "Lehman, WaMu, BBBY, WeWork equity; Hertz post-emergence buyers (-96%)", "J.P. Morgan catastrophic-loss statistic"),
    ("Theo 2024 / Trump 2016 long-shot", "2020 post-election Trump bettors; 2022 'red wave' bettors", "Zero-sum after fees; favorite-long-shot bias (Snowberg & Wolfers 2010)"),
    ("SPAC warrant winners 2020", "2021-22 de-SPAC buyers", "Non-redeeming holders: mean -64%, median -88% market-adjusted (Klausner, Ohlrogge & Ruan 2022)"),
    ("Buffett/Graham concentration", "Ackman-Valeant (~$4bn loss); Enron 401(k)s; Legg Mason Value Trust 2008 (reported -55%)", "J.P. Morgan concentrated-stock research"),
    ("'A few big day-trading wins'", "97% of persistent Brazilian day traders lost; <1% of Taiwanese day traders reliably profitable", "Chague et al. (2019); Barber et al. (2014); Barber & Odean (2000)"),
]

RULES = [
    ("R0", "Objective", "Maximise long-run geometric growth subject to a hard ruin constraint; each email states max loss ($ and %), P(total loss), P(>=2x), P(>=5x), horizon, reference class incl. failures", "11x needs 27%/yr over 10y, 17.3% over 15y, 12.7% over 20y, 8.3% over 30y"),
    ("R1", "Architecture", "Unlevered diversified equity-index core", "core 60-90%"),
    ("R2", "Architecture", "Opportunity sleeve of max 3-8 positions; idle cash in T-bills; total open max-loss capped", "sleeve 10-40%; total satellite max loss <=15%; convexity+lottery premium <=2-3%/yr"),
    ("R3", "Admission", "Archetype with reference class of >=N analogs incl. failures; base rates computed", "N >= 10"),
    ("R4", "Admission", "Positive EV after shrinking model probability toward base rate and after costs/taxes", "shrink 25-50%"),
    ("R5", "Admission", "Max loss defined at entry (premium / unlevered long / hedged); stops do not define max loss", ""),
    ("R6", "Admission", "Asymmetry: expected upside vs max loss; crisis index buys need base-rate 5y real multiple", ">=3:1 satellites; >=1.5x crisis buys"),
    ("R7", "Admission", "Catalyst or valuation anchor; option expiry exceeds catalyst window", "expiry >= 2x window"),
    ("R8", "Admission", "Liquidity", "<=1% ADV; <=5% option OI; exit within 1 day; no physically settled futures into expiry"),
    ("R9", "Admission", "US-regulated venue with segregation; crypto only via regulated ETFs/self-custody", ""),
    ("R10", "Admission", "No MNPI, no coordination/manipulation; prediction markets only where legal", ""),
    ("R11", "Sizing", "Size = min(archetype max-loss cap, fractional Kelly on shrunk probability)", "Kelly fraction 0.25-0.5; lottery 0.5-1%; convexity 0.5%/qtr (1% with catalyst); peg 1-2%; single-name catalyst 3-5%; distressed basket 2-3%/name"),
    ("R12", "Sizing", "No gross leverage above 1.0x, no margin loans", "gross <= 1.0x"),
    ("R13", "Playbook: crisis buy", "Deploy sleeve cash into broad index in thirds at drawdown triggers or VIX spike; CAPE adds a tranche; hold >=3-5y", "S&P DD -30/-40/-50% from ATH or VIX close >=45; CAPE<12; <=1/3 per country ETF"),
    ("R14", "Playbook: convexity", "Buy long-dated OTM index put spreads / credit-ETF puts / VIX calls when vol is cheap AND a catalyst is emerging; ladder out; redeploy into R13", "VIX < 14 (bottom quintile); sell 1/3 at 5x, 1/3 at 10x, rest at 20x or VIX >45"),
    ("R15", "Playbook: peg break", "Flag when >=3 of: reserve cover falling; real overvaluation; anchor-policy divergence; low carry; political stress; defined-risk options only", "reserves -20% in 6m or <3-4 months imports; REER >15% over 10y avg; carry <3%/yr; max loss <=1-2%"),
    ("R16", "Playbook: mania", "Enter only with trend confirmation; profit ladder; trailing stop; cooling-off; never short with shares", "<=5% at cost; sell 25% at 2x & 4x; 30% trailing stop or close < 200-dma; no re-entry for 3 months"),
    ("R17", "Playbook: distressed", "Baskets or senior securities; runway requirement; veto common equity of companies in Chapter 11", "10-30 names; >=24 months liquidity runway"),
    ("R18", "Playbook: compounders", "Do not sell merely because up 5-10x; trim concentration; accept deep drawdowns only on small cost bases", "trim >20-25% of portfolio; <=5% cost basis"),
    ("R19", "Playbook: prediction markets", "Only with a >= threshold gap AND a named informational edge; fees and resolution risk included", "gap >=10 pts; max loss <=1-2% per market"),
    ("R20", "Hard vetoes", "Margin/leverage >1.0x; naked short options; short-vol ETPs; shorts with high SI/borrow; multi-day leveraged/inverse ETPs; averaging down on levered losers; >25% single issuer incl. employer; algorithmic stablecoins / unexplained yield; offshore custody; MNPI/coordination", "SI >20% of float or borrow >10% = no short"),
    ("R21", "Exits", "Pre-register invalidation condition, time stop, profit ladder, gap handling in every email", "time stop = 1.5x catalyst window"),
    ("R22", "Communication", "Name the losers in each trade's reference class", ""),
    ("R23", "Calibration", "Immutable ex-ante log of probabilities, archetype, reference class, max loss, horizon", ""),
    ("R24", "Calibration", "Monthly scoring: Brier/log score, calibration by archetype, realised vs predicted multiple, slippage, rule adherence, graveyard ledger of rejected ideas", ""),
    ("R25", "Calibration", "Beta/Bayesian priors per archetype with prior strength = reference-class size; change caps only after enough resolved trades; never loosen vetoes after wins", "prior strength 10-30; >=10-20 resolved trades"),
    ("R26", "Risk governor", "Freeze new satellite trades if portfolio drawdown or satellite max-loss budget breached", "portfolio DD >25%"),
    ("R27", "Cadence", "Expect 0-2 tier-1 setups per year; recommending nothing for months is correct", ""),
]


def main():
    a = pd.DataFrame(ARCHETYPES, columns=["code", "archetype", "examples", "typical_multiple_on_risk", "identifiability_1to5",
                                          "setups_per_decade", "retail_access_1to5", "survivability_1to5",
                                          "failure_modes", "survivorship_severity", "engine_verdict", "rank_for_retail_engine"])
    a.to_csv(OUT_DIR / "archetypes.csv", index=False)
    s = pd.DataFrame(SURVIVORSHIP, columns=["famous_winner", "same_bet_that_lost", "denominator_evidence"])
    s.to_csv(OUT_DIR / "survivorship.csv", index=False)
    r = pd.DataFrame(RULES, columns=["rule_id", "area", "rule", "default_parameters"])
    r.to_csv(OUT_DIR / "design_rules.csv", index=False)
    print(len(a), "archetypes;", len(s), "survivorship rows;", len(r), "rules")


if __name__ == "__main__":
    main()
