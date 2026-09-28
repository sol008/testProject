"""Hand-curated event lists for track 17. Each tuple: (label, news_date, same_day_ok, tags).

news_date  = calendar date the news broke (US Eastern time).
same_day_ok = True if US markets could trade on the news that same session (news before/during the session);
             False if it broke after the close or on a non-trading day -> day 0 is the next session.
Dates are from standard histories (Wikipedia / CRS / Federal Reserve / BoJ releases) and were cross-checked
against price action where possible (big day-0 moves on the expected day). Items marked 'approx' are dated from
track 08's sourcing (2026 war chronology) or have uncertain intraday timing; they are flagged in the report.
"""
from __future__ import annotations

import pandas as pd

# ------------------------------------------------------------------------------------------------------------
# Geopolitical conflict onsets and escalations
# tags: 'war' = war onset / major-power military action; 'me' = Middle East / oil-relevant; 'us' = US directly
# involved at onset; 'scare' = escalation without war; 'approx' = timing uncertain
# ------------------------------------------------------------------------------------------------------------
GEO_ONSETS = [
    ("Germany invades Poland", "1939-09-01", True, {"war"}),
    ("Germany invades France/Low Countries", "1940-05-10", True, {"war"}),
    ("Pearl Harbor", "1941-12-07", False, {"war", "us"}),
    ("Korean War", "1950-06-25", False, {"war", "us"}),
    ("Suez crisis: Israel invades Sinai", "1956-10-29", False, {"war", "me"}),
    ("Cuban missile crisis (JFK address)", "1962-10-22", False, {"scare", "us"}),
    ("Gulf of Tonkin", "1964-08-04", False, {"war", "us"}),
    ("Six-Day War", "1967-06-05", True, {"war", "me"}),
    ("Tet offensive", "1968-01-31", True, {"war", "us"}),
    ("Cambodia incursion", "1970-04-30", False, {"war", "us"}),
    ("Yom Kippur War", "1973-10-06", False, {"war", "me"}),
    ("Iran hostage crisis", "1979-11-04", False, {"scare", "me", "us"}),
    ("Soviet invasion of Afghanistan", "1979-12-27", True, {"war", "approx"}),
    ("Iran-Iraq war", "1980-09-22", True, {"war", "me"}),
    ("Falklands invasion", "1982-04-02", True, {"war"}),
    ("Iraq invades Kuwait", "1990-08-02", True, {"war", "me"}),
    ("Desert Storm air war begins", "1991-01-16", False, {"war", "me", "us", "relief"}),
    ("NATO Kosovo air war", "1999-03-24", True, {"war", "us"}),
    ("9/11 attacks", "2001-09-11", True, {"war", "us"}),  # NYSE shut until 9/17; day 0 = 9/17
    ("Afghanistan war", "2001-10-07", False, {"war", "us"}),
    ("Iraq war begins", "2003-03-19", False, {"war", "me", "us", "relief"}),
    ("Libya intervention", "2011-03-19", False, {"war", "me", "us"}),
    ("Crimea (Russia authorises force)", "2014-03-01", False, {"war"}),
    ("North Korea 'fire and fury'", "2017-08-08", True, {"scare", "us"}),
    ("Abqaiq attack", "2019-09-14", False, {"me", "scare"}),
    ("Soleimani killed", "2020-01-02", False, {"me", "us", "scare"}),
    ("Russia invades Ukraine", "2022-02-24", True, {"war"}),
    ("Hamas attack on Israel", "2023-10-07", False, {"war", "me"}),
    ("Iran drone/missile attack on Israel", "2024-04-13", False, {"me", "scare"}),
    ("Iran ballistic-missile attack on Israel", "2024-10-01", True, {"me", "scare"}),
    ("Israel strikes Iran", "2025-06-13", True, {"war", "me"}),
    ("US strikes Iran nuclear sites", "2025-06-21", False, {"me", "us", "scare"}),
    ("US/Israel-Iran war begins", "2026-02-28", False, {"war", "me", "us"}),
    ("Iran ceasefire collapses", "2026-07-08", True, {"me", "us", "approx"}),
]

# ------------------------------------------------------------------------------------------------------------
# De-escalations: ceasefires, war-end, "relief" events (oil premium usually falls)
# ------------------------------------------------------------------------------------------------------------
DEESC = [
    ("Korean armistice", "1953-07-26", False, {"ceasefire"}),
    ("Suez ceasefire", "1956-11-06", True, {"ceasefire", "me"}),
    ("Cuba: Khrushchev backs down", "1962-10-28", False, {"ceasefire"}),
    ("Six-Day War ceasefire", "1967-06-10", False, {"ceasefire", "me"}),
    ("Yom Kippur ceasefire (UNSC 338)", "1973-10-22", True, {"ceasefire", "me"}),
    ("Iran accepts UNSC 598 (Iran-Iraq)", "1988-07-18", True, {"ceasefire", "me"}),
    ("Desert Storm starts (uncertainty resolved)", "1991-01-16", False, {"relief", "me", "oil"}),
    ("Gulf War ceasefire", "1991-02-27", False, {"ceasefire", "me", "oil"}),
    ("Iraq war starts (sell the news in oil)", "2003-03-19", False, {"relief", "me", "oil"}),
    ("Fall of Baghdad", "2003-04-09", True, {"ceasefire", "me", "oil"}),
    ("Iran stands down after Al Asad strike", "2020-01-08", True, {"relief", "me", "oil"}),
    ("Istanbul talks (Russia 'scales back')", "2022-03-29", True, {"talks", "oil"}),
    ("Israel-Hamas truce agreed", "2023-11-22", True, {"ceasefire", "me"}),
    ("Israel's limited strike spares Iran oil", "2024-10-26", False, {"relief", "me", "oil"}),
    ("Iran token strike, Israel-Iran ceasefire", "2025-06-23", True, {"ceasefire", "me", "oil"}),
    ("US-Iran two-week ceasefire", "2026-04-08", True, {"ceasefire", "me", "oil", "approx"}),
    ("US-Iran memo lifts dual blockade", "2026-06-17", True, {"ceasefire", "me", "oil", "approx"}),
]

# ------------------------------------------------------------------------------------------------------------
# Oil supply shocks (onset of an actual or feared physical disruption)
# ------------------------------------------------------------------------------------------------------------
OIL_SHOCKS = [
    ("Iraq invades Kuwait", "1990-08-02", True, {"disruption"}),
    ("Libya civil war shut-ins", "2011-02-22", True, {"disruption"}),
    ("Abqaiq attack", "2019-09-14", False, {"disruption"}),
    ("Soleimani killed", "2020-01-02", False, {"fear"}),
    ("Russia invades Ukraine", "2022-02-24", True, {"disruption"}),
    ("US/EU discuss Russian oil ban", "2022-03-06", False, {"disruption"}),
    ("Hamas attack on Israel", "2023-10-07", False, {"fear"}),
    ("Iran drone/missile attack on Israel", "2024-04-13", False, {"fear"}),
    ("Iran ballistic-missile attack on Israel", "2024-10-01", True, {"fear"}),
    ("Israel strikes Iran", "2025-06-13", True, {"fear"}),
    ("US/Israel-Iran war begins", "2026-02-28", False, {"disruption"}),
]

# ------------------------------------------------------------------------------------------------------------
# Oil premium unwinds (part 3): date = first day of the collapse (or the peak close for 'peak' anchors)
# ------------------------------------------------------------------------------------------------------------
OIL_UNWINDS = [
    ("1990 Oct peak (pre-war)", "1990-10-11", True, {"peak"}),
    ("Desert Storm start", "1991-01-16", False, {"event"}),
    ("2003 pre-war peak", "2003-03-07", True, {"peak"}),
    ("2003 Iraq war start", "2003-03-19", False, {"event"}),
    ("2011 Libya peak", "2011-04-08", True, {"peak"}),
    ("2011 IEA stock release", "2011-06-23", True, {"event"}),
    ("2019 Abqaiq spike day", "2019-09-16", True, {"peak"}),
    ("2020 Iran stands down", "2020-01-08", True, {"event"}),
    ("2022 Mar peak", "2022-03-08", True, {"peak"}),
    ("2022 Jun peak", "2022-06-08", True, {"peak"}),
    ("2024 Israel limited strike", "2024-10-26", False, {"event"}),
    ("2025 Israel-Iran ceasefire", "2025-06-23", True, {"event"}),
    ("2026 two-week ceasefire", "2026-04-08", True, {"event", "approx"}),
    ("2026 memo lifts blockade", "2026-06-17", True, {"event", "approx"}),
]

# ------------------------------------------------------------------------------------------------------------
# Crash-type events (named) - day 0 = the crash session itself
# ------------------------------------------------------------------------------------------------------------
CRASHES = [
    ("Black Monday", "1987-10-19", True, set()),
    ("Oct 1989 mini-crash", "1989-10-13", True, set()),
    ("Asian crisis", "1997-10-27", True, set()),
    ("LTCM / Russia", "1998-08-31", True, set()),
    ("TARP vote fails", "2008-09-29", True, set()),
    ("Oct 2008", "2008-10-15", True, set()),
    ("Flash crash", "2010-05-06", True, set()),
    ("US downgrade", "2011-08-08", True, set()),
    ("China deval selloff", "2015-08-24", True, set()),
    ("Volmageddon", "2018-02-05", True, set()),
    ("Covid: oil war Monday", "2020-03-09", True, set()),
    ("Covid: -12% day", "2020-03-16", True, set()),
    ("CPI shock", "2022-09-13", True, set()),
    ("SVB failure", "2023-03-10", True, set()),
    ("Yen-carry unwind", "2024-08-05", True, set()),
    ("Tariff crash", "2025-04-04", True, set()),
]

# ------------------------------------------------------------------------------------------------------------
# Federal funding gaps (CRS RS20348 / RL34680 table; date = first day without appropriations)
# ------------------------------------------------------------------------------------------------------------
SHUTDOWNS = [
    ("FY77", "1976-10-01", 10), ("FY78a", "1977-10-01", 12), ("FY78b", "1977-11-01", 8), ("FY78c", "1977-12-01", 8),
    ("FY79", "1978-10-01", 17), ("FY80", "1979-10-01", 11), ("FY81", "1980-10-01", 1), ("FY82", "1981-11-21", 2),
    ("FY83a", "1982-10-01", 1), ("FY83b", "1982-12-18", 3), ("FY84", "1983-11-11", 3), ("FY85a", "1984-10-01", 2),
    ("FY85b", "1984-10-04", 1), ("FY87", "1986-10-17", 1), ("FY88", "1987-12-19", 1), ("FY91", "1990-10-06", 3),
    ("FY96a", "1995-11-14", 5), ("FY96b", "1995-12-16", 21), ("FY14", "2013-10-01", 16), ("FY18a", "2018-01-20", 3),
    ("FY18b", "2018-02-09", 1), ("FY19", "2018-12-22", 35), ("FY26", "2025-10-01", 43),
]

# ------------------------------------------------------------------------------------------------------------
# Fed special actions
# ------------------------------------------------------------------------------------------------------------
FED_INTERMEETING = [  # (label, date, same_day_ok, direction)
    ("1994 intermeeting hike", "1994-04-18", True, "hike"),
    ("1998 intermeeting cut", "1998-10-15", True, "cut"),
    ("2001 Jan intermeeting cut", "2001-01-03", True, "cut"),
    ("2001 Apr intermeeting cut", "2001-04-18", True, "cut"),
    ("2001 Sep 17 cut", "2001-09-17", True, "cut"),
    ("2007 Aug discount-rate cut", "2007-08-17", True, "cut"),
    ("2008 Jan 75bp cut", "2008-01-22", True, "cut"),
    ("2008 Mar Bear Stearns/discount cut", "2008-03-16", False, "cut"),
    ("2008 Oct coordinated cut", "2008-10-08", True, "cut"),
    ("2020 Mar 3 50bp cut", "2020-03-03", True, "cut"),
    ("2020 Mar 15 100bp cut", "2020-03-15", False, "cut"),
]
FIRST_HIKES = ["1994-02-04", "1999-06-30", "2004-06-30", "2015-12-16", "2022-03-16", "2026-09-16"]
SECOND_HIKES = ["1994-03-22", "1999-08-24", "2004-08-10", "2016-12-14", "2022-05-04"]
FIRST_CUTS = ["1995-07-06", "1998-09-29", "2001-01-03", "2007-09-18", "2019-07-31", "2024-09-18"]

# BoJ policy-rate increases (decision dates). 2025-12-19 and 2026 dates rest on track 08 / press [verify].
BOJ_HIKES = [("2000 ZIRP exit", "2000-08-11"), ("2006 exit to 0.25%", "2006-07-14"), ("2007 to 0.5%", "2007-02-21"),
             ("2024 NIRP exit", "2024-03-19"), ("2024 Jul to 0.25%", "2024-07-31"), ("2025 Jan to 0.5%", "2025-01-24"),
             ("2025 Dec to 0.75% [verify]", "2025-12-19"), ("2026 Sep to 1.25% (track 08)", "2026-09-18")]


def midterm_dates(start=1934, end=2022) -> list[pd.Timestamp]:
    """First Tuesday after the first Monday of November in midterm years."""
    out = []
    for y in range(start, end + 1, 4):
        d = pd.Timestamp(year=y, month=11, day=1)
        # first Monday
        while d.weekday() != 0:
            d += pd.Timedelta(days=1)
        out.append(d + pd.Timedelta(days=1))
    return out


# House control flipped at these midterms (divided government created or deepened)
HOUSE_FLIP_MIDTERMS = [1946, 1954, 1994, 2006, 2010, 2018, 2022]
