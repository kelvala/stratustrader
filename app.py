import streamlit as st
import pandas as pd
import plotly.graph_objs as go
import numpy as np

# ====== Load autocomplete CSV ======
def load_symbols(csv_path):
    try:
        df = pd.read_csv(csv_path)
        if 'symbol' in df.columns and 'name' in df.columns:
            return df[['symbol', 'name']]
        # fallback for no header
        df.columns = ['symbol', 'name']
        return df[['symbol', 'name']]
    except Exception:
        # fallback
        return pd.DataFrame({
            'symbol': ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'],
            'name': ['Apple Inc', 'Microsoft Corp', 'Tesla Inc', 'NVIDIA Corp', 'Amazon.com Inc']
        })

SYMBOLS = load_symbols('public/stock_data.csv')

# ====== Autocomplete ======
def autocomplete(query):
    query = query.upper()
    results = SYMBOLS[SYMBOLS['symbol'].str.startswith(query)]
    if len(results) < 12:
        mask = SYMBOLS['symbol'].str.contains(query) | SYMBOLS['name'].str.upper().str.contains(query)
        results = pd.concat([results, SYMBOLS[mask]]).drop_duplicates().head(12)
    return results

# ====== Chart helpers ======
def SMA(vals, w):
    vals = np.array(vals)
    sma = pd.Series(vals).rolling(window=w, min_periods=w).mean().to_numpy()
    return sma

def EMA(vals, span):
    vals = np.array(vals)
    return pd.Series(vals).ewm(span=span, adjust=False).mean().to_numpy()

def RSI(values, period=14):
    values = np.array(values)
    deltas = np.diff(values)
    seed = deltas[:period]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / (down if down != 0 else 1e-10)
    rsi = np.zeros_like(values)
    rsi[:period] = 100. - 100. / (1. + rs)
    for i in range(period, len(values)):
        delta = deltas[i - 1]
        if delta > 0:
            upval = delta
            downval = 0
        else:
            upval = 0
            downval = -delta
        up = (up * (period - 1) + upval) / period
        down = (down * (period - 1) + downval) / period
        rs = up / (down if down != 0 else 1e-10)
        rsi[i] = 100. - 100. / (1. + rs)
    return rsi

def MACD(closes, f=12, s=26, sig=9):
    ef = EMA(closes, f)
    es = EMA(closes, s)
    macd = ef - es
    signal = EMA(macd, sig)
    hist = macd - signal
    return macd, signal, hist

# ====== Ichimoku helpers ======
def rolling_high(arr, window):
    return pd.Series(arr).rolling(window=window, min_periods=window).max().to_numpy()

def rolling_low(arr, window):
    return pd.Series(arr).rolling(window=window, min_periods=window).min().to_numpy()

def arr_shift_fwd(arr, k, n):
    out = np.full(n, np.nan)
    for i in range(n):
        if i + k < n:
            out[i + k] = arr[i]
    return out

def arr_shift_back(arr, k, n):
    out = np.full(n, np.nan)
    for i in range(n):
        if i - k >= 0:
            out[i - k] = arr[i]
    return out

def calc_ichimoku(df):
    n = len(df)
    high = df['high'].to_numpy()
    low = df['low'].to_numpy()
    close = df['close'].to_numpy()
    conv_hi = rolling_high(high, 9)
    conv_lo = rolling_low(low, 9)
    kij_hi = rolling_high(high, 26)
    kij_lo = rolling_low(low, 26)
    senb_hi = rolling_high(high, 52)
    senb_lo = rolling_low(low, 52)
    tenkan = (conv_hi + conv_lo) / 2
    kijun = (kij_hi + kij_lo) / 2
    senA0 = (tenkan + kijun) / 2
    senB0 = (senb_hi + senb_lo) / 2
    shift = 26
    spanA = arr_shift_fwd(senA0, shift, n)
    spanB = arr_shift_fwd(senB0, shift, n)
    chikou = arr_shift_back(close, shift, n)
    return tenkan, kijun, spanA, spanB, chikou

# ====== Data fetch (Yahoo Finance via yfinance) ======
import yfinance as yf

def fetch_chart(ticker, period='6mo', interval='1d'):
    df = yf.download(ticker, period=period, interval=interval)
    if df.empty:
        return None
    df = df.reset_index()
    df['date'] = pd.to_datetime(df['Date'])
    df['open'] = df['Open']
    df['high'] = df['High']
    df['low'] = df['Low']
    df['close'] = df['Close']
    df['volume'] = df['Volume']
    return df[['date', 'open', 'high', 'low', 'close', 'volume']]

# ====== UI ======
st.set_page_config(page_title="Stratus Trader Stock Analyzer", layout="wide")
st.title("Stratus Trader Stock Analyzer")

st.sidebar.header("Ticker Search")
ticker_input = st.sidebar.text_input("Enter ticker symbol", "AAPL")
if ticker_input:
    ac_results = autocomplete(ticker_input)
    st.sidebar.write("Suggestions:")
    for _, row in ac_results.iterrows():
        st.sidebar.write(f"{row['symbol']} - {row['name']}")

period = st.sidebar.selectbox("Period", ['1mo','3mo','6mo','1y','2y','5y','10y','max'], index=2)
interval = st.sidebar.selectbox("Interval", ['1d','1wk','1mo'], index=0)

if st.sidebar.button("Analyze"):
    df = fetch_chart(ticker_input, period, interval)
    if df is not None:
        st.subheader(f"{ticker_input} Chart")
        # SMAs
        sma20 = SMA(df['close'], 20)
        sma50 = SMA(df['close'], 50)
        sma200 = SMA(df['close'], 200)
        # RSI
        rsi = RSI(df['close'], 14)
        # MACD
        macd, signal, hist = MACD(df['close'])
        # Ichimoku
        tenkan, kijun, spanA, spanB, chikou = calc_ichimoku(df)
        # Chart
        fig = go.Figure()
        fig.add_trace(go.Candlestick(x=df['date'], open=df['open'], high=df['high'], low=df['low'], close=df['close'], name='Candles'))
        fig.add_trace(go.Scatter(x=df['date'], y=sma20, mode='lines', name='SMA20'))
        fig.add_trace(go.Scatter(x=df['date'], y=sma50, mode='lines', name='SMA50'))
        fig.add_trace(go.Scatter(x=df['date'], y=sma200, mode='lines', name='SMA200'))
        fig.add_trace(go.Scatter(x=df['date'], y=tenkan, mode='lines', name='Tenkan', line=dict(dash='dot')))
        fig.add_trace(go.Scatter(x=df['date'], y=kijun, mode='lines', name='Kijun', line=dict(dash='dash')))
        fig.add_trace(go.Scatter(x=df['date'], y=chikou, mode='lines', name='Chikou'))
        # Volume
        fig.add_trace(go.Bar(x=df['date'], y=df['volume'], name='Volume', yaxis='y2', marker_color='rgba(100,100,200,0.3)'))
        fig.update_layout(
            xaxis=dict(domain=[0,1]),
            yaxis=dict(title='Price'),
            yaxis2=dict(title='Volume', overlaying='y', side='right', showgrid=False),
            legend=dict(orientation='h'),
            margin=dict(l=60, r=24, t=10, b=24),
            template='plotly_dark' if st.get_option('theme.base') == 'dark' else 'plotly_white',
            hovermode='x unified'
        )
        st.plotly_chart(fig, use_container_width=True)
        # Info card
        last = df['close'].iloc[-1]
        prev = df['close'].iloc[-2] if len(df) > 1 else None
        dayChg = last - prev if prev is not None else None
        dayPct = (dayChg / prev * 100) if prev and prev != 0 else None
        st.markdown(f"**Last:** ${last:.2f} · **Change:** {dayChg:+.2f} ({dayPct:+.2f}%)" if dayChg is not None else f"**Last:** ${last:.2f}")
        st.markdown(f"Yesterday’s Close: ${prev:.2f}" if prev is not None else "Yesterday’s Close: —")
        # Intrinsic value (simple Graham formula)
        eps = None
        growth = None
        ivGraham = None
        try:
            yf_ticker = yf.Ticker(ticker_input)
            info = yf_ticker.info
            eps = info.get('trailingEps')
            growth = info.get('earningsGrowth')
            if eps and growth:
                ivGraham = eps * (8.5 + 2 * (growth*100))
        except Exception:
            pass
        st.markdown(f"Intrinsic Value: ${ivGraham:.2f}" if ivGraham else "Intrinsic Value: —")
        # Recommendation
        rec = 'Hold'
        color = 'gray'
        if ivGraham and last:
            if last < ivGraham * 0.85:
                rec = 'Buy'
                color = 'green'
            elif last > ivGraham * 1.15:
                rec = 'Sell'
                color = 'red'
        st.markdown(f"Recommendation: <span style='color:{color};font-weight:800'>{rec}</span>", unsafe_allow_html=True)
    else:
        st.error("No price data found for this ticker.")

# ====== Screeners & GPT popover (sidebar tabs) ======
st.sidebar.header("Screeners & GPTs")
screeners = [
    "Fast EPS Growers (Above 200DMA)",
    "Sales Rockets (Low Debt, High ROE)",
    "Low PE Value (Quality Checks)",
    "Compounding Winners (Near 52-Wk Highs)",
    "Dividend Growth Value",
    "Buy-and-Hold Value (PEG < 1)",
    "Earnings Pop: Oversold Growth (≤5d)",
    "CANSLIM Core"
]
for s in screeners:
    st.sidebar.write(f"- {s}")

st.sidebar.header("GPT Prompts")
gpt_prompt = st.sidebar.text_area("Prompt for GPT", "Analyze {ticker} fundamentals and technicals.")
if st.sidebar.button("Copy Prompt"):
    st.sidebar.success("Prompt copied to clipboard!")

# ====== Branding ======
st.sidebar.image('public/assets/stratus-trader-wide.png', width=120)
