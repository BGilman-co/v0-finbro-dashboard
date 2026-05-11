#!/usr/bin/env python3
import csv
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request

import yfinance as yf


SP500_CSV_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
OUTPUT_PATH = Path("public/data/yfinance-snapshot.json")
DEFAULT_OPTIONS_SYMBOLS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "AMD"]
QUOTE_PERIOD = os.getenv("YFINANCE_QUOTE_PERIOD", "2d")
QUOTE_INTERVAL = os.getenv("YFINANCE_QUOTE_INTERVAL", "1m")
HISTORY_PERIOD = os.getenv("YFINANCE_HISTORY_PERIOD", "6mo")
HISTORY_INTERVAL = os.getenv("YFINANCE_HISTORY_INTERVAL", "1d")


def clean_number(value):
    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if math.isnan(number) or math.isinf(number):
        return None

    return number


def normalize_symbol(symbol):
    return symbol.strip().replace(".", "-").upper()


def yahoo_symbol(symbol):
    return normalize_symbol(symbol)


def load_universe():
    request = Request(SP500_CSV_URL, headers={"User-Agent": "B-Gilman-Co-Dashboard/1.0"})

    with urlopen(request, timeout=30) as response:
        rows = list(csv.DictReader(response.read().decode("utf-8").splitlines()))

    universe = []
    for row in rows:
        symbol = normalize_symbol(row.get("Symbol", ""))
        name = row.get("Security", "").strip()

        if not symbol or not name:
            continue

        cik = row.get("CIK", "").strip()
        universe.append(
            {
                "symbol": symbol,
                "name": name,
                "sector": row.get("GICS Sector", "").strip() or "Unclassified",
                "industry": row.get("GICS Sub-Industry", "").strip() or None,
                "exchange": "US",
                "cik": cik.zfill(10) if cik else None,
            }
        )

    if len(universe) < 400:
        raise RuntimeError(f"S&P 500 universe returned only {len(universe)} securities")

    return universe


def dataframe_for_symbol(history, symbol):
    if history.empty:
        return None

    if hasattr(history.columns, "levels"):
        if symbol in history.columns.get_level_values(0):
            return history[symbol].dropna(how="all")

        raw_symbol = symbol.replace("-", ".")
        if raw_symbol in history.columns.get_level_values(0):
            return history[raw_symbol].dropna(how="all")

    return history.dropna(how="all")


def timestamp_date(timestamp):
    if hasattr(timestamp, "to_pydatetime"):
        return timestamp.to_pydatetime().date()

    return timestamp.date()


def timestamp_iso(timestamp):
    if hasattr(timestamp, "to_pydatetime"):
        value = timestamp.to_pydatetime()
    else:
        value = timestamp

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).isoformat()


def build_quote(symbol, frame, updated_at):
    close = frame.get("Close")

    if close is None:
        return None

    closes = close.dropna()
    if closes.empty:
        return None

    latest_index = closes.index[-1]
    latest_date = timestamp_date(latest_index)
    session_frame = frame[[column for column in ["High", "Low", "Volume"] if column in frame.columns]].copy()
    session_frame = session_frame[[timestamp_date(index) == latest_date for index in session_frame.index]]
    previous_session_closes = closes[[timestamp_date(index) < latest_date for index in closes.index]]

    latest_close = clean_number(closes.iloc[-1])
    previous_close = clean_number(previous_session_closes.iloc[-1] if not previous_session_closes.empty else closes.iloc[-1])

    if latest_close is None or previous_close is None:
        return None

    high = session_frame.get("High")
    low = session_frame.get("Low")
    volume = session_frame.get("Volume")
    session_volume = clean_number(volume.dropna().sum()) if volume is not None and not volume.dropna().empty else None

    change = latest_close - previous_close

    return {
        "symbol": symbol,
        "price": latest_close,
        "previousClose": previous_close,
        "change": change,
        "changePercent": 0 if previous_close == 0 else (change / previous_close) * 100,
        "dayHigh": clean_number(high.dropna().max()) if high is not None and not high.dropna().empty else None,
        "dayLow": clean_number(low.dropna().min()) if low is not None and not low.dropna().empty else None,
        "volume": session_volume,
        "updatedAt": timestamp_iso(latest_index),
    }


def build_history(frame):
    points = []

    for timestamp, row in frame.tail(140).iterrows():
        close = clean_number(row.get("Close"))
        if close is None:
            continue

        date = timestamp.to_pydatetime().date()
        points.append(
            {
                "date": date.isoformat(),
                "label": date.strftime("%b %-d") if os.name != "nt" else date.strftime("%b %#d"),
                "open": clean_number(row.get("Open")),
                "high": clean_number(row.get("High")),
                "low": clean_number(row.get("Low")),
                "close": close,
                "volume": clean_number(row.get("Volume")),
            }
        )

    return points


def build_options(symbol):
    contracts = []

    try:
        ticker = yf.Ticker(yahoo_symbol(symbol))
        expirations = ticker.options[:1]
        if not expirations:
            return contracts

        chain = ticker.option_chain(expirations[0])
    except Exception:
        return contracts

    for contract_type, frame in (("call", chain.calls), ("put", chain.puts)):
        for _, row in frame.iterrows():
            contract = row.get("contractSymbol")
            strike = clean_number(row.get("strike"))

            if not contract or strike is None:
                continue

            contracts.append(
                {
                    "contract": str(contract),
                    "type": contract_type,
                    "strike": strike,
                    "expiration": expirations[0],
                    "lastPrice": clean_number(row.get("lastPrice")),
                    "bid": clean_number(row.get("bid")),
                    "ask": clean_number(row.get("ask")),
                    "volume": clean_number(row.get("volume")),
                    "openInterest": clean_number(row.get("openInterest")),
                    "impliedVolatility": clean_number(row.get("impliedVolatility")),
                }
            )

    return sorted(contracts, key=lambda option: option.get("volume") or 0, reverse=True)[:12]


def main():
    updated_at = datetime.now(timezone.utc).isoformat()
    universe = load_universe()
    symbols = [security["symbol"] for security in universe]
    tickers = " ".join(yahoo_symbol(symbol) for symbol in symbols)
    daily_history = yf.download(
        tickers=tickers,
        period=HISTORY_PERIOD,
        interval=HISTORY_INTERVAL,
        group_by="ticker",
        auto_adjust=False,
        actions=False,
        threads=True,
        progress=False,
    )
    quote_history = yf.download(
        tickers=tickers,
        period=QUOTE_PERIOD,
        interval=QUOTE_INTERVAL,
        group_by="ticker",
        auto_adjust=False,
        actions=False,
        threads=True,
        progress=False,
    )

    quotes = []
    histories = {}

    for symbol in symbols:
        quote_frame = dataframe_for_symbol(quote_history, yahoo_symbol(symbol))
        history_frame = dataframe_for_symbol(daily_history, yahoo_symbol(symbol))
        fallback_frame = history_frame if history_frame is not None and not history_frame.empty else quote_frame

        if quote_frame is not None and not quote_frame.empty:
            quote = build_quote(symbol, quote_frame, updated_at)
        elif fallback_frame is not None and not fallback_frame.empty:
            quote = build_quote(symbol, fallback_frame, updated_at)
        else:
            quote = None

        points = build_history(history_frame) if history_frame is not None and not history_frame.empty else []

        if quote:
            quotes.append(quote)
        if points:
            histories[symbol] = points

    options_symbols = [
        normalize_symbol(symbol)
        for symbol in os.getenv("YFINANCE_OPTIONS_SYMBOLS", ",".join(DEFAULT_OPTIONS_SYMBOLS)).split(",")
        if symbol.strip()
    ]
    options = {symbol: build_options(symbol) for symbol in options_symbols}

    payload = {
        "provider": "yfinance / Yahoo Finance",
        "updatedAt": updated_at,
        "universe": universe,
        "quotes": quotes,
        "histories": histories,
        "options": options,
        "message": f"{len(quotes)} S&P 500 intraday quote records and {len(histories)} price histories generated with yfinance.",
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(payload["message"])


if __name__ == "__main__":
    main()
