# 🤖 AI Trader — Proiect Complet

Sistem de trading crypto cu AI (Claude) format din 3 module.

## Structura proiectului

```
ai-trader/
├── react-app/          ← Interfețe web (rulează în browser)
│   ├── src/
│   │   ├── App.jsx         ← Router principal
│   │   ├── StrategyLab.jsx ← Backtester strategii
│   │   └── TradingBot.jsx  ← Paper trading bot (simulare)
│   ├── package.json
│   └── vite.config.js
│
└── python-bot/         ← Bot real Binance (bani reali)
    ├── ai_trading_bot.py
    ├── requirements.txt
    └── SETUP_GUIDE.md
```

---

## 🖥️ React App (Strategy Lab + Paper Bot)

### Setup (prima dată)
```bash
cd react-app
npm install
```

### Rulare
```bash
npm run dev
# Deschide automat: http://localhost:3000
```

### Ce conține:
- **Strategy Lab** — testează 6 strategii pe date istorice reale (CoinGecko)
  - RSI Pur, RSI Strict, RSI+MACD, RSI+MACD+Bollinger, MACD Crossover, Bollinger
  - Grafic equity curves comparative
  - Analiză AI cu recomandare strategie
- **Paper Bot** — simulare trading cu $10,000 virtual
  - Prețuri live BTC/ETH/SOL
  - Decizii AI în timp real
  - Log tranzacții

---

## 🐍 Python Bot (Binance Real Trading)

### Setup
```bash
cd python-bot
pip install -r requirements.txt
```

### Configurare (obligatoriu înainte de rulare!)
Deschide `ai_trading_bot.py` și completează:
```python
BINANCE_API_KEY    = "cheia_ta_api"
BINANCE_API_SECRET = "secretul_tau"
CLAUDE_API_KEY     = "cheia_anthropic"
CAPITAL_USDT       = 400   # câți $ aloci
```

Citește `SETUP_GUIDE.md` pentru instrucțiuni complete API Binance.

### Rulare
```bash
python ai_trading_bot.py
```

---

## ⚠️ Workflow recomandat

1. **Rulează Strategy Lab** → află care strategie e cea mai profitabilă pe date istorice
2. **Testează Paper Bot** câteva zile → verifică că logica funcționează live
3. **Abia apoi** pornești Python Bot cu bani reali, cu suma minimă (~50€)
4. Mărești capitalul treptat după ce verifici performanța

---

## API Keys necesare

| Cheie | Unde o obții | Gratuit? |
|-------|-------------|----------|
| Anthropic (Claude) | console.anthropic.com | ~$5 credit la înregistrare |
| Binance API | binance.com → API Management | Gratuit |
| CoinGecko | Nu e necesară | Gratuit |

---

## Tehnologii folosite

- **React 18** + **Vite** (front-end rapid)
- **Recharts** (grafice equity curves)
- **Python 3.10+** (bot real)
- **python-binance** (execuție ordine Binance)
- **Claude Sonnet** (decizii AI trading)
- **CoinGecko API** (date istorice + prețuri live)
