"""Structured catalog of history's highest-return concentrated trades and of the great blowups.

Running this file writes:
  output/trade_catalog.csv, output/blowups.csv      (machine-readable, for the design team)
  output/catalog_tables.md                         (markdown tables/cards pasted into the report)

Confidence grades
  A = market data we recomputed (see other scripts) or audited/filed numbers (SEC filings,
      Berkshire letters, fund letters quoted by several major outlets)
  B = consistent across several reputable secondary sources (books by financial historians,
      major financial press), but not audited
  C = single-source, self-reported, or folklore; treat numbers as order-of-magnitude at best

Archetype codes (see report section 3)
  PEG      peg / policy-regime break          FORCED   forced or structural seller / liquidity provision
  CRISIS-I crisis buying of a broad market    CRISIS-C crisis buying of an impaired franchise / distressed asset
  MANIA-L  riding a reflexive mania and exiting  SHORT    fundamental short of fraud / over-leverage / bubble
  CONVEX   cheap convexity before a regime change  COMPOUND long-duration compounding of a winner
  SQUEEZE  corner / short squeeze             INFO     information-processing / analytical edge (legal)
  EARLY    early adoption of a new asset or platform (venture-like)   EVENT special situation
"""
from __future__ import annotations

import pandas as pd

from common import OUT_DIR

T = []  # trades


def t(**kw):
    T.append(kw)


# ----------------------------------------------------------------------------------------------
# Ancient & early modern
t(name="Thales of Miletus - olive presses", period="c. 6th c. BC", era="Ancient & early modern",
  instrument="Deposits reserving all olive presses in Miletus & Chios (a call option on press capacity)",
  entry_exit="Paid small off-season deposits; rented presses out at his own price when a bumper harvest came",
  ret_risk="Unquantified ('made a lot of money'); premium was small", portfolio="Unknown", hold="One season",
  hold_years=0.5, decisions="2", archetype="CONVEX", archetype2="INFO / corner",
  signals="Forecast of a large harvest (attributed to astronomy); no competing bidders in winter",
  sizing="Small premium ('a little money')", failure="Poor harvest -> deposits lost (loss capped at premium)",
  confidence="C", sources="Aristotle, Politics I.11 (1259a), written ~250 years later as a parable")
t(name="Richard Cantillon - Mississippi System", period="1719-1720", era="Ancient & early modern",
  instrument="Mississippi Co. shares, then short the livre / Law's paper via bills of exchange; loans against shares",
  entry_exit="Bought early, sold into the 1719 surge (shares 500 -> ~10,000 livres), moved into foreign currency, then collected on loans after the crash",
  ret_risk="'Two fortunes'; magnitude uncertain (tens of millions of livres claimed)", portfolio="Most of his bank's capital",
  hold="~1-2 years", hold_years=1.5, decisions="Several", archetype="MANIA-L", archetype2="PEG (monetary regime)",
  signals="Law printing unbacked notes to hold shares at 9,000 livres -> currency must fall; insider view of the System",
  sizing="Large", failure="Expelled by Law; years of lawsuits from borrowers; political confiscation risk",
  confidence="C", sources="Murphy (1986) Richard Cantillon: Entrepreneur and Economist")
t(name="Thomas Guy - sells South Sea stock", period="1711-1720", era="Ancient & early modern",
  instrument="South Sea Company stock (long-held)",
  entry_exit="Accumulated for ~GBP 42-54k; sold April-June 1720 for GBP 234,428, months before the September crash",
  ret_risk="~4.5-5.5x on cost", portfolio="'Quintupled his fortune'; funded Guy's Hospital", hold="Years; sale over ~3 months",
  hold_years=5, decisions="Few (sell in tranches)", archetype="MANIA-L", archetype2="",
  signals="Stock up ~8x in 6 months on company-financed purchases and serial subscriptions",
  sizing="Existing core holding", failure="Selling early was the only 'risk'; holding on (like Newton) was the real danger",
  confidence="B", sources="Thomas Guy biographies; Odlyzko (2019) Notes & Records 73(1)")
t(name="Nathan Rothschild - Waterloo myth vs. the consols trade", period="1815-1817", era="Ancient & early modern",
  instrument="British government consols",
  entry_exit="MYTH: killing on early Waterloo news (traced to an 1846 antisemitic pamphlet). FACT (Ferguson): bought consols after the war, sold in 1817 after a >40% rise",
  ret_risk="~+40% on a very large position; ~GBP 600m in today's money (Ferguson)", portfolio="Large", hold="~2 years",
  hold_years=2, decisions="2", archetype="CRISIS-I", archetype2="PEG (war->peace fiscal regime)",
  signals="End of 20+ years of war borrowing -> falling yields; he was initially long gold (wrong side)",
  sizing="Very large", failure="Renewed war/inflation; he first lost on bullion when peace cut demand",
  confidence="B", sources="Ferguson (1998) House of Rothschild; Ferguson (2008) Ascent of Money; Cathcart (2015) The News from Waterloo")
t(name="Cornelius Vanderbilt - Harlem Railroad corners", period="1863-1864", era="Ancient & early modern",
  instrument="Harlem Railroad stock vs. short sellers (incl. NY aldermen)",
  entry_exit="Controlled the float; shorts forced to cover at ~$179 (1863) and ~$285 (1864) vs. ~$10 in 1862",
  ret_risk="Order of 10-30x on stock bought early (uncertain)", portfolio="Large", hold="~2 years", hold_years=2,
  decisions="Few", archetype="SQUEEZE", archetype2="control",
  signals="Shorts > float; opponents' political manipulation", sizing="Control stake",
  failure="Would be illegal manipulation today (Exchange Act s.9)", confidence="C",
  sources="Gordon (1988) The Scarlet Woman of Wall Street; Renehan (2007) Commodore")
t(name="Northern Pacific corner", period="May 1901", era="Ancient & early modern",
  instrument="Northern Pacific common", entry_exit="Harriman vs. Hill/Morgan control fight: ~$100-110 -> $1,000 intraday on 9 May 1901; shorts settled at $150",
  ret_risk="Up to ~10x for holders who sold into the peak", portfolio="n/a", hold="Days", hold_years=0.02,
  decisions="1-2", archetype="SQUEEZE", archetype2="",
  signals="Two buyers competing for a majority + large short interest + delivery deadlines", sizing="n/a",
  failure="Shorts ruined; market-wide panic as they dumped other stocks", confidence="B",
  sources="NYT 10 May 1901; 'Panic of 1901' (Wikipedia summary of contemporary press)")
# ----------------------------------------------------------------------------------------------
# 1900-1945
t(name="Jesse Livermore - Union Pacific short", period="Apr 1906", era="1900-1945",
  instrument="Union Pacific stock (short)", entry_exit="Shorted days before the San Francisco earthquake",
  ret_risk="~$250,000 profit (unknown base)", portfolio="Large", hold="Days-weeks", hold_years=0.05,
  decisions="2", archetype="SHORT", archetype2="event luck", signals="'Hunch' about an extended market; mostly luck",
  sizing="Heavily margined", failure="A rally would have hurt a margined short", confidence="C",
  sources="Lefevre (1923, fictionalised); Smitten (2001); Rubython (2014)")
t(name="Jesse Livermore - Panic of 1907", period="Oct 1907", era="1900-1945",
  instrument="Stocks (short, then long)", entry_exit="Short into the call-money squeeze; reportedly ~$1m in a day, ~$3m for the episode; covered and went long at J.P. Morgan's urging",
  ret_risk="Unknown base; large", portfolio="Most of his capital", hold="Weeks", hold_years=0.1, decisions="Few",
  archetype="SHORT", archetype2="CRISIS-I", signals="Bank runs, call money >100%", sizing="Margined",
  failure="Lost it all within a year (cotton, 1908)", confidence="C", sources="Lefevre (1923); Smitten (2001)")
t(name="Jesse Livermore - 1929 crash", period="1929", era="1900-1945",
  instrument="Stocks (short)", entry_exit="Built shorts through 1929 after early losses; reported ~$100m profit",
  ret_risk="Unknown; figure contested (he denied it at the time)", portfolio="All-in", hold="Months", hold_years=0.5,
  decisions="Many", archetype="SHORT", archetype2="MANIA", signals="Extreme margin debt, speculation, weakening breadth",
  sizing="Heavily leveraged", failure="He was early and lost first; bankrupt again by 1934; suicide 1940",
  confidence="C", sources="Smitten (2001); Rubython (2014)")
t(name="Joseph P. Kennedy - exits before 1929", period="1928-1933", era="1900-1945",
  instrument="Stocks; short sales; trading pools", entry_exit="Sold most stock before the crash and shorted; profited from pools (legal then)",
  ret_risk="Undocumented", portfolio="Emerged richer from 1929 (Nasaw)", hold="Months-years", hold_years=2, decisions="Few",
  archetype="MANIA-L", archetype2="SHORT", signals="Speculative excess (the 'shoeshine boy' story first appears in a 1965 biography - folklore)",
  sizing="Unknown", failure="Pools were outlawed in 1934 - he became the first SEC chairman", confidence="C",
  sources="Nasaw (2012) The Patriarch; Barry Popik on the shoeshine anecdote")
t(name="Buy the 1932 low (rule-based)", period="Jun 1932 ->", era="1900-1945",
  instrument="US stock market (S&P composite, dividends reinvested)",
  entry_exit="Monthly low Jun 1932 (-86% from 1929 top, CAPE 5.6, dividend yield ~14%)",
  ret_risk="Real total return: 2.5x in 1y, 4.0x in 5y, 2.5x in 10y, 8.0x in 20y; 1,808x to date (8.3%/yr real)",
  portfolio="100% if all-in", hold="Any", hold_years=5, decisions="1", archetype="CRISIS-I", archetype2="",
  signals="-86% drawdown, CAPE ~5-6, deflation, bank failures, regime change in policy (1933)", sizing="Unlevered",
  failure="Buying at -80% (Apr 1932) still meant a further -30%; 1937-38 fell 54% again", confidence="A",
  sources="Shiller data; generational_lows.py")
t(name="John Templeton - 104 stocks under $1", period="1939-1943", era="1900-1945",
  instrument="$100 of each of 104 NYSE/AMEX stocks priced <= $1 (34 in bankruptcy)",
  entry_exit="Borrowed $10,000 when WWII began (Sep 1939); sold after ~4 years for ~$40,000; 100 of 104 profitable, 4 worthless",
  ret_risk="~4x on the basket (more on his equity, since fully borrowed)", portfolio="~100% of his net worth, borrowed",
  hold="~4 years", hold_years=4, decisions="2", archetype="CRISIS-I", archetype2="deep-value basket (option-like penny stocks)",
  signals="War panic; stocks priced as options on survival; war demand would revive industry", sizing="All-in on borrowed money, but diversified across 104 names",
  failure="Allied defeat / prolonged depression -> he would owe $10k from salary", confidence="B",
  sources="Templeton & Phillips (2008) Investing the Templeton Way; Templeton biographies")
t(name="Buy the 1942 low (rule-based)", period="Apr 1942 ->", era="1900-1945",
  instrument="US stock market", entry_exit="Monthly low Apr 1942 (-77% below 1929 peak, CAPE 8.5) during Pacific defeats",
  ret_risk="Real TR 1.4x (1y), 1.8x (5y), 3.2x (10y), 12.2x (20y); 760x to date", portfolio="100% if all-in", hold="Any",
  hold_years=10, decisions="1", archetype="CRISIS-I", archetype2="", signals="War news at its worst; CAPE < 10",
  sizing="Unlevered", failure="1946-49 bear market and post-war inflation cut 5-yr real returns", confidence="A",
  sources="Shiller data; generational_lows.py")
# ----------------------------------------------------------------------------------------------
# 1945-1990
t(name="Graham-Newman buys half of GEICO", period="1948-1972", era="1945-1990",
  instrument="Private block: 50% of GEICO from the founding family", entry_exit="Paid $712,500 (~10% below book); stake distributed to fund holders; market value ~$400m at the 1972 peak (reported)",
  ret_risk="~500x over ~24 years", portfolio="~25% of fund assets; Graham: this one decision out-earned all others combined",
  hold="24 years", hold_years=24, decisions="1-2", archetype="COMPOUND", archetype2="FORCED (family block sale)",
  signals="Low-cost direct insurer with superior economics, bought below book from a motivated seller",
  sizing="25% - broke Graham's own diversification rules", failure="GEICO later fell ~95% (1972-76) and nearly failed",
  confidence="B", sources="Graham, The Intelligent Investor (postscript); Graham-Newman histories")
t(name="Buffett Partnership - American Express", period="1964-1968", era="1945-1990",
  instrument="AmEx common", entry_exit="Salad-oil scandal: $61.8 -> $35.3 (Jun 1964); bought ~$13m at ~$41 avg; sold 1967-68",
  ret_risk="~2.5x (commonly cited ~$20m gain)", portfolio="40% of the partnership (his self-imposed cap)", hold="~4 years",
  hold_years=4, decisions="Few", archetype="CRISIS-C", archetype2="INFO (scuttlebutt)",
  signals="Liability finite vs. franchise value; merchants & customers still used AmEx cards/cheques", sizing="40%, unlevered",
  failure="Liability larger than feared / brand damage", confidence="B", sources="Buffett Partnership letters; Fortune (2024)")
t(name="Li Ka-shing - Hong Kong 1967 riots", period="1967-1980s", era="1945-1990",
  instrument="Hong Kong land & buildings", entry_exit="Bought from fleeing owners after the 1967 riots; Cheung Kong (1971) built ~1 in 7 private flats in HK by 1983",
  ret_risk="Unquantified; foundation of a multi-billion fortune", portfolio="Concentrated", hold="Decades", hold_years=20,
  decisions="Few", archetype="CRISIS-C", archetype2="FORCED (emigrating sellers)",
  signals="Political panic + emigration while the administrative/legal system held", sizing="Concentrated, some leverage",
  failure="Chinese takeover/expropriation (the tail that made it cheap)", confidence="B", sources="Wikipedia; HKFP (2016); Bloomberg profile")
t(name="Gold after the Nixon shock", period="1971-1980", era="1945-1990",
  instrument="Gold (US persons: via miners/abroad until 1975)", entry_exit="$35 official (Aug 1971) -> $850 London fix (21 Jan 1980)",
  ret_risk="~20-24x in 8.5 years (silver: $1.3 -> $49.45)", portfolio="n/a", hold="8.5 years", hold_years=8.5,
  decisions="2", archetype="PEG", archetype2="MANIA-L", signals="Bretton Woods strain, falling US gold cover, rising inflation, fixed price below market",
  sizing="n/a", failure="Holders at the 1980 top lost ~2/3 in 2 years and waited until 2008 to break even nominally",
  confidence="A", sources="LBMA/historical fixes")
t(name="Buffett - Washington Post", period="1973-2014", era="1945-1990",
  instrument="WPO class B", entry_exit="$10.6m in the 1973-74 bear (~1/4 of appraised value) -> $221m by 1985",
  ret_risk="~21x in 12 years", portfolio="Large for Berkshire then", hold="~40 years", hold_years=12, decisions="1",
  archetype="CRISIS-C", archetype2="COMPOUND", signals="Private-market value ~$400m vs. ~$80m market cap; Watergate-era pressure; 1974 bear",
  sizing="Unlevered", failure="Fell further after purchase; newspapers' later structural decline", confidence="A",
  sources="Berkshire letters (1985)")
t(name="Buy the 1974 low (rule-based)", period="Oct 1974 ->", era="1945-1990",
  instrument="US stock market", entry_exit="Daily low 3 Oct 1974 (-48%, CAPE 8.3)",
  ret_risk="Real TR 1.3x (1y), 1.4x (5y), 1.9x (10y), 5.3x (20y); 72x to date", portfolio="100% if all-in", hold="Any",
  hold_years=10, decisions="1", archetype="CRISIS-I", archetype2="", signals="-48% drawdown, CAPE < 10, oil shock, stagflation",
  sizing="Unlevered", failure="High inflation in 1977-81 held real returns down for a decade", confidence="A",
  sources="Shiller data; generational_lows.py")
t(name="Buffett - GEICO rescue", period="1976-1995", era="1945-1990",
  instrument="GEICO common + convertible preferred in the recapitalisation", entry_exit="Stock ~$2 (from ~$61 in 1972); $45.7m invested 1976-80 -> $1.68bn market value at end-1994; 1995-96 buy-out of the rest implied ~$2.3bn for Berkshire's half",
  ret_risk="~37x by end-1994 (~50x at the buy-out)", portfolio="Large", hold="~18 years", hold_years=18, decisions="Few",
  archetype="CRISIS-C", archetype2="FORCED (rescue capital)", signals="Franchise intact; new CEO; recapitalisation under way",
  sizing="Unlevered", failure="Failed recap -> wipe-out", confidence="A", sources="Berkshire letters (1976-1995); GEICO 1995 proxy")
t(name="Charlie Munger - Belridge Oil", period="1977-1979", era="1945-1990",
  instrument="Illiquid OTC shares", entry_exit="Bought 300 shares at $115; declined 1,500 more; Shell paid $3,665/share (1979)",
  ret_risk="~32x in <2 years", portfolio="Tiny (~$34.5k) - he called passing on more his biggest error", hold="<2 years",
  hold_years=1.8, decisions="1", archetype="INFO", archetype2="deep value / hidden assets",
  signals="Market cap far below value of oil reserves; illiquidity kept it cheap", sizing="Far too small (declined extra 1,500 shares)",
  failure="Illiquidity; oil price collapse", confidence="B", sources="Munger's own accounts (Wesco/Berkshire meetings)")
t(name="Carlos Slim - Mexico 1982", period="1982-1990s", era="1945-1990",
  instrument="Controlling stakes in Mexican companies", entry_exit="Bought during the debt crisis/capital flight (e.g. Reynolds Aluminum & General Tire affiliates, Sanborns, Frisco ~$50m)",
  ret_risk="Unquantified; seed of a ~$100bn fortune", portfolio="Concentrated", hold="Decades", hold_years=15, decisions="Several",
  archetype="CRISIS-C", archetype2="FORCED (foreign owners exiting)", signals="Default, devaluation, capital flight, foreign parents dumping subsidiaries",
  sizing="Concentrated", failure="Nationalisation (banks were nationalised in 1982)", confidence="B", sources="Encyclopedia.com; Academy of Achievement; Wikipedia")
t(name="Buy the 1982 low (rule-based)", period="Aug 1982 ->", era="1945-1990",
  instrument="US stock market", entry_exit="Daily low 12 Aug 1982 (-27% from 1980 high; CAPE 6.6, 10y yield ~13%)",
  ret_risk="Real TR 1.6x (1y), 3.0x (5y), 3.8x (10y), 7.9x (20y); 58x to date", portfolio="100% if all-in", hold="Any",
  hold_years=10, decisions="1", archetype="CRISIS-I", archetype2="", signals="CAPE < 8 and Volcker pivot (Fed easing summer 1982)",
  sizing="Unlevered", failure="Low drawdown depth: a drawdown rule alone would not have fired", confidence="A",
  sources="Shiller data; generational_lows.py")
t(name="Soros - yen after the Plaza Accord", period="Sep 1985", era="1945-1990",
  instrument="Leveraged long JPY/DEM vs USD", entry_exit="Positions larger than the fund; ~$150m in a day after the 22 Sep 1985 accord",
  ret_risk="JPY +17% in 3 months, +53% in 11 months (FRED)", portfolio="Quantum +122% in 1985", hold="Months", hold_years=0.5,
  decisions="Few", archetype="PEG", archetype2="policy coordination", signals="Overvalued dollar; Baker Treasury shift; G5 meeting",
  sizing="Leverage > 1x NAV", failure="Intervention failure; 1987 shows the same style's crash risk", confidence="B",
  sources="Soros (1987) The Alchemy of Finance; Time; macro_fx_trades.csv")
t(name="Paul Tudor Jones - 1987 crash", period="Oct 1987", era="1945-1990",
  instrument="Short S&P futures / long bonds", entry_exit="Positioned using a 1929 price analog; covered around the crash",
  ret_risk="n/a (futures)", portfolio="+62% in October; +125.9% net for 1987; ~$80-100m personal (est.)", hold="Weeks", hold_years=0.1,
  decisions="Few", archetype="CONVEX", archetype2="SHORT (mania unwind)", signals="+44% YTD rally with 10y yields 7%->10%, weak dollar, portfolio-insurance feedback, 1929 analog",
  sizing="Leveraged futures with tight risk control", failure="Analog charts fail far more often than they work", confidence="B",
  sources="Mallaby (2010) More Money Than God; Tudor Investment Corp. (Wikipedia)")
t(name="Nassim Taleb - 1987 crash", period="Oct 1987", era="1945-1990",
  instrument="Long out-of-the-money Eurodollar futures options", entry_exit="Held a large long-convexity book; Fed liquidity flood made it explode",
  ret_risk="Reported $35-40m for First Boston; multiple on premium unknown", portfolio="Bank book", hold="Months of bleed",
  hold_years=0.5, decisions="Few", archetype="CONVEX", archetype2="", signals="Cheap wings; belief that markets under-price tails",
  sizing="Premium budget", failure="Premium decay if nothing happens (the usual outcome)", confidence="C", sources="Forbes (2009); Bloomberg (2017)")
t(name="Andy Krieger - short NZD", period="Oct-Nov 1987", era="1945-1990",
  instrument="Leveraged NZD options at Bankers Trust", entry_exit="Shorted the kiwi after the crash; reported ~$300m for the bank",
  ret_risk="Unknown (highly levered options)", portfolio="Bank trading book (reported $700m limit)", hold="Days-weeks", hold_years=0.05,
  decisions="Few", archetype="CONVEX", archetype2="liquidity", signals="Thin market, high-yield currency after a global risk shock",
  sizing="Far beyond normal limits", failure="NZD was HIGHER 6 months later (+3.3%, FRED): tactical, not durable; 'bigger than NZ money supply' is folklore",
  confidence="C", sources="Trade press; macro_fx_trades.csv")
t(name="Buffett - Coca-Cola", period="1988-", era="1945-1990",
  instrument="KO common", entry_exit="$1.299bn bought 1988-89 after the crash -> $13.4bn by end-1998",
  ret_risk="~10x in 10 years (plus dividends); flat 1998-2011", portfolio="Largest Berkshire holding", hold="37+ years", hold_years=10,
  decisions="1", archetype="COMPOUND", archetype2="post-crash", signals="Global brand, buybacks, focus under Goizueta; post-crash valuation",
  sizing="Unlevered, concentrated", failure="Over-valuation by 1998 -> 13 flat years", confidence="A", sources="Berkshire letters (1988-1998)")
t(name="Druckenmiller - long D-mark", period="1988-1990", era="1945-1990",
  instrument="Long DEM vs USD", entry_exit="~$1bn position Soros told him to double ('You call that a position?'); after the Wall fell (Nov 1989) bet on reunification + Bundesbank tightening",
  ret_risk="DEM +26% vs USD in 13 months after Oct 1989 (FRED); P&L not documented", portfolio="Large", hold="~1 year",
  hold_years=1, decisions="Few", archetype="PEG", archetype2="central-bank reaction function", signals="Fiscal shock of reunification -> Bundesbank must tighten",
  sizing="Soros-style concentration", failure="Bundesbank accommodation", confidence="C", sources="Schwager (1992) The New Market Wizards; macro_fx_trades.csv")
t(name="Soros & Druckenmiller - sterling", period="Aug-Sep 1992", era="1990-2007",
  instrument="Short GBP vs DEM (forwards/options), ~$10bn at peak", entry_exit="Built through summer 1992; UK left the ERM 16 Sep 1992",
  ret_risk=">$1bn (GBP ~1bn) on sterling; downside was only the ~2-3% to the ERM floor plus carry", portfolio="~+15-20% of Quantum NAV in weeks; UK Treasury cost GBP 3.3bn",
  hold="~2 months", hold_years=0.15, decisions="3 (build, upsize, cover)", archetype="PEG", archetype2="",
  signals="Peg far above fundamentals (UK recession, 10% rates) vs. tightening Bundesbank; Schlesinger remarks 15 Sep; finite reserves",
  sizing="~1.5x NAV - acceptable only because the peg band capped the loss", failure="Realignment or German rate cut -> small loss; France's franc survived similar attacks",
  confidence="B", sources="Mallaby (2010); Black Wednesday (Wikipedia/HM Treasury 2005); peg_breaks.csv")
# ----------------------------------------------------------------------------------------------
# 1990-2007
t(name="SoftBank - Alibaba", period="2000-2014", era="1990-2007", instrument="Private venture stake",
  entry_exit="$20m in 2000 -> ~$58-75bn at the Sept 2014 IPO", ret_risk="~3,000x", portfolio="Small cheque; offset SoftBank's own >90% share-price collapse in 2000-02",
  hold="14 years", hold_years=14, decisions="1", archetype="EARLY", archetype2="", signals="Founder quality; China internet adoption",
  sizing="Small cheque", failure="Most of SoftBank's 2000-era bets failed", confidence="A", sources="Bloomberg (2014); Yahoo 10-K")
t(name="Amazon from the IPO", period="1997-", era="1990-2007", instrument="AMZN common",
  entry_exit="Split-adjusted IPO-era price -> 2026", ret_risk="~2,500x total (Adj. close since May 1997)", portfolio="n/a",
  hold="29 years", hold_years=29, decisions="1", archetype="COMPOUND", archetype2="EARLY",
  signals="Category-defining platform; founder-led; reinvestment runway", sizing="n/a",
  failure="-94% drawdown 1999-2001 and 9.9 years under water (computed)", confidence="A", sources="long_winner_pain.csv")
t(name="Monster Beverage (Hansen Natural)", period="1985-", era="1990-2007", instrument="MNST common",
  entry_exit="1985 -> 2026", ret_risk="~1,250x (Adj. close); best US stock 1995-2015", portfolio="n/a", hold="40 years",
  hold_years=40, decisions="1", archetype="COMPOUND", archetype2="", signals="Tiny, cheap, then a new product category (energy drinks, 2002)",
  sizing="n/a", failure="-96% drawdown 1986-95; 17.6 years under water (computed)", confidence="A", sources="long_winner_pain.csv; CNBC (2024)")
t(name="Jim Chanos - Enron short", period="Nov 2000-Dec 2001", era="1990-2007", instrument="Enron (short)",
  entry_exit="Shorted ~$70-80 after reading the 10-Q; Enron bankrupt Dec 2001 (~$0.26)", ret_risk="~+100% on the short (max for a short)",
  portfolio="Undisclosed (a $500m figure circulates, unverified)", hold="13 months", hold_years=1.1, decisions="Several (added as evidence came)",
  archetype="SHORT", archetype2="INFO", signals="Low ROIC, opaque related-party SPEs, heavy insider selling, 'mark-to-market' earnings",
  sizing="Grew position as thesis confirmed", failure="Squeeze/borrow recall; many other Kynikos shorts lost for years (funds closed 2023)",
  confidence="B", sources="SEC roundtable testimony (Chanos); Barron's")
t(name="John Templeton - shorting IPO lock-up expiries", period="1999-2000", era="1990-2007", instrument="Short ~80+ bubble-era tech IPOs",
  entry_exit="Shorted ~11 days before insider lock-ups expired", ret_risk="Reported ~$86m profit", portfolio="Part of personal portfolio",
  hold="Weeks-months", hold_years=0.3, decisions="Many small", archetype="FORCED", archetype2="SHORT (mania)",
  signals="Stocks up 3x+ since IPO; mechanical insider supply at lock-up expiry", sizing="Spread across many names",
  failure="Mania could keep running; squeeze risk", confidence="C", sources="Templeton & Phillips (2008)")
t(name="Peter Thiel - Facebook", period="2004-2012", era="1990-2007", instrument="Angel note -> ~10% of Facebook",
  entry_exit="$500k (2004) -> >$1bn realised after the 2012 IPO", ret_risk="~2,000x", portfolio="Small cheque", hold="8 years",
  hold_years=8, decisions="2", archetype="EARLY", archetype2="", signals="Network effects visible in campus adoption",
  sizing="Small", failure="Venture base rates: most angel bets return zero", confidence="A", sources="CNBC (2017); TechCrunch (2012)")
t(name="John Arnold - natural gas vs. Amaranth", period="2006", era="1990-2007", instrument="NYMEX natural-gas spreads",
  entry_exit="Took the other side of Amaranth's winter/summer spreads as they collapsed", ret_risk="n/a (futures)",
  portfolio="~$1bn+ profit; Centaurus reportedly up several hundred % in 2006", hold="Months", hold_years=0.5, decisions="Many",
  archetype="INFO", archetype2="FORCED (Amaranth's liquidation)", signals="Visible crowding: one fund holding a huge share of open interest in a few contract months",
  sizing="Large", failure="Squeeze if Amaranth had been able to hold", confidence="B", sources="MoneyWeek; US Senate PSI (2007) report on Amaranth")
t(name="Cornwall Capital (Ledley, Mai, Hockett)", period="2003-2007", era="1990-2007",
  instrument="Cheap long-dated options; then CDS on AA tranches of subprime CDOs",
  entry_exit="$110k Schwab account (2003) -> ~$12-30m by 2006 -> ~$80m+ gain on subprime protection (2007)",
  ret_risk="~100-500x on starting capital over 4 years (reported)", portfolio="Whole fund", hold="4 years", hold_years=4,
  decisions="Dozens of small bets + 1 big one", archetype="CONVEX", archetype2="INFO",
  signals="Options priced with thin tails on binary situations; AA tranches insured for ~0.5%/yr",
  sizing="Many small premium bets; premium never large vs. capital", failure="Counterparty (Bear/Lehman) and bleed",
  confidence="B", sources="Lewis (2010) The Big Short; Cornwall Capital (Wikipedia)")
t(name="John Paulson - subprime CDS", period="2006-2007", era="1990-2007", instrument="CDS/ABX protection on subprime RMBS",
  entry_exit="Bought protection from mid-2006 (~1-2%/yr premium); collected 2007-08", ret_risk="Credit Opportunities fund +590% (2007); firm +$15bn",
  portfolio="Paulson personally ~$3.7bn in 2007", hold="~1.5 years", hold_years=1.5, decisions="Several", archetype="CONVEX",
  archetype2="INFO", signals="Record house-price/income; collapsing lending standards; home-price stalls wipe out BBB tranches; protection cheap",
  sizing="Dedicated funds; premium modest vs. capital", failure="Bleed while housing kept rising; bank counterparties", confidence="B",
  sources="Zuckerman (2009) The Greatest Trade Ever; WSJ; Institutional Investor")
t(name="Michael Burry - Scion subprime CDS", period="2005-2008", era="1990-2007", instrument="CDS on subprime MBS",
  entry_exit="Bought from 2005; investor revolt & side-pocket during the 2006 bleed; paid off 2007", ret_risk="Scion +489% net Nov 2000-Jun 2008 (S&P ~+3%)",
  portfolio="Investors ~$700m, Burry ~$100m", hold="~2-3 years", hold_years=2.5, decisions="Several", archetype="INFO", archetype2="CONVEX",
  signals="Read the prospectuses: teaser-rate ARMs resetting 2007", sizing="Large premium outlay, painful", failure="Nearly lost his investors before being proven right",
  confidence="B", sources="Lewis (2010); Scion (Wikipedia)")
t(name="Kyle Bass - Hayman subprime", period="2006-2007", era="1990-2007", instrument="Subprime CDS", entry_exit="Started 2005 with $33m",
  ret_risk="Subprime fund +212% (2007); ~$500m profit", portfolio="Firm-defining", hold="~1.5 years", hold_years=1.5, decisions="Few",
  archetype="CONVEX", archetype2="INFO", signals="As Paulson", sizing="Dedicated fund",
  failure="Later 'next big short' bets (JGBs, HKD peg) did not pay; 1.6%/yr 2008-mid-2015", confidence="B",
  sources="Kyle Bass (Wikipedia); Fortune (2016)")
t(name="Andrew Lahde - subprime", period="2007", era="1990-2007", instrument="Subprime CDS",
  entry_exit="Small fund (~$80m by 2008); closed Oct 2008 citing counterparty risk", ret_risk="+866% in 2007",
  portfolio="Whole fund", hold="~1 year", hold_years=1, decisions="Few", archetype="CONVEX", archetype2="",
  signals="As Paulson", sizing="Concentrated", failure="Counterparty default (why he quit)", confidence="B", sources="Andrew Lahde (Wikipedia); LA Business Journal")
t(name="David Einhorn - Lehman (and Allied Capital)", period="2002-2008", era="1990-2007", instrument="Short equity",
  entry_exit="Allied: 2002-09 campaign netted only ~$35m; Lehman: short from Jul 2007, public case 2007-08, bankrupt Sep 2008",
  ret_risk="~+100% on the Lehman short", portfolio="Undisclosed", hold="1-7 years", hold_years=1.2, decisions="Several",
  archetype="SHORT", archetype2="INFO", signals="Leverage, questionable marks, shrinking funding", sizing="Moderate",
  failure="Years of regulatory/PR war (Allied); squeezes", confidence="B", sources="Einhorn (2008) Fooling Some of the People; Institutional Investor")
# ----------------------------------------------------------------------------------------------
# 2008-2019
t(name="Porsche SE - Volkswagen options", period="2005-Oct 2008", era="2008-2019", instrument="VW shares + cash-settled options (74.1% combined)",
  entry_exit="Disclosed 26 Oct 2008 -> VW ord. EUR 211 -> >EUR 1,005 intraday (28 Oct); free float <6% vs. ~12% short interest",
  ret_risk="Porsche booked >= EUR 6bn option gains; shorts lost > EUR 20bn", portfolio="Company-level", hold="~3 years", hold_years=3,
  decisions="Few", archetype="SQUEEZE", archetype2="control / disclosure loophole", signals="Stake-building via undisclosed cash-settled options",
  sizing="Bet-the-company", failure="Porsche then nearly collapsed under ~EUR 10bn debt and was absorbed by VW (2009)", confidence="A",
  sources="Harvard Law corpgov (2021) study summary; Porsche disclosure")
t(name="Buffett - Goldman Sachs & Bank of America rescue capital", period="2008-2017", era="2008-2019",
  instrument="10% / 6% preferreds + warrants", entry_exit="GS $5bn (Sep 2008); BAC $5bn (Aug 2011) with warrants on 700m shares at $7.14, exercised 2017",
  ret_risk="BAC warrants alone ~$12bn gain on $5bn; GS ~$3bn+", portfolio="Large", hold="3-6 years", hold_years=5, decisions="2 each",
  archetype="FORCED", archetype2="CRISIS-C", signals="Issuer needed a confidence signal; negotiated terms; senior security + upside",
  sizing="Large but senior", failure="Bank failure (mitigated by seniority and systemic support)", confidence="A",
  sources="BAC 8-K (2011); CNBC (2017)")
t(name="Buffett/Munger - BYD", period="2008-2025", era="2008-2019", instrument="BYD H-shares",
  entry_exit="$230m for ~10% (Sep 2008) -> ~$9bn peak (2022); fully sold by 2025", ret_risk="~39x peak; ~20-30x realised",
  portfolio="Small for Berkshire", hold="17 years", hold_years=14, decisions="Several (trims)", archetype="EARLY", archetype2="COMPOUND",
  signals="Founder, batteries -> EVs; Li Lu/Munger research", sizing="Small", failure="Chinese policy/competition", confidence="A",
  sources="CNBC (2025); CNN (2025)")
t(name="Buy the March 2009 low (rule-based)", period="Mar 2009 ->", era="2008-2019", instrument="US stock market",
  entry_exit="Daily low 9 Mar 2009 (-57%)", ret_risk="Price 11.4x to Sep 2026; real TR 9.0x (13.4%/yr)", portfolio="100% if all-in",
  hold="17.5 years", hold_years=17.5, decisions="1", archetype="CRISIS-I", archetype2="", signals="-57% drawdown, VIX >40 for months, TARP/QE policy pivot",
  sizing="Unlevered", failure="Buyers at -40% (Oct 2008) first saw another -30%", confidence="A", sources="generational_lows.py")
t(name="Bitcoin - early adoption", period="2010-2025", era="2008-2019", instrument="BTC",
  entry_exit="First Mt.Gox trade $0.0495 (Jul 2010) -> $124,753 close (6 Oct 2025)", ret_risk="~2.5 million x (to ATH); ~1.7 million x to Sep 2026",
  portfolio="n/a", hold="15 years", hold_years=15, decisions="1 (but survive 5 crashes)", archetype="EARLY", archetype2="MANIA-L",
  signals="Novel scarce digital asset; tiny market cap", sizing="Tiny amounts",
  failure="Drawdowns -93% (2011), -86%, -84%, -77%, -53% (2025-26); Mt.Gox theft; lost keys; most early coins were sold far too soon",
  confidence="A", sources="Exchange records; winners_and_squeezes.py")
t(name="Ethereum ICO", period="2014-2025", era="2008-2019", instrument="ETH", entry_exit="$0.31 (Jul-Sep 2014 sale) -> $4,831 close (Aug 2025)",
  ret_risk="~15,700x to ATH; ~8,700x to Sep 2026", portfolio="n/a", hold="11 years", hold_years=11, decisions="1",
  archetype="EARLY", archetype2="", signals="Programmable blockchain; developer adoption", sizing="n/a",
  failure="-94% drawdown in 2018; thousands of 2017-18 ICOs went to ~0", confidence="A", sources="Ethereum Foundation blog (2014); price data")
t(name="Solana - 2020 public sale", period="Mar 2020-Jan 2025", era="2008-2019", instrument="SOL",
  entry_exit="CoinList auction $0.22 (24 Mar 2020) -> $261.87 close (18 Jan 2025)", ret_risk="~1,190x to ATH; ~540x to Sep 2026",
  portfolio="n/a", hold="~5 years", hold_years=4.8, decisions="1 (survive -96%)", archetype="EARLY", archetype2="MANIA-L",
  signals="High-throughput chain launched into the 2020-21 crypto cycle", sizing="n/a",
  failure="-96% drawdown 2021-22 (FTX/Alameda backers collapsed); -76% again 2025-26", confidence="A",
  sources="CoinList (2020); winners_and_squeezes.py")
t(name="Tesla 2019 -> 2021", period="Jun 2019-Nov 2021", era="2008-2019", instrument="TSLA",
  entry_exit="$11.93 (split-adj., Jun 2019) -> $409.97 (Nov 2021)", ret_risk="34x in 29 months", portfolio="n/a", hold="2.4 years",
  hold_years=2.4, decisions="1-2", archetype="MANIA-L", archetype2="SQUEEZE (shorts lost $40bn in 2020)",
  signals="Model 3 ramp success, profitability inflection, S&P inclusion, huge short interest", sizing="n/a",
  failure="-61% drawdown along the way (Feb-Mar 2020); -74% after the 2021 peak", confidence="A", sources="winners_and_squeezes.py; S3 Partners via CNN (2021)")
t(name="SNB floor removal - the long-franc convexity side", period="15 Jan 2015", era="2008-2019", instrument="Long CHF / EUR-CHF puts",
  entry_exit="EUR/CHF 1.20 floor abandoned without warning: 1.201 -> ~0.85 intraday, 1.03-1.04 close (-14% at the noon fix)",
  ret_risk="Deep-OTM EUR/CHF puts, priced cheaply because the floor suppressed implied volatility, paid very large multiples; few documented individual winners",
  portfolio="n/a", hold="Minutes-days", hold_years=0.01, decisions="1-2", archetype="PEG", archetype2="CONVEX",
  signals="Floor defended by ever-larger SNB balance sheet (~80% of GDP); ECB QE imminent (22 Jan 2015); SNB had just affirmed the floor",
  sizing="Premium only", failure="The floor could have lasted years (it had held 3.3 years) -> premium bleed", confidence="C",
  sources="CRS (2015); SNB; peg_breaks.csv (move is grade A)")
t(name="Brexit night (Crispin Odey)", period="23-24 Jun 2016", era="2008-2019", instrument="Short GBP, long gold/UK shorts",
  entry_exit="Positioned for Leave while markets priced ~75-85% Remain; GBP -7.8% day one (noon rates), -18% by Jan 2017",
  ret_risk="Claimed ~GBP 220m overnight", portfolio="Fund-level", hold="Overnight", hold_years=0.01, decisions="2",
  archetype="INFO", archetype2="PEG-like binary event", signals="Polls near 50/50 while markets priced Remain as a near-certainty",
  sizing="Large", failure="Reportedly gave the gains back within weeks as markets rallied", confidence="C", sources="The London Economic; Fortune (2022); peg_breaks.csv")
t(name="Prediction markets: Trump 2016 at ~18%", period="Nov 2016", era="2008-2019", instrument="Betfair / PredictIt contracts",
  entry_exit="Trump ~18% on Betfair the day before the vote", ret_risk="~5.5x", portfolio="n/a", hold="Days-months", hold_years=0.1,
  decisions="1", archetype="INFO", archetype2="CONVEX (long-shot)", signals="State polls within error; correlated polling errors under-priced",
  sizing="n/a", failure="Same logic lost in 2020 (post-election Trump contracts at 10-15% went to 0)", confidence="B", sources="Newsweek; CNBC (2016)")
# ----------------------------------------------------------------------------------------------
# 2020-2026
t(name="Buy the March 2020 low (rule-based)", period="Mar 2020 ->", era="2020-2026", instrument="US stock market",
  entry_exit="Daily low 23 Mar 2020 (-34% in 23 trading days; VIX close 82.7 on 16 Mar)", ret_risk="Real TR 1.46x (1y), 1.88x (5y); price 3.4x to Sep 2026",
  portfolio="100% if all-in", hold="6.5 years", hold_years=6.5, decisions="1", archetype="CRISIS-I", archetype2="",
  signals="Fastest -30% in history, VIX > 80, unlimited QE (23 Mar) + fiscal package", sizing="Unlevered",
  failure="A deeper pandemic depression; buyers at -20% (early Mar) first saw another -18%", confidence="A", sources="generational_lows.py; crash_base_rates.py")
t(name="Universa - March 2020", period="Feb-Mar 2020", era="2020-2026", instrument="Deep OTM S&P puts (tail hedge)",
  entry_exit="Rolling tail protection; monetised during the Covid crash", ret_risk="+3,612% in March; +4,144% YTD Q1 - on 'required invested capital' (premium), not client portfolio",
  portfolio="Portfolio-level benefit = offset of equity losses, not 36x", hold="Continuous", hold_years=1, decisions="Systematic",
  archetype="CONVEX", archetype2="", signals="Systematic; always on", sizing="Small sleeve with the rest in equities",
  failure="Bleed in normal years; tail-risk hedge fund index ~-3%/yr since 2008", confidence="B",
  sources="Bloomberg (8 Apr 2020); Forbes (2020); AQR (2011)")
t(name="Bill Ackman - Pershing Square CDS hedge", period="Feb-Mar 2020", era="2020-2026", instrument="CDX IG/HY credit-default-swap index protection",
  entry_exit="Paid ~$27m premium (late Feb); closed for ~$2.6bn in March; reinvested in equities near the low",
  ret_risk="~96x in ~3-4 weeks", portfolio="Premium ~0.4% of ~$6.5bn NAV -> ~+40% of NAV; PSH 2020 NAV +70.2%", hold="~4 weeks",
  hold_years=0.08, decisions="3 (buy, sell, redeploy)", archetype="CONVEX", archetype2="CRISIS-I (redeploy)",
  signals="Credit spreads near historic tights (cheap protection) + visible catalyst (Covid spreading outside China)",
  sizing="Tiny premium vs. NAV", failure="Virus contained -> lose ~0.4% of NAV", confidence="A", sources="Pershing Square letters; Forbes (27 Mar 2020)")
t(name="Hertz - bankrupt equity", period="May 2020-Jun 2021", era="2020-2026", instrument="HTZ/HTZGQ common in Chapter 11",
  entry_exit="~$0.56 after the 22 May 2020 filing -> ~$5.50 (8 Jun 2020); 2021 plan gave holders ~$8/share (cash + new equity + warrants)",
  ret_risk="~10x in 2 weeks; ~14x for holders to emergence", portfolio="n/a", hold="2 weeks-13 months", hold_years=1,
  decisions="1-2", archetype="EVENT", archetype2="CRISIS-C", signals="Used-car price boom lifted fleet value above debt; bidding war for the equity",
  sizing="n/a", failure="Equity in Ch.11 is usually wiped out; the new HTZ shares fell ~96% from the Nov-2021 relisting-day high ($35.06) to Aug 2026 ($1.51) (computed)", confidence="B",
  sources="Wikipedia; Bloomberg (12 May 2021); SEC filings; winners_and_squeezes.py")
t(name="Keith Gill (Roaring Kitty) - GameStop", period="2019-Jan 2021 (and 2024)", era="2020-2026", instrument="GME shares + calls",
  entry_exit="~$53k from mid-2019 (~$4-5/share pre-split) -> ~$48m at the 27 Jan 2021 peak; 2024: ~9m shares ~$262m",
  ret_risk="~900x on initial stake (incl. calls/adds); GME close 124x from Apr 2020 low to 27 Jan 2021", portfolio="Concentrated personal account",
  hold="~19 months", hold_years=1.6, decisions="Few adds; held through", archetype="SQUEEZE", archetype2="CRISIS-C / INFO",
  signals="Net cash, EV/sales ~0.1x, console cycle, Ryan Cohen stake (Aug-Sep 2020), short interest >100% of float",
  sizing="All-in on one idea", failure="Declining retailer could have gone bankrupt; GME -88% after the peak", confidence="A",
  sources="CNBC (2024); his posted statements; winners_and_squeezes.py")
t(name="SPAC warrants", period="2020-2021", era="2020-2026", instrument="Listed SPAC warrants (strike $11.50)",
  entry_exit="Bought pre-deal at $1-2; deal rumours (e.g. Lucid/CCIV, QuantumScape) sent some to many multiples",
  ret_risk="Avg merged-company warrant +44% 1-yr (2010-20 sample); outliers >10x", portfolio="n/a", hold="Months", hold_years=0.5,
  decisions="1-2", archetype="EVENT", archetype2="MANIA-L", signals="Free option on a deal with $10 trust floor for units; retail mania",
  sizing="n/a", failure="2021-22 de-SPACs lost ~60-67%; most warrants expired worthless", confidence="B",
  sources="Gahng, Ritter & Zhang (2023) RFS; Klausner, Ohlrogge & Ruan (2022)")
t(name="MicroStrategy's bitcoin pivot", period="Aug 2020-Nov 2024 (-> 2026)", era="2020-2026", instrument="MSTR",
  entry_exit="$11.58 (Jul 2020, split-adj.) -> $473.83 (20 Nov 2024)", ret_risk="41x in 52 months", portfolio="n/a", hold="4.3 years",
  hold_years=4.3, decisions="1", archetype="MANIA-L", archetype2="reflexive premium", signals="Leveraged BTC proxy trading at a premium to NAV",
  sizing="n/a", failure="-89% drawdown in 2021-22; then -83% to Jun 2026 as the premium (mNAV) fell below 1", confidence="A",
  sources="winners_and_squeezes.py; Strategy Q1-2026 results")
t(name="Nvidia - Oct 2022 low -> AI boom", period="Oct 2022-2026", era="2020-2026", instrument="NVDA",
  entry_exit="$11.23 (14 Oct 2022, split-adj.) -> $235.74 (14 May 2026)", ret_risk="21x in 43 months", portfolio="n/a", hold="3.6 years",
  hold_years=3.6, decisions="1", archetype="COMPOUND", archetype2="CRISIS-C", signals="-66% drawdown into a demand shock (ChatGPT Nov 2022; May 2023 guidance)",
  sizing="n/a", failure="NVDA had 7 drawdowns >50% in its history (e.g. -90% 2000-02, -85% 2007-08)", confidence="A", sources="winners_and_squeezes.py")
t(name="Carvana - Dec 2022 low -> recovery", period="Dec 2022-Jan 2026", era="2020-2026", instrument="CVNA",
  entry_exit="$0.744 split-adj. ($3.72 pre-split, 27 Dec 2022) -> $95.69 (22 Jan 2026)", ret_risk="129x in 37 months", portfolio="n/a",
  hold="3 years", hold_years=3.1, decisions="1", archetype="CRISIS-C", archetype2="SQUEEZE", signals="-99% drawdown, bonds pricing default; 2023 debt exchange cut interest; unit economics improving",
  sizing="n/a", failure="Base case was bankruptcy; high short interest cut both ways", confidence="A", sources="winners_and_squeezes.py")
t(name="Palantir - Dec 2022 low", period="Dec 2022-Nov 2025", era="2020-2026", instrument="PLTR",
  entry_exit="$6.00 -> $207.18 (3 Nov 2025)", ret_risk="34.5x", portfolio="n/a", hold="2.9 years", hold_years=2.9, decisions="1",
  archetype="MANIA-L", archetype2="COMPOUND", signals="-85% drawdown, then GAAP profitability + AI narrative", sizing="n/a",
  failure="Extreme valuation multiples; -48% after peak", confidence="A", sources="winners_and_squeezes.py")
t(name="'Theo' - Polymarket 2024 election whale", period="Oct-Nov 2024", era="2020-2026", instrument="Polymarket contracts (Trump win, popular vote, swing states)",
  entry_exit="Spent >$45m across accounts at ~0.45-0.63 (Trump win) and longer odds (popular vote)", ret_risk="~$79m (Chainalysis) - $85m (claimed) profit: ~2-3x on stake",
  portfolio="Share of his wealth not disclosed", hold="~1-2 months", hold_years=0.1, decisions="Many (accumulation)",
  archetype="INFO", archetype2="", signals="Commissioned 'neighbour-effect' polls suggesting shy-Trump bias", sizing="Very large",
  failure="A normal polling error in the other direction -> lose most of $45m", confidence="B",
  sources="Bloomberg (24 Oct 2024); WSJ; CBS 60 Minutes; polymarket_2024.py")
t(name="Buy the April 2025 tariff-crash low", period="Apr 2025-Sep 2026", era="2020-2026", instrument="S&P 500",
  entry_exit="4,982.77 (8 Apr 2025; -19%, VIX close >50) -> 7,683.69 (28 Sep 2026)", ret_risk="+54% price in 17.7 months", portfolio="100% if all-in",
  hold="1.5 years", hold_years=1.5, decisions="1", archetype="CRISIS-I", archetype2="", signals="VIX > 50 (4th time since 1990), policy-driven shock with reversal option (tariff pause 9 Apr)",
  sizing="Unlevered", failure="Tariffs could have stayed; drawdown only ~19% (below classic thresholds)", confidence="A", sources="generational_lows.py; crash_base_rates.py")
t(name="Gold & silver 2024-26 run", period="Feb 2024-Jan 2026", era="2020-2026", instrument="Gold / silver futures",
  entry_exit="Gold $2,004 -> $5,318 (29 Jan 2026); silver $22.1 -> $115.08 (26 Jan 2026)", ret_risk="Gold 2.7x; silver 5.2x",
  portfolio="n/a", hold="2 years", hold_years=2, decisions="1-2", archetype="MANIA-L", archetype2="PEG-like (debasement narrative)",
  signals="Central-bank buying, fiscal deficits, trend acceleration", sizing="n/a",
  failure="Silver -51% and gold -25% from those peaks by Sep 2026 (computed)", confidence="A", sources="winners_and_squeezes.py")

# ----------------------------------------------------------------------------------------------
B = []  # blowups


def b(**kw):
    B.append(kw)


b(name="Isaac Newton - South Sea Bubble", period="1720", loss="~GBP 10-20k+ (a large part of his fortune); holding throughout would have made ~GBP 250k",
  mechanism="Re-entry near the top (FOMO) + concentration", detail="Sold early at a profit, then bought back at roughly double the price near the June 1720 peak",
  lesson="Pre-commit exits; never re-enter a parabolic move after selling", confidence="B", sources="Odlyzko (2019) Notes & Records 73(1)")
b(name="John Law & late Mississippi buyers", period="1720", loss="Shares 10,000 -> 1,000 livres within a year (-90%)",
  mechanism="Policy/fraud + leverage", detail="Money printing to support shares; convertibility suspended; Law fled and died poor (1729)",
  lesson="When the sponsor is printing to hold up the price, the peg will break", confidence="B", sources="NY Fed Liberty Street (2014); Winton")
b(name="Northern Pacific short sellers", period="May 1901", loss="Forced to cover at up to $1,000 vs ~$150 fair; ruinous for many",
  mechanism="Short squeeze / delivery failure", detail="Two control bidders absorbed the float", lesson="Never be short something that someone may need to own", confidence="B", sources="Panic of 1901 accounts")
b(name="Jesse Livermore's ruin", period="1908-1940", loss="Bankrupt several times (last in 1934); suicide 1940",
  mechanism="Leverage + over-trading + not banking gains", detail="Gave back 1907 and 1929 fortunes on subsequent trades",
  lesson="Wealth must be banked/de-risked after a windfall", confidence="B", sources="Smitten (2001); Rubython (2014)")
b(name="Irving Fisher", period="1929", loss="~$8-10m personal fortune; lifelong debt",
  mechanism="Leverage + concentration + overconfidence", detail="'Stocks have reached a permanently high plateau' (Oct 1929); margined Remington Rand",
  lesson="Expertise does not protect a levered, concentrated position", confidence="B", sources="Fisher biographies; Fox (2009) Myth of the Rational Market")
b(name="1929-32 dip-buyers", period="1929-1932", loss="Buying at -40% (Nov 1929) meant another -77%; price break-even took 16+ years",
  mechanism="Being early + margin", detail="Unlevered with dividends: real total-return break-even ~5-6 years (computed); on 10% margin, wiped out",
  lesson="Crisis buying must be tranche-based and unlevered", confidence="A", sources="generational_lows.py")
b(name="Keynes - 1920 currency losses", period="1920 (and 1928-29)", loss="Near personal bankruptcy in May 1920",
  mechanism="Leverage + timing (right thesis, wrong path)", detail="Short European currencies; rescued by father and Sir Ernest Cassel; later reformed into patient value investing (King's +16%/yr 1921-46)",
  lesson="Survive the path; leverage turns a correct thesis into ruin", confidence="A", sources="Accominotti & Chambers (2016) J. Econ. Hist.; Chambers & Dimson (2013)")
b(name="Hunt brothers - silver", period="1979-80", loss="Silver $49.45 -> $10.80 (27 Mar 1980); $1.1bn bank rescue; later bankrupt",
  mechanism="Leverage + concentration + rule change", detail="~195m oz controlled; COMEX 'Silver Rule 7' limited margin buying (Jan 1980)",
  lesson="Exchanges change rules against corners; liquidity vanishes on exit", confidence="A", sources="Silver Thursday (Wikipedia); CFTC history")
b(name="Soros - 1987 crash", period="Oct 1987", loss="Quantum lost ~$300m+ selling futures near the low (year still ~+14%)",
  mechanism="Wrong-way positioning + forced de-risking", detail="Long US, short Japan; sold into the panic", lesson="Even great macro traders take crash losses - they survive by sizing", confidence="B", sources="Soros Fund Management histories")
b(name="Japan 1990 dip-buyers", period="1990-2024", loss="Nikkei -82% (1989-2009); buyer at -20% waited 33 years, at -40% 27 years (price)",
  mechanism="Valuation (CAPE ~60+) + being early", detail="Dividends shorten this somewhat; still a lost generation", lesson="A cheap-looking market after -40% can fall another 60-70% if the starting valuation was extreme",
  confidence="A", sources="generational_lows.py")
b(name="Barings - Nick Leeson", period="1995", loss="GBP 827m > bank's capital; sold for GBP 1",
  mechanism="Rogue trading + doubling down + short straddles (short convexity)", detail="Hidden account 88888; Kobe earthquake hit Nikkei longs and short straddles",
  lesson="Separate front and back office; no averaging down on losing leveraged trades", confidence="A", sources="Britannica; RBA Bulletin (1995)")
b(name="Victor Niederhoffer", period="1997 & 2007", loss="Main fund wiped out Oct 1997; Matador fund -75%+ in 2007",
  mechanism="Concentration (Thai banks) + short puts (short convexity)", detail="Sold naked S&P puts; 27 Oct 1997 mini-crash", lesson="Selling tails produces steady gains until it produces ruin", confidence="B", sources="Slate (2010); Wikipedia")
b(name="Long-Term Capital Management", period="1998", loss="$4.6bn; equity $4.7bn -> ~$0.4bn; $3.6bn bank recapitalisation",
  mechanism="Leverage (~25:1 on balance sheet) + crowding/liquidity", detail="Convergence trades diverged after Russia's default", lesson="Correlations go to 1 and liquidity vanishes exactly when levered books need it", confidence="A", sources="President's Working Group (1999); Fed History; Lowenstein (2000)")
b(name="Tiger Management", period="1998-2000", loss="-4% (1998), -19% (1999); AUM $22bn -> ~$6bn; closed Mar 2000",
  mechanism="Being early (fading the tech bubble)", detail="Closed weeks before the Nasdaq peak - right thesis, wrong timing", lesson="Shorting/avoiding a mania can cost you the business before you are proven right", confidence="B", sources="Institutional Investor; Robertson letters")
b(name="Druckenmiller - buying the tech top", period="Mar-Apr 2000", loss="~$3bn lost in ~6 weeks on ~$6bn of tech; Quantum -21% in 2000",
  mechanism="Re-entry near the top (FOMO) after being right", detail="Had profited riding tech in 1999, then chased it at the peak", lesson="Mania re-entry after a big win is the classic giveback", confidence="B", sources="Druckenmiller interviews; Daily Reckoning; gurufocus")
b(name="Enron employees", period="2001", loss="401(k) plans heavily in company stock; employees lost ~$1bn+",
  mechanism="Concentration in employer + fraud", detail="Stock ~$90 -> $0.26", lesson="Never let one issuer (especially your employer) dominate your wealth", confidence="B", sources="Congressional testimony; press")
b(name="Amaranth Advisors", period="Sep 2006", loss="~$6.5bn (~65% of $9.5bn) in about a week",
  mechanism="Concentration + illiquidity + leverage", detail="Winter/summer natural-gas spreads too big to exit; Centaurus/JPM/Citadel took the book", lesson="Position size must be judged against market depth, not conviction", confidence="A", sources="US Senate PSI (2007); Wikipedia")
b(name="VW short sellers & Adolf Merckle", period="Oct 2008", loss="Shorts lost > EUR 20bn (~$30bn); Merckle lost ~EUR 500m, suicide Jan 2009",
  mechanism="Short squeeze (float disappeared)", detail="Porsche's hidden option stake left <6% float vs ~12% short interest", lesson="Monitor float vs. short interest; shorts have unbounded loss", confidence="A", sources="Harvard corpgov (2021); Wikipedia")
b(name="Societe Generale - Jerome Kerviel", period="Jan 2008", loss="EUR 4.9bn", mechanism="Rogue trading / control failure", detail="~EUR 50bn of hidden index-futures exposure",
  lesson="Operational controls matter as much as market views", confidence="A", sources="SocGen reports; court records")
b(name="SNB floor removal: FXCM clients, Alpari UK, Everest Capital", period="15 Jan 2015", loss="FXCM clients owed $225m; Alpari UK insolvent; Everest's ~$830m Global Fund wiped out",
  mechanism="Leverage + short convexity against a policy peg", detail="EUR/CHF -14% at the noon fix, ~-30% intraday; Everest ran 400-900% gross exposure (SEC)", lesson="Pegs suppress volatility until the day they don't; never sell the peg's tail with leverage",
  confidence="A", sources="SEC IA-5491 (2020); CNBC; swissinfo; peg_breaks.csv")
b(name="XIV & LJM ('Volmageddon')", period="5-6 Feb 2018", loss="XIV -96% in a day (terminated); LJM Preservation & Growth -80% in 2 days",
  mechanism="Short volatility (short convexity)", detail="VIX +115.6% in one day", lesson="Products that 'earn' steady carry by selling volatility have a hidden ruin state", confidence="A", sources="ETF.com; Credit Suisse notice; FINRA/SEC LJM actions")
b(name="OptionSellers.com (James Cordier)", period="Nov 2018", loss="~$150m; 290 clients lost 100% and owed the broker more",
  mechanism="Naked short calls (short convexity) + concentration", detail="Natural gas +60% in a week", lesson="Undefined-risk option selling can lose more than 100% of the account", confidence="B", sources="CNBC (2018); client lawsuits")
b(name="Allianz Structured Alpha & Malachite", period="Feb-Mar 2020", loss="Structured Alpha > $7bn (Allianz paid >$6bn); Malachite ($600m) dissolved",
  mechanism="Short volatility + (Allianz) fraud: promised hedges not bought", detail="Stress test edited from -42.15% to -4.15% (SEC)", lesson="Verify hedges exist; 'hedged' short-vol can be naked", confidence="A", sources="SEC 2022-84; DOJ; Bloomberg (2020)")
b(name="Negative oil (20 Apr 2020)", period="Apr 2020", loss="WTI May future settled -$37.63; retail products (e.g. Bank of China 'Crude Oil Treasure') lost >100%; brokers ate client deficits",
  mechanism="Structural/liquidity (expiring physically settled future, storage full)", detail="Retail long-oil vehicles holding the front month", lesson="Know the instrument's settlement mechanics; retail should avoid expiring futures", confidence="B", sources="CME; press")
b(name="Melvin Capital", period="Jan 2021", loss="-53% in January 2021 (~$6.8bn); $2.75bn rescue; closed 2022",
  mechanism="Short squeeze + crowding + concentration", detail="Short GME with >100% of float shorted", lesson="Crowded shorts in small floats are exposed to reflexive retail flows", confidence="A", sources="WSJ; CNBC")
b(name="Archegos (Bill Hwang)", period="Mar 2021", loss="~$20bn personal in 2 days; banks >$10bn (Credit Suisse $5.5bn, Nomura $2.9bn)",
  mechanism="Hidden leverage via total-return swaps + concentration + fraud", detail="~$36bn equity controlling ~$160bn exposure; Hwang sentenced to 18 years", lesson="Leverage + concentration + forced selling by lenders = instant ruin", confidence="A", sources="Bloomberg; DOJ; CNBC (2024)")
b(name="Terra/Luna", period="May 2022", loss="~$40-45bn market value; LUNA $119.51 ATH -> ~0",
  mechanism="Reflexive algorithmic peg + unsustainable yield (Anchor ~20%)", detail="LFG spent ~80k BTC defending UST; death spiral", lesson="Yield that has no visible source is paid by the last buyer", confidence="A", sources="MIT Sloan CFI; Wikipedia")
b(name="Three Arrows Capital (and Celsius, Voyager)", period="Jun 2022", loss="~$3bn+ liabilities; contagion to lenders",
  mechanism="Leverage + concentration + counterparty chains", detail="GBTC premium trade, stETH, LUNA", lesson="Crypto lenders were unsecured counterparties", confidence="B", sources="CoinDesk; court filings")
b(name="FTX customers", period="Nov 2022", loss="~$8bn customer shortfall; 2024 plan repays ~118% of Nov-2022 USD value (BTC ~$16k), missing the later 5-7x",
  mechanism="Counterparty fraud / custody", detail="Customer assets lent to Alameda", lesson="Custody risk can override a correct market view", confidence="A", sources="FTX plan (2024); Axios; CBS")
b(name="Tesla short sellers", period="2020", loss="~$40bn mark-to-market loss in one year (S3 Partners)",
  mechanism="Shorting a reflexive winner / squeeze", detail="TSLA +743% in 2020", lesson="Valuation is not a catalyst; don't short momentum without a trigger", confidence="A", sources="S3 Partners via CNN (2021)")
b(name="JGB 'widowmaker'", period="1990s-2020s", loss="Decades of negative carry and losses as yields fell towards 0",
  mechanism="Being early / negative carry", detail="Obvious-looking debt thesis defeated by BoJ policy", lesson="A thesis without a catalyst and with negative carry is a slow bleed", confidence="B", sources="Kyle Bass interviews; BondEconomics (2014)")
b(name="Crypto liquidation cascade", period="10-11 Oct 2025", loss="~$19.3-19.5bn liquidated in 24h (largest ever, ~9x prior record); ~6,300 Hyperliquid wallets wiped",
  mechanism="Leverage + liquidity (auto-deleveraging)", detail="Triggered by a 100% China-tariff threat", lesson="Perpetual-futures leverage is liquidated at the worst print", confidence="A", sources="CoinDesk (2025); Forbes (2025)")
b(name="Bitcoin-treasury companies (MSTR et al.)", period="2025-2026", loss="MSTR -83% (Nov 2024 -> Jun 2026); treasury stocks lost ~$62bn in the June-2026 rout",
  mechanism="Reflexive premium + leverage", detail="mNAV premium collapsed below 1", lesson="Premiums to NAV funded by issuance are reflexive in both directions", confidence="A", sources="winners_and_squeezes.py; Yahoo Finance (2026); Strategy Q1-2026")
b(name="Late meme-stock and SPAC buyers", period="2021-2022", loss="GME -88% and AMC -99.8% from 2021 peaks (computed); non-redeeming SPAC holders median -88% market-adjusted",
  mechanism="Buying the mania late + dilution", detail="Sponsors' promote and warrants diluted holders", lesson="The same trade is a different trade at a different price", confidence="A", sources="winners_and_squeezes.py; Klausner, Ohlrogge & Ruan (2022)")
b(name="Hertz's post-bankruptcy equity", period="Nov 2021-Sep 2026", loss="-96% from the 2 Nov 2021 relisting-day high ($35.06) to the Aug 2026 low ($1.51) (computed); -41% in one day (24 Jun 2026)",
  mechanism="Leverage + cyclical asset values", detail="Used-car softness and dilutive financing", lesson="Yesterday's miracle recovery is not today's margin of safety", confidence="A", sources="winners_and_squeezes.py; Bloomberg (24-25 Jun 2026)")


def md_escape(s: str) -> str:
    return str(s).replace("|", "/").replace("\n", " ")


def main():
    tr = pd.DataFrame(T)
    tr.insert(0, "id", [f"T{i+1:02d}" for i in range(len(tr))])
    tr.to_csv(OUT_DIR / "trade_catalog.csv", index=False)
    bl = pd.DataFrame(B)
    bl.insert(0, "id", [f"B{i+1:02d}" for i in range(len(bl))])
    bl.to_csv(OUT_DIR / "blowups.csv", index=False)

    lines = []
    lines.append("### Master table\n")
    lines.append("| # | Trade | Period | Return on capital at risk | Portfolio-level | Hold | Decisions | Archetype | Conf. |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for _, r in tr.iterrows():
        arch = r["archetype"] + (f" + {r['archetype2']}" if r["archetype2"] else "")
        lines.append(f"| {r['id']} | {md_escape(r['name'])} | {md_escape(r['period'])} | {md_escape(r['ret_risk'])} | {md_escape(r['portfolio'])} | "
                     f"{md_escape(r['hold'])} | {md_escape(r['decisions'])} | {md_escape(arch)} | {r['confidence']} |")
    lines.append("")
    for era in tr["era"].unique():
        lines.append(f"### Trade cards - {era}\n")
        for _, r in tr[tr["era"] == era].iterrows():
            lines.append(f"**{r['id']}. {md_escape(r['name'])}** ({md_escape(r['period'])}; conf. {r['confidence']})  ")
            lines.append(f"*Instrument / entry -> exit:* {md_escape(r['instrument'])}; {md_escape(r['entry_exit'])}.  ")
            lines.append(f"*Ex-ante signals:* {md_escape(r['signals'])}. *Sizing:* {md_escape(r['sizing'])}.  ")
            lines.append(f"*What could have gone wrong:* {md_escape(r['failure'])}. *Sources:* {md_escape(r['sources'])}.\n")
    lines.append("### Blowups table\n")
    lines.append("| # | Who / what | When | Loss | Mechanism of ruin | Detail | Lesson | Conf. |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for _, r in bl.iterrows():
        lines.append(f"| {r['id']} | {md_escape(r['name'])} | {md_escape(r['period'])} | {md_escape(r['loss'])} | {md_escape(r['mechanism'])} | "
                     f"{md_escape(r['detail'])} | {md_escape(r['lesson'])} | {r['confidence']} |")
    (OUT_DIR / "catalog_tables.md").write_text("\n".join(lines) + "\n")
    # split versions (convenient for pasting the catalog into the track-01 report)
    txt = "\n".join(lines) + "\n"
    i_cards = txt.index("### Trade cards")
    i_blow = txt.index("### Blowups table")
    (OUT_DIR / "catalog_master.md").write_text(txt[:i_cards].replace("### Master table\n\n", ""))
    (OUT_DIR / "catalog_cards.md").write_text(txt[i_cards:i_blow])
    (OUT_DIR / "blowups_table.md").write_text(txt[i_blow:].replace("### Blowups table\n\n", ""))
    print(len(tr), "trades;", len(bl), "blowups")
    print(tr.groupby("archetype").size().sort_values(ascending=False).to_string())
    print(tr.groupby("confidence").size().to_string())
    print(bl["mechanism"].to_string())


if __name__ == "__main__":
    main()
