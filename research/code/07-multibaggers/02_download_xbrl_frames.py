"""
Step 2 - Download SEC XBRL 'frames' (one fact per filer per calendar period) for the handful of
concepts we need. Frames are an efficient way to get point-in-time-ish fundamentals for *all*
filers without pulling ~6,000 companyfacts files.

Caveats (stated in report):
  * frames return the most recently *filed* value for a period, so restatements leak in (mild
    look-ahead in values, not in availability: the underlying numbers were in 10-Ks at the time).
  * calendar alignment is approximate for non-December fiscal years.
  * XBRL coverage is thin before FY2009/2010 (smaller filers phased in by mid-2011).
"""
import os, time, json, requests

SCR = "/tmp/claude-0/-home-user-testProject/e2f4add1-76bc-52ea-9f6b-a17def49aa3f/scratchpad/07-multibaggers"
OUT = os.path.join(SCR, "frames")
os.makedirs(OUT, exist_ok=True)
H = {"User-Agent": "ResearchBot research@example.com"}

duration = [
    ("us-gaap", "Revenues", "USD"),
    ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD"),
    ("us-gaap", "RevenueFromContractWithCustomerIncludingAssessedTax", "USD"),
    ("us-gaap", "SalesRevenueNet", "USD"),
    ("us-gaap", "NetIncomeLoss", "USD"),
    ("us-gaap", "NetCashProvidedByUsedInOperatingActivities", "USD"),
    ("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment", "USD"),
    ("us-gaap", "GrossProfit", "USD"),
    ("us-gaap", "OperatingIncomeLoss", "USD"),
    ("us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding", "shares"),
    ("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic", "shares"),
    ("us-gaap", "LongTermDebt", "USD"),
]
instant = [
    ("dei", "EntityCommonStockSharesOutstanding", "shares"),
    ("us-gaap", "StockholdersEquity", "USD"),
    ("us-gaap", "Assets", "USD"),
]
jobs = []
for y in range(2008, 2026):
    for tx, tag, u in duration:
        jobs.append(f"{tx}/{tag}/{u}/CY{y}")
    for tx, tag, u in instant:
        for q in (1, 2, 3, 4):
            if tag != "EntityCommonStockSharesOutstanding" and q in (1, 3):
                continue  # balance sheet items: Q2 and Q4 are enough
            jobs.append(f"{tx}/{tag}/{u}/CY{y}Q{q}I")

s = requests.Session()
for j in jobs:
    fn = os.path.join(OUT, j.replace("/", "__") + ".json")
    if os.path.exists(fn):
        continue
    url = f"https://data.sec.gov/api/xbrl/frames/{j}.json"
    for attempt in range(3):
        r = s.get(url, headers=H, timeout=60)
        if r.status_code == 200:
            open(fn, "w").write(r.text)
            break
        if r.status_code == 404:
            open(fn, "w").write(json.dumps({"data": []}))
            break
        time.sleep(2)
    time.sleep(0.25)
print("frames done", len(jobs))
