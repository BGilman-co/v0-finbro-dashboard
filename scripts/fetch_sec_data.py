#!/usr/bin/env python3
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


YFINANCE_SNAPSHOT_PATH = Path("public/data/yfinance-snapshot.json")
OUTPUT_PATH = Path("public/data/sec-snapshot.json")
SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "B-Gilman-Co-Dashboard/1.0 contact@example.com")
MAX_WORKERS = int(os.getenv("SEC_FETCH_WORKERS", "4"))


STATEMENT_DEFINITIONS = [
    {
        "title": "Income Statement",
        "rows": [
            {"label": "Revenue", "tags": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]},
            {"label": "Cost of Revenue", "tags": ["CostOfRevenue", "CostOfGoodsAndServicesSold"]},
            {"label": "Gross Profit", "tags": ["GrossProfit"]},
            {"label": "Research and Development", "tags": ["ResearchAndDevelopmentExpense"]},
            {"label": "Selling, General and Administrative", "tags": ["SellingGeneralAndAdministrativeExpense"]},
            {"label": "Operating Income", "tags": ["OperatingIncomeLoss"]},
            {"label": "Interest Expense", "tags": ["InterestExpenseNonOperating", "InterestExpense"]},
            {"label": "Income Before Taxes", "tags": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"]},
            {"label": "Income Tax Expense", "tags": ["IncomeTaxExpenseBenefit"]},
            {"label": "Net Income", "tags": ["NetIncomeLoss", "ProfitLoss"]},
            {"label": "EPS Diluted", "tags": ["EarningsPerShareDiluted"]},
        ],
    },
    {
        "title": "Balance Sheet",
        "rows": [
            {"label": "Cash and Equivalents", "tags": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]},
            {"label": "Short-term Investments", "tags": ["ShortTermInvestments"]},
            {"label": "Accounts Receivable", "tags": ["AccountsReceivableNetCurrent"]},
            {"label": "Inventory", "tags": ["InventoryNet"]},
            {"label": "Total Current Assets", "tags": ["AssetsCurrent"]},
            {"label": "Property, Plant and Equipment", "tags": ["PropertyPlantAndEquipmentNet"]},
            {"label": "Total Assets", "tags": ["Assets"]},
            {"label": "Accounts Payable", "tags": ["AccountsPayableCurrent"]},
            {"label": "Total Current Liabilities", "tags": ["LiabilitiesCurrent"]},
            {"label": "Long-term Debt", "tags": ["LongTermDebtNoncurrent", "LongTermDebt"]},
            {"label": "Total Liabilities", "tags": ["Liabilities"]},
            {"label": "Stockholders' Equity", "tags": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]},
        ],
    },
    {
        "title": "Cash Flow Statement",
        "rows": [
            {"label": "Operating Cash Flow", "tags": ["NetCashProvidedByUsedInOperatingActivities"]},
            {"label": "Capital Expenditures", "tags": ["PaymentsToAcquirePropertyPlantAndEquipment"]},
            {"label": "Investing Cash Flow", "tags": ["NetCashProvidedByUsedInInvestingActivities"]},
            {"label": "Financing Cash Flow", "tags": ["NetCashProvidedByUsedInFinancingActivities"]},
            {"label": "Dividends Paid", "tags": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]},
            {"label": "Share Repurchases", "tags": ["PaymentsForRepurchaseOfCommonStock"]},
            {"label": "Depreciation and Amortization", "tags": ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationExpense"]},
        ],
    },
    {
        "title": "Other Applicable Metrics",
        "rows": [
            {"label": "Diluted Shares", "tags": ["WeightedAverageNumberOfDilutedSharesOutstanding"]},
            {"label": "Basic Shares", "tags": ["WeightedAverageNumberOfSharesOutstandingBasic"]},
            {"label": "Common Shares Outstanding", "tags": ["EntityCommonStockSharesOutstanding", "CommonStocksIncludingAdditionalPaidInCapital"]},
            {"label": "Comprehensive Income", "tags": ["ComprehensiveIncomeNetOfTax"]},
        ],
    },
]


def fetch_json(url):
    request = Request(
        url,
        headers={
            "User-Agent": SEC_USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
    )

    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def try_fetch_json(url, attempts=3):
    for attempt in range(attempts):
        try:
            return fetch_json(url)
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == attempts - 1:
                print(f"SEC request failed for {url}: {error}")
                return None

    return None


def pick_fact_units(fact):
    units = (fact or {}).get("units")
    if not units:
        return None

    unit = "USD" if "USD" in units else next(iter(units), None)
    if not unit:
        return None

    values = [
        value
        for value in units.get(unit, [])
        if isinstance(value.get("val"), (int, float)) and value.get("end") and value.get("filed")
    ]

    if not values:
        return None

    return {"unit": unit, "values": values}


def latest_by_form(values, forms):
    candidates = [value for value in values if value.get("form") in forms]
    candidates.sort(key=lambda value: f"{value.get('end', '')}-{value.get('filed', '')}", reverse=True)
    return candidates[0] if candidates else None


def candidate_score(annual, quarterly):
    return max(
        f"{(annual or {}).get('end', '')}-{(annual or {}).get('filed', '')}",
        f"{(quarterly or {}).get('end', '')}-{(quarterly or {}).get('filed', '')}",
    )


def build_financial_statements(company_facts):
    facts = ((company_facts or {}).get("facts") or {}).get("us-gaap") or {}
    statements = []

    for statement in STATEMENT_DEFINITIONS:
        rows = []

        for definition in statement["rows"]:
            selected = None

            for tag in definition["tags"]:
                units = pick_fact_units(facts.get(tag))
                if units:
                    annual = latest_by_form(units["values"], ["10-K", "20-F", "40-F"])
                    quarterly = latest_by_form(units["values"], ["10-Q"])

                    if annual or quarterly:
                        candidate = {
                            "tag": tag,
                            "units": units,
                            "annual": annual,
                            "quarterly": quarterly,
                            "score": candidate_score(annual, quarterly),
                        }

                        if not selected or candidate["score"] > selected["score"]:
                            selected = candidate

            if not selected:
                continue

            annual = selected["annual"]
            quarterly = selected["quarterly"]

            rows.append(
                {
                    "label": definition["label"],
                    "tag": selected["tag"],
                    "unit": selected["units"]["unit"],
                    "annual": annual.get("val") if annual else None,
                    "annualPeriod": annual.get("end") if annual else None,
                    "annualFiled": annual.get("filed") if annual else None,
                    "quarterly": quarterly.get("val") if quarterly else None,
                    "quarterlyPeriod": quarterly.get("end") if quarterly else None,
                    "quarterlyFiled": quarterly.get("filed") if quarterly else None,
                }
            )

        if rows:
            statements.append({"title": statement["title"], "rows": rows})

    return statements


def build_filings(cik, submissions):
    recent = ((submissions or {}).get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    filings = []
    cik_no_leading_zeroes = str(int(cik))

    def at(name, index, fallback=None):
        values = recent.get(name) or []
        return values[index] if index < len(values) else fallback

    for index, form in enumerate(forms):
        if form not in ("10-K", "10-Q"):
            continue

        accession_number = at("accessionNumber", index)
        primary_document = at("primaryDocument", index)

        if not accession_number or not primary_document:
            continue

        filings.append(
            {
                "accessionNumber": accession_number,
                "form": form,
                "filedAt": at("filingDate", index, "") or "",
                "reportDate": at("reportDate", index),
                "description": at("primaryDocDescription", index) or f"{form} filing",
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik_no_leading_zeroes}/{accession_number.replace('-', '')}/{primary_document}",
            }
        )

        if len(filings) >= 6:
            break

    return filings


def load_company_record(security, updated_at):
    symbol = security.get("symbol")
    cik = security.get("cik")

    if not symbol or not cik:
        return None

    submissions = try_fetch_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
    company_facts = try_fetch_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")
    statements = build_financial_statements(company_facts)
    filings = build_filings(cik, submissions)

    return symbol, {
        "symbol": symbol,
        "cik": cik,
        "companyName": (submissions or {}).get("name") or security.get("name"),
        "filings": filings,
        "statements": {
            "source": "SEC CompanyFacts",
            "statements": statements,
        },
        "provider": "SEC EDGAR",
        "message": "Official SEC EDGAR 10-K/10-Q filings and CompanyFacts financial statement tables loaded.",
        "updatedAt": updated_at,
    }


def main():
    if not YFINANCE_SNAPSHOT_PATH.exists():
        raise RuntimeError("Run scripts/fetch_yfinance_data.py before generating SEC data.")

    updated_at = datetime.now(timezone.utc).isoformat()
    universe = json.loads(YFINANCE_SNAPSHOT_PATH.read_text(encoding="utf-8")).get("universe", [])
    companies = {}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(load_company_record, security, updated_at) for security in universe]

        for index, future in enumerate(as_completed(futures), start=1):
            result = future.result()

            if result:
                symbol, record = result
                companies[symbol] = record

            if index % 25 == 0 or index == len(futures):
                print(f"Loaded SEC data for {index}/{len(futures)} companies", flush=True)

    payload = {
        "provider": "SEC EDGAR",
        "updatedAt": updated_at,
        "companies": companies,
        "message": f"{len(companies)} SEC company records generated from EDGAR submissions and CompanyFacts.",
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(payload["message"])


if __name__ == "__main__":
    main()
