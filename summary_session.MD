# 📋 Rezumat sesiune — AI Trader Project

## Ce am construit

Un sistem complet de trading crypto cu AI, format din 3 componente:

### 1. Strategy Lab (`react-app/src/StrategyLab.jsx`)
- Backtester care testează **6 strategii** pe date istorice reale (CoinGecko API)
- Strategii: RSI Pur, RSI Strict, RSI+MACD, RSI+MACD+Bollinger, MACD Crossover, Bollinger Bands
- Grafic comparativ equity curves pentru toate strategiile
- Analiză AI la final cu recomandare strategie optimă
- Capital simulat: $10,000 USDT

### 2. Paper Trading Bot (`react-app/src/TradingBot.jsx`)
- Bot de simulare cu prețuri live BTC/ETH/SOL
- Indicatori calculați în timp real: RSI(14), MACD(12/26/9), Bollinger(20)
- Decizii AI la fiecare 2 minute
- Log tranzacții + grafic evoluție capital

### 3. Python Bot Real (`python-bot/ai_trading_bot_ollama.py`)
- Bot de trading **real pe Binance Spot**
- Folosește **Ollama local (llama3:8b)** — zero costuri API
- Simboluri: BTCUSDT, ETHUSDT, BNBUSDT
- Protecții: max 30% per asset, stop zilnic la -8%, fără withdrawal permissions

---

## Stack tehnologic

| Componentă | Tehnologie |
|------------|-----------|
| Frontend   | React 18 + Vite + Recharts |
| AI decizii (React app) | Claude Sonnet via Anthropic API |
| AI decizii (Python bot) | Ollama llama3:8b (local, gratuit) |
| Date live  | CoinGecko API (gratuit, fără key) |
| Trading real | Binance Spot API (python-binance) |

---

## Structura proiectului

```
ai-trader/
├── react-app/
│   ├── src/
│   │   ├── App.jsx          ← router între cele 2 tool-uri
│   │   ├── StrategyLab.jsx  ← backtester 6 strategii
│   │   └── TradingBot.jsx   ← paper trading bot
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── python-bot/
    ├── ai_trading_bot_ollama.py  ← BOT PRINCIPAL (Ollama)
    ├── ai_trading_bot.py         ← versiunea cu Claude API
    ├── requirements_ollama.txt   ← doar python-binance
    └── SETUP_GUIDE.md
```

---

## Comenzi de rulare

```bash
# React App (Strategy Lab + Paper Bot)
cd react-app
npm install
npm run dev
# → http://localhost:3000

# Python Bot (Ollama)
ollama serve                          # Terminal 1
cd python-bot
pip install python-binance            # o singură dată
python ai_trading_bot_ollama.py       # Terminal 2
```

---

## Configurare Python Bot

În `ai_trading_bot_ollama.py` editează:

```python
BINANCE_API_KEY    = "cheia_ta_api_binance"
BINANCE_API_SECRET = "secretul_tau_binance"
OLLAMA_URL         = "http://localhost:11434/api/chat"
OLLAMA_MODEL       = "llama3:8b"
CAPITAL_USDT       = 400        # câți $ aloci
CYCLE_MINUTES      = 5          # frecvența analizei
MIN_AI_CONFIDENCE  = 65         # min confidence pentru execuție
```

---

## Status curent

- [x] React app complet (Strategy Lab + Paper Bot)
- [x] Python bot adaptat pentru Ollama (gratuit, local)
- [x] Binance API Key generat și configurat corect
  - Enable Reading ✅
  - Enable Spot & Margin Trading ✅
  - Restrict to trusted IPs ✅
  - Withdrawals DEZACTIVAT ✅
- [ ] Rulat Strategy Lab pentru a alege cea mai bună strategie
- [ ] Testat Paper Bot câteva zile
- [ ] Pornit Python Bot cu capital mic (~50€ mai întâi)

---

## Workflow recomandat (pași următori)

1. **Rulează Strategy Lab** → testează BTC/ETH pe 60-90 zile
2. **Compară strategiile** → lasă AI-ul să recomande cea mai stabilă
3. **Modifică botul** să folosească strategia câștigătoare
4. **Paper trading** câteva zile → verifică că funcționează live
5. **Real trading** cu 50€ mai întâi → crești treptat dacă merge bine

---

## Modele Ollama disponibile pe PC

```
llama3:8b    4.7 GB   ← FOLOSIT (recomandat pentru trading bot)
gemma3:1b    815 MB   ← prea mic pentru JSON consistent
```

---

## Note importante

- Botul NU garantează profit — piețele crypto sunt volatile
- Backtesting pe date istorice ≠ performanță viitoare
- Comisioanele Binance (~0.1% per trade) nu sunt incluse în simulare
- Testează ÎNTOTDEAUNA cu suma minimă înainte să mărești capitalul