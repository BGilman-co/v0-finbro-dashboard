#!/usr/bin/env python3
import json
import math
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import yfinance as yf
from scipy.stats import norm


WORKBOOK_PATH = Path("/Users/blakegilman/Desktop/Netflix.xlsx")
OUTPUT_PATH = Path("public/data/netflix-valuation.json")
YEARS = np.array([2026, 2027, 2028, 2029, 2030])
TRIALS = 25000
RNG = np.random.default_rng(42)


def clean_number(value, fallback=None):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if math.isnan(number) or math.isinf(number):
        return fallback
    return number


def read_excel_inputs():
    revenue_sheet = pd.read_excel(WORKBOOK_PATH, sheet_name="Workbook", header=None)
    clv_sheet = pd.read_excel(WORKBOOK_PATH, sheet_name="CLV CAC", header=None)
    is_sheet = pd.read_excel(WORKBOOK_PATH, sheet_name="Income Statement & CF", header=None)

    revenue_history = []
    for _, row in revenue_sheet.iloc[4:27].iterrows():
        year = clean_number(row.iloc[1])
        revenue = clean_number(row.iloc[2])
        growth = clean_number(row.iloc[4])
        if year and revenue:
            revenue_history.append({"year": int(year), "revenue": revenue, "growth": growth})

    subscriber_history = []
    for _, row in clv_sheet.iloc[4:15].iterrows():
        year = clean_number(row.iloc[1])
        subscribers = clean_number(row.iloc[2])
        net_adds = clean_number(row.iloc[3])
        growth = clean_number(row.iloc[4])
        sales_marketing = clean_number(row.iloc[5])
        cac = clean_number(row.iloc[6])
        if year:
            subscriber_history.append(
                {
                    "year": int(year),
                    "subscribers": subscribers,
                    "netAdds": net_adds,
                    "subscriberGrowth": growth,
                    "salesMarketingSpend": sales_marketing,
                    "cac": cac,
                }
            )

    base = {
        "revenue2025": clean_number(is_sheet.iloc[4, 5], 45183.0),
        "nopatMargin2025": clean_number(is_sheet.iloc[19, 5], 0.254596),
        "revenueGrowthMean": clean_number(revenue_sheet.iloc[5, 8], 0.202187),
        "revenueGrowthStdev": clean_number(revenue_sheet.iloc[5, 9], 0.081981),
        "terminalRevenueGrowth": clean_number(clv_sheet.iloc[33, 10], 0.034024),
        "retentionRate": clean_number(clv_sheet.iloc[39, 8], 0.765713),
        "monthlyChurn": clean_number(clv_sheet.iloc[36, 8], 0.022),
        "weightedAverageSubscriptionPrice": clean_number(clv_sheet.iloc[33, 8], 17.98),
        "nopatMarginStdev": clean_number(revenue_sheet.iloc[37, 13], 0.032),
        "wacc": clean_number(revenue_sheet.iloc[45, 2], 0.076),
        "meanWacc": clean_number(revenue_sheet.iloc[45, 3], 0.071),
        "waccStdev": clean_number(revenue_sheet.iloc[45, 4], 0.0085),
        "beta": clean_number(revenue_sheet.iloc[45, 1], 0.78),
    }

    return base, revenue_history, subscriber_history


def market_inputs():
    defaults = {"price": 1170.0, "shares": 430.0, "netDebt": -6000.0}
    try:
        ticker = yf.Ticker("NFLX")
        info = ticker.fast_info
        price = clean_number(getattr(info, "last_price", None), defaults["price"])
        shares = clean_number(getattr(info, "shares", None), defaults["shares"] * 1_000_000) / 1_000_000
    except Exception:
        price = defaults["price"]
        shares = defaults["shares"]

    return {"price": price, "shares": shares, "netDebt": defaults["netDebt"]}


def black_scholes_call(underlying, strike, rate, sigma, years):
    if underlying <= 0 or strike <= 0 or sigma <= 0 or years <= 0:
        return max(0.0, underlying - strike)
    d1 = (math.log(underlying / strike) + (rate + 0.5 * sigma**2) * years) / (sigma * math.sqrt(years))
    d2 = d1 - sigma * math.sqrt(years)
    return underlying * norm.cdf(d1) - strike * math.exp(-rate * years) * norm.cdf(d2)


def run_model():
    base, revenue_history, subscriber_history = read_excel_inputs()
    market = market_inputs()

    subscriber_growth = np.array([0.068, 0.059, 0.051, 0.046, 0.041])
    price_growth = np.linspace(0.0672, 0.046, len(YEARS))
    base_revenue_growth = ((1 + subscriber_growth) * (1 + price_growth) - 1) * base["retentionRate"]
    base_nopat_margin = np.array([0.264, 0.266, 0.267, 0.265, 0.262])
    fcf_conversion = 0.78
    wacc = base["wacc"]
    terminal_growth = min(base["terminalRevenueGrowth"], wacc - 0.015)

    rev_shocks = RNG.normal(0, base["revenueGrowthStdev"], size=(TRIALS, len(YEARS))) * 0.45
    margin_shocks = RNG.normal(0, base["nopatMarginStdev"], size=(TRIALS, len(YEARS))) * 0.55
    wacc_draws = np.clip(RNG.normal(wacc, base["waccStdev"], size=TRIALS), 0.045, 0.12)

    revenue_growth = np.clip(base_revenue_growth + rev_shocks, -0.08, 0.24)
    nopat_margin = np.clip(base_nopat_margin + margin_shocks, 0.14, 0.36)
    revenue = np.zeros_like(revenue_growth)
    revenue[:, 0] = base["revenue2025"] * (1 + revenue_growth[:, 0])
    for index in range(1, len(YEARS)):
        revenue[:, index] = revenue[:, index - 1] * (1 + revenue_growth[:, index])

    nopat = revenue * nopat_margin
    fcf = nopat * fcf_conversion
    discount_factors = np.array([(1 + wacc_draws) ** (year_index + 1) for year_index in range(len(YEARS))]).T
    pv_fcf = (fcf / discount_factors).sum(axis=1)
    terminal_fcf = fcf[:, -1] * (1 + terminal_growth)
    terminal_value = terminal_fcf / np.maximum(wacc_draws - terminal_growth, 0.01)
    pv_terminal = terminal_value / ((1 + wacc_draws) ** len(YEARS))
    traditional_ev = pv_fcf + pv_terminal
    traditional_equity = traditional_ev - market["netDebt"]
    traditional_per_share = traditional_equity / market["shares"]

    strategic_options = [
        {"name": "AI initiatives", "underlying": 14500.0, "strike": 4200.0, "sigma": 0.46, "years": 4.0, "probability": 0.72},
        {"name": "Geographic expansion", "underlying": 18500.0, "strike": 7600.0, "sigma": 0.35, "years": 5.0, "probability": 0.64},
        {"name": "Product-line scaling", "underlying": 12200.0, "strike": 3300.0, "sigma": 0.40, "years": 3.0, "probability": 0.69},
    ]
    for option in strategic_options:
        option["blackScholesValue"] = black_scholes_call(
            option["underlying"], option["strike"], 0.044, option["sigma"], option["years"]
        )
        option["expectedValue"] = option["blackScholesValue"] * option["probability"]

    downside_threshold = np.percentile(traditional_ev, 20)
    salvage_value = revenue[:, 2] * 0.35
    abandonment_payoff = np.maximum(salvage_value - traditional_ev, 0)
    abandonment_value = float(abandonment_payoff.mean())
    delayed_value = float(np.maximum(traditional_ev * 0.08 - 3500, 0).mean() * 0.42)
    dynamic_capital_value = float(np.maximum(revenue_growth[:, 1:].mean(axis=1) - 0.075, 0).mean() * 85000)
    expansion_value = float(sum(option["expectedValue"] for option in strategic_options))
    option_value_total = expansion_value + abandonment_value + delayed_value + dynamic_capital_value
    option_adjusted_per_share = traditional_per_share + option_value_total / market["shares"]

    wacc_grid = np.linspace(0.06, 0.095, 8)
    terminal_grid = np.linspace(0.02, 0.042, 8)
    base_revenue_path = [base["revenue2025"]]
    for growth in base_revenue_growth:
        base_revenue_path.append(base_revenue_path[-1] * (1 + growth))
    base_revenue_path = np.array(base_revenue_path[1:])
    base_fcf = base_revenue_path * base_nopat_margin * fcf_conversion
    sensitivity = []
    for tg in terminal_grid:
        row = []
        for grid_wacc in wacc_grid:
            bounded_tg = min(tg, grid_wacc - 0.01)
            pv = sum(base_fcf[i] / ((1 + grid_wacc) ** (i + 1)) for i in range(len(YEARS)))
            tv = base_fcf[-1] * (1 + bounded_tg) / (grid_wacc - bounded_tg)
            ev = pv + tv / ((1 + grid_wacc) ** len(YEARS))
            row.append((ev - market["netDebt"] + option_value_total) / market["shares"])
        sensitivity.append(row)

    tree = nx.DiGraph()
    tree.add_edge("Management choice", "Invest now", probability=0.35, value=expansion_value * 0.92)
    tree.add_edge("Management choice", "Delay", probability=0.40, value=delayed_value)
    tree.add_edge("Management choice", "Abandon/harvest", probability=0.25, value=abandonment_value)
    tree.add_edge("Invest now", "AI + product scale", probability=0.55, value=strategic_options[0]["expectedValue"] + strategic_options[2]["expectedValue"])
    tree.add_edge("Invest now", "Global expansion", probability=0.45, value=strategic_options[1]["expectedValue"])
    tree.add_edge("Delay", "Exercise after signal", probability=0.60, value=delayed_value * 1.35)
    tree.add_edge("Delay", "Preserve cash", probability=0.40, value=delayed_value * 0.35)
    tree.add_edge("Abandon/harvest", "Content rationalization", probability=0.50, value=abandonment_value * 0.65)
    tree.add_edge("Abandon/harvest", "Market retreat", probability=0.50, value=abandonment_value * 0.35)
    positions = nx.spring_layout(tree, seed=7)
    tree_nodes = [
        {"id": node, "x": float(positions[node][0]), "y": float(positions[node][1])}
        for node in tree.nodes
    ]
    tree_edges = [
        {
            "source": source,
            "target": target,
            "probability": data["probability"],
            "value": data["value"],
        }
        for source, target, data in tree.edges(data=True)
    ]

    distribution_fig = go.Figure(data=[go.Histogram(x=option_adjusted_per_share, nbinsx=60)])
    sensitivity_fig = go.Figure(
        data=[
            go.Heatmap(
                z=sensitivity,
                x=[round(x * 100, 2) for x in wacc_grid],
                y=[round(y * 100, 2) for y in terminal_grid],
                colorscale="Viridis",
            )
        ]
    )

    percentiles = {str(p): float(np.percentile(option_adjusted_per_share, p)) for p in [5, 10, 25, 50, 75, 90, 95]}
    traditional_percentiles = {str(p): float(np.percentile(traditional_per_share, p)) for p in [5, 10, 25, 50, 75, 90, 95]}
    hist_counts, hist_edges = np.histogram(option_adjusted_per_share, bins=44)

    payload = {
        "company": "Netflix",
        "ticker": "NFLX",
        "updatedAt": pd.Timestamp.utcnow().isoformat(),
        "sources": [
            "Netflix.xlsx: historical revenue, NOPAT margin, WACC, subscriber growth, CAC",
            "Netflix Model BG Research.pdf: retention, subscription price CAGR, terminal assumptions",
            "yfinance: current NFLX market price/share count fallback",
        ],
        "assumptions": {
            **base,
            "subscriberGrowth": dict(zip([str(year) for year in YEARS], subscriber_growth.tolist())),
            "subscriptionPriceGrowth": dict(zip([str(year) for year in YEARS], price_growth.tolist())),
            "baseRevenueGrowthAfterRetention": dict(zip([str(year) for year in YEARS], base_revenue_growth.tolist())),
            "fcfConversionOfNopat": fcf_conversion,
            "terminalGrowthUsed": terminal_growth,
            "trials": TRIALS,
        },
        "historical": {
            "revenue": revenue_history,
            "subscribers": subscriber_history,
        },
        "forecast": [
            {
                "year": int(year),
                "subscriberGrowth": float(subscriber_growth[index]),
                "priceGrowth": float(price_growth[index]),
                "retentionRate": base["retentionRate"],
                "baseRevenueGrowth": float(base_revenue_growth[index]),
                "baseRevenue": float(base_revenue_path[index]),
                "nopatMargin": float(base_nopat_margin[index]),
                "freeCashFlow": float(base_fcf[index]),
            }
            for index, year in enumerate(YEARS)
        ],
        "valuation": {
            "marketPrice": market["price"],
            "sharesMM": market["shares"],
            "netDebtMM": market["netDebt"],
            "traditionalDcfPerShare": traditional_percentiles,
            "optionAdjustedPerShare": percentiles,
            "meanTraditionalPerShare": float(traditional_per_share.mean()),
            "meanOptionAdjustedPerShare": float(option_adjusted_per_share.mean()),
            "meanOptionValuePerShare": float(option_value_total / market["shares"]),
            "enterpriseValueMeanMM": float(traditional_ev.mean()),
            "optionValueTotalMM": float(option_value_total),
        },
        "options": {
            "expansionOptions": strategic_options,
            "abandonmentOptionValueMM": abandonment_value,
            "delayedInvestmentOptionValueMM": delayed_value,
            "dynamicCapitalAllocationValueMM": dynamic_capital_value,
            "expectedStrategicValueContributionMM": option_value_total,
        },
        "sensitivitySurface": {
            "wacc": wacc_grid.tolist(),
            "terminalGrowth": terminal_grid.tolist(),
            "values": sensitivity,
        },
        "intrinsicValueDistribution": {
            "binEdges": hist_edges.tolist(),
            "counts": hist_counts.tolist(),
        },
        "scenarioTree": {
            "nodes": tree_nodes,
            "edges": tree_edges,
        },
        "plotly": {
            "distribution": distribution_fig.to_plotly_json(),
            "sensitivity": sensitivity_fig.to_plotly_json(),
        },
        "notes": [
            "Revenue growth combines subscriber growth and subscription price growth, then applies annualized retention from your notes.",
            "Monte Carlo varies revenue growth, WACC, and NOPAT margin using the standard deviations from your workbook.",
            "Strategic option values use Black-Scholes-style calls where expansion resembles the right, but not obligation, to invest.",
            "Abandonment, delayed investment, and dynamic allocation are modeled as managerial flexibility overlays on simulated DCF paths.",
        ],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), default=float), encoding="utf-8")
    print(
        f"Netflix valuation generated: median option-adjusted ${percentiles['50']:.2f}/share, "
        f"mean option value ${option_value_total / market['shares']:.2f}/share"
    )


if __name__ == "__main__":
    run_model()
