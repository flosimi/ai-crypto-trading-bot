# AI Trader — Documentație Completă

> Sistem de trading crypto cu AI local (Ollama) și date live (CoinGecko + Binance).  
> Format din două componente independente: o aplicație desktop (Electron/React) și un bot Python de trading real.

---

## Cuprins

1. [Structura proiectului](#1-structura-proiectului)
2. [Stack tehnologic](#2-stack-tehnologic)
3. [Modulul 1 — React App (Desktop)](#3-modulul-1--react-app-desktop)
   - [App.jsx — Router principal](#appjsx--router-principal)
   - [StrategyLab.jsx — Backtester](#strategylabsjx--backtester)
   - [TradingBot.jsx — Paper Bot](#tradingbotjsx--paper-bot)
   - [Settings.jsx — Configurare](#settingsjsx--configurare)
4. [Modulul 2 — Python Bot (Trading Real)](#4-modulul-2--python-bot-trading-real)
5. [Indicatori tehnici implementați](#5-indicatori-tehnici-implementați)
6. [Strategii de trading disponibile](#6-strategii-de-trading-disponibile)
7. [Sisteme de siguranță](#7-sisteme-de-siguranță)
8. [API-uri externe folosite](#8-api-uri-externe-folosite)
9. [Modele AI Ollama suportate](#9-modele-ai-ollama-suportate)
10. [Setup & Instalare](#10-setup--instalare)
11. [Fișiere generate la runtime](#11-fișiere-generate-la-runtime)
12. [Workflow recomandat](#12-workflow-recomandat)

---

## 1. Structura proiectului

```
AI_trading_bot/
│
├── react-app/                      ← Aplicație desktop (Electron + React)
│   ├── src/
│   │   ├── main.jsx                ← Entry point React
│   │   ├── App.jsx                 ← Router principal + navbar
│   │   ├── TradingBot.jsx          ← Paper trading bot (bani virtuali)
│   │   ├── StrategyLab.jsx         ← Backtester strategii
│   │   └── Settings.jsx            ← Configurare API keys + Ollama
│   ├── electron/
│   │   └── main.cjs                ← Entry point Electron (desktop app)
│   ├── package.json                ← Dependențe Node.js
│   ├── vite.config.js              ← Configurare bundler
│   └── release/                    ← Aplicație compilată (.exe)
│       └── win-unpacked/
│           └── AI Trader.exe
│
├── Python_bot/                     ← Bot trading real Binance
│   ├── ai_trading_bot.py           ← Scriptul principal
│   ├── requirements.txt            ← Dependențe Python
│   ├── SETUP_GUIDE.md              ← Ghid configurare
│   ├── bot_config.json             ← (generat din Settings UI) API keys
│   ├── trades.json                 ← (generat la rulare) Log tranzacții
│   ├── daily_state.json            ← (generat la rulare) Stare zilnică
│   └── bot_YYYYMMDD.log            ← (generat la rulare) Log zilnic
│
├── DOCUMENTATION.md                ← Acest fișier
└── README.MD                       ← Introducere rapidă
```

---

## 2. Stack tehnologic

### Frontend (React App)

| Tehnologie | Versiune | Rol |
|---|---|---|
| **React** | 18.2 | UI framework principal |
| **Vite** | 5.2 | Bundler și dev server (HMR rapid) |
| **Electron** | 41.x | Împachetare ca aplicație desktop Windows |
| **Recharts** | 2.12 | Grafice equity curves în StrategyLab |
| **electron-builder** | 26.x | Compilare installer `.exe` |
| **concurrently** | 9.x | Rulare paralelă Vite + Electron în dev mode |

### Backend (Python Bot)

| Tehnologie | Versiune | Rol |
|---|---|---|
| **Python** | 3.10+ | Runtime principal |
| **python-binance** | 1.0.19 | Client API Binance (ordine, balanțe, date) |
| **urllib** | stdlib | HTTP requests către Ollama (fără dependențe extra) |
| **json / re / math / logging** | stdlib | Procesare date, indicatori, loguri |

### AI & Date

| Serviciu | Tip | Rol |
|---|---|---|
| **Ollama** | Local (LAN) | Rulare modele AI local, fără costuri API |
| **CoinGecko API** | Cloud, gratuit | Prețuri live + date istorice orare |
| **Binance API** | Cloud, gratuit | Execuție ordine reale, balanțe, date piață |

---

## 3. Modulul 1 — React App (Desktop)

Aplicația are 3 pagini principale, navigabile din navbar:

```
🔬 STRATEGY LAB  |  🤖 PAPER BOT  |  ⚙️ SETTINGS
```

---

### App.jsx — Router principal

**Rol:** Gestionează navigarea între cele 3 pagini și afișează modelul AI activ în navbar.

**Funcționalități:**
- Routing simplu prin `useState('lab' | 'bot' | 'settings')`
- Polling la 2 secunde în localStorage pentru a detecta schimbarea modelului Ollama și a-l afișa în navbar în timp real

---

### StrategyLab.jsx — Backtester

**Rol:** Testează 6 strategii de trading pe date istorice reale și le compară vizual.

**Flux de date:**
```
CoinGecko API (date orare) → computeIndicators() → runBacktest() → Grafic + Clasament
```

**Funcționalități detaliate:**

| Funcție | Descriere |
|---|---|
| `computeIndicators(prices)` | Calculează RSI, MACD, Bollinger incremental pe toată seria de prețuri |
| `runBacktest(prices, indicators, strategy, cash, feeRate)` | Simulează tranzacțiile, calculează equity curve, drawdown, win rate |
| `score(result)` | Scor compozit 0–100 din: return (40%), drawdown (30%), win rate (20%), profit factor (10%) |
| `fetchTrending()` | Preia top 5 monede trending din CoinGecko |
| `runBacktests()` | Orchestrează fetch date + calcul indicatori + rulare 6 backteste |
| `askAI()` | Trimite rezultatele la Ollama și primește recomandare strategie în română |

**Metrici calculate per strategie:**

| Metrică | Formulă |
|---|---|
| Total Return | `(finalVal - initialCash) / initialCash * 100` |
| Max Drawdown | Peak-to-trough maxim pe equity curve |
| Win Rate | `wins / totalTrades * 100` |
| Profit Factor | `grossProfit / grossLoss` |
| Sharpe Ratio | Anualizat din date orare (`√8760` perioade/an) |
| Score compozit | Combinație ponderată din cele de mai sus |

**Perioade backtesting disponibile:** 30 / 60 / 90 zile  
**Monede disponibile:** BTC, ETH, SOL + orice coin din trending CoinGecko  
**Comisioane simulabile:** 0.1% per trade (Binance Spot standard), toggle ON/OFF

---

### TradingBot.jsx — Paper Bot

**Rol:** Simulare trading cu bani virtuali, decizii AI live la fiecare 90 secunde.

**Flux ciclu:**
```
fetchPrices() → fetchHist() → calcIndicators() → checkStopLoss() → getDecision() [Ollama] → doTrade()
```

**Componente vizuale:**

| Componentă | Rol |
|---|---|
| `Spark` | Mini grafic sparkline SVG pentru prețuri istorice sesiune |
| `Gauge` | Bară progres colorată pentru RSI și Bollinger % |
| `Badge` | Etichetă colorată BUY/SELL/HOLD cu confidence % |

**State-uri principale:**

| State | Descriere |
|---|---|
| `portfolio` | `{ cash, positions: {sym: {qty, avgPrice}}, history[] }` — persistat în localStorage |
| `prices` | Prețuri live curente per simbol |
| `sparkMap` | Ultimele 60 prețuri per simbol (pentru sparkline) |
| `signals` | Ultima decizie AI + indicatori per simbol |
| `availableModels` | Modele instalate în Ollama (fetch la pornire) |
| `pullStatus` | Progres download modele noi (`{ pct, status, done, err }`) |

**Protecții implementate:**

| Protecție | Mecanism |
|---|---|
| Stop-loss | -5% față de avg_price → SELL forțat, înainte de AI |
| Rate limit CoinGecko | Exponential backoff: 4s → 12s → 36s la HTTP 429 |
| Cicluri suprapuse | `cycleRunningRef` — dacă ciclul anterior nu s-a terminat, tick-ul următor e sărit |
| Cache date istorice | 15 minute TTL per coin în `histCache.current` |

**Parametri strategie (hardcodați, confirmate prin backtesting):**
```js
RSI_BUY  = 35   // cumpără când RSI < 35 ȘI MACD_hist > 0
RSI_SELL = 65   // vinde când RSI > 65 ȘI MACD_hist < 0
STOP_LOSS_PCT = -0.05  // stop-loss la -5% per poziție
CYCLE_MS = 90000       // ciclu la 90 secunde
```

**Instalare modele Ollama din UI:**
- Buton "⬇ INSTALEAZĂ MODELE NOI" → panou cu 6 modele recomandate
- `pullModel(id)` — stream din `/api/pull` cu progress bar live
- Detectare automată modele instalate la pornire (`/api/tags`)
- Auto-selecție model dacă cel salvat nu mai există

---

### Settings.jsx — Configurare

**Rol:** Gestionare centralizată API keys Binance, URL Ollama, capital alocat.

**Funcționalități:**

| Funcție | Descriere |
|---|---|
| Input API Key/Secret | Câmpuri cu show/hide, afișare mascată pentru verificare |
| Salvare localStorage | `cfg_binance_api_key`, `cfg_binance_api_secret`, `cfg_ollama_url`, `cfg_capital` |
| Generare comenzi terminal | PowerShell / CMD / Linux cu cheile completate + buton Copiază |
| `downloadConfig()` | Generează `bot_config.json` și declanșează download în browser |
| Test Ollama | Fetch live la `/api/tags` + status online/offline |

**Flux pentru Python bot (cel mai simplu):**
```
Settings → introdu keys → Descarcă bot_config.json → pune în Python_bot/ → python ai_trading_bot.py
```

---

## 4. Modulul 2 — Python Bot (Trading Real)

**Rol:** Trading automat real pe Binance Spot cu bani reali.

### Clasa `AITradingBot`

| Metodă | Rol |
|---|---|
| `__init__()` | Inițializare: verifică keys, conectare Binance, verificare Ollama, sincronizare poziții, încărcare stare zilnică |
| `_load_config()` | Citește `bot_config.json` (prioritar față de env vars) |
| `_check_api_keys()` | Validare prezență keys, oprire cu mesaj clar dacă lipsesc |
| `_verify_connection()` | Test conexiune Binance (`get_account()`) |
| `_verify_ollama()` | Test disponibilitate Ollama + model instalat |
| `_sync_positions()` | Sincronizare poziții existente din contul Binance la pornire |
| `_load_daily_state()` | Încarcă `daily_start_value` din `daily_state.json` (supraviețuiește restartului) |
| `_save_daily_state()` | Persistă valoarea de start a zilei |
| `get_lot_precision(sym)` | Precizie cantitate LOT_SIZE — cu cache, un singur apel API per simbol |
| `get_min_notional(sym)` | Valoare minimă ordin — din același cache |
| `get_ai_decision(sym, ind, price)` | Prompt → Ollama → JSON cu action/confidence/reasoning |
| `check_stop_loss(sym, price)` | Verifică -5% față de avg_price → SELL forțat |
| `execute_buy(sym, price, ...)` | Ordin market buy cu validare capital, concentrare, min notional |
| `execute_sell(sym, price, ...)` | Ordin market sell parțial sau total |
| `_record_trade(...)` | Salvare tranzacție cu indicatori în `trades.json` |
| `check_daily_loss_limit()` | Verifică limita -8% zilnic → oprire bot |
| `run_cycle()` | Un ciclu complet: prețuri → indicatori → stop-loss → AI → execuție |
| `run()` | Loop infinit cu timer drift-compensat |

### Configurare prin `bot_config.json`

```json
{
  "BINANCE_API_KEY":    "...",
  "BINANCE_API_SECRET": "...",
  "OLLAMA_URL":         "http://localhost:11434",
  "CAPITAL_USDT":       400
}
```

Prioritate: `bot_config.json` > variabile de mediu (`$env:BINANCE_API_KEY`)

### Parametri de trading

| Parametru | Valoare implicită | Descriere |
|---|---|---|
| `SYMBOLS` | BTC, ETH, BNB | Perechile tranzacționate |
| `CAPITAL_USDT` | 400 | Capitalul maxim alocat (USDT) |
| `CYCLE_MINUTES` | 2 | Frecvența analizei |
| `MAX_POSITION_PCT` | 30% | Concentrare maximă per asset |
| `TRADE_SIZE_PCT` | 15% | Dimensiune tranzacție din cash disponibil |
| `MIN_AI_CONFIDENCE` | 65% | Prag minim confidence AI pentru execuție |
| `DAILY_LOSS_LIMIT` | -8% | Oprire automată la pierdere zilnică |
| `STOP_LOSS_PCT` | -5% | Stop-loss per poziție |
| `RSI_BUY_THRESHOLD` | 35 | Prag RSI pentru semnal BUY |
| `RSI_SELL_THRESHOLD` | 65 | Prag RSI pentru semnal SELL |

---

## 5. Indicatori tehnici implementați

Toți indicatorii sunt calculați în Python pur (fără biblioteci externe) și în JavaScript (fără biblioteci):

### RSI — Relative Strength Index (perioadă 14)

```
delta = prețuri[i] - prețuri[i-1]
avg_gain = media exponențială a creșterilor pe 14 perioade
avg_loss = media exponențială a scăderilor pe 14 perioade
RSI = 100 - (100 / (1 + avg_gain / avg_loss))
```

- RSI < 35 → piață supravândută → potențial BUY
- RSI > 65 → piață supracumpărată → potențial SELL

### MACD — Moving Average Convergence Divergence

```
EMA_12 = media exponențială pe 12 perioade
EMA_26 = media exponențială pe 26 perioade
MACD_line = EMA_12 - EMA_26
Signal = EMA_9(MACD_line ultimele 15 valori)
Histogram = MACD_line - Signal
```

- Histogram > 0 → impuls bullish → confirmă BUY
- Histogram < 0 → impuls bearish → confirmă SELL

### Bollinger Bands (perioadă 20, 2σ)

```
mean = media ultimelor 20 prețuri
std  = deviație standard pe 20 perioade
upper = mean + 2*std
lower = mean - 2*std
BB_position = (preț - lower) / (upper - lower) * 100
```

- 0% = prețul e la banda inferioară (supravândut)
- 100% = prețul e la banda superioară (supracumpărat)

---

## 6. Strategii de trading disponibile

Testate în StrategyLab pe date orare reale CoinGecko:

| ID | Nume | Condiție BUY | Condiție SELL |
|---|---|---|---|
| `rsi_pure` | RSI Pur | RSI < 30 | RSI > 70 |
| `rsi_tight` | RSI Strict | RSI < 25 | RSI > 75 |
| `rsi_macd` | RSI + MACD ⭐ | RSI < 35 **ȘI** MACD > 0 | RSI > 65 **ȘI** MACD < 0 |
| `all_three` | RSI+MACD+BB | RSI < 35 **ȘI** MACD > 0 **ȘI** BB < 25% | RSI > 65 **ȘI** MACD < 0 **ȘI** BB > 75% |
| `macd_only` | MACD Crossover | MACD_hist trece din negativ în pozitiv | MACD_hist trece din pozitiv în negativ |
| `bb_only` | Bollinger | BB_position < 20% | BB_position > 80% |

> ⭐ **RSI + MACD** este strategia confirmată prin backtesting și folosită de bot-ul Python și Paper Bot.

---

## 7. Sisteme de siguranță

### Paper Bot (TradingBot.jsx)
- **Stop-loss -5%** per poziție — verificat la fiecare ciclu înainte de AI
- **Cicluri non-suprapuse** — `cycleRunningRef` previne overlap la 5 monede trending
- **Exponential backoff** la rate limit CoinGecko (HTTP 429)
- **Cache date istorice** — 15 minute TTL pentru a reduce apelurile API

### Python Bot (ai_trading_bot.py)
- **Stop-loss -5%** per poziție — execuție imediată, înaintea AI
- **Limită pierdere zilnică -8%** — botul se oprește automat
- **Concentrare maximă 30%** per asset din capital alocat
- **Limită capital total** — nu depășește `CAPITAL_USDT` alocat
- **Validare MIN_NOTIONAL** — nu plasează ordine sub minimul Binance (~$10)
- **Timer drift-compensat** — ciclul de 2 minute se menține exact
- **Persistența daily_start_value** — supraviețuiește restartului botului (via `daily_state.json`)
- **Cache lot_precision** — un singur apel API Binance per simbol pentru filtrele LOT_SIZE

### Securitate API Keys
- Nu sunt hardcodate în cod sursă
- Prioritate: `bot_config.json` → variabile de mediu
- UI Settings: afișare mascată, stocare în localStorage (local)
- Recomandare: activare IP restriction în Binance, fără permisiuni Withdrawal

---

## 8. API-uri externe folosite

### CoinGecko API (gratuit, fără key)

| Endpoint | Utilizare | Limită |
|---|---|---|
| `/api/v3/simple/price` | Prețuri live + variație 24h | ~30 req/min |
| `/api/v3/coins/{id}/market_chart?interval=hourly` | Date istorice orare (2 zile, ~48 puncte) | ~30 req/min |
| `/api/v3/search/trending` | Top 5 monede trending | ~30 req/min |

> Botul folosește `interval=hourly` (nu `minutely`) pentru a reduce consumul de 30×.  
> Cache intern 15 minute per coin pentru date istorice.

### Binance API

| Endpoint | Utilizare |
|---|---|
| `get_account()` | Balanțe + tip cont |
| `get_symbol_ticker(symbol)` | Preț curent |
| `get_klines(symbol, interval=15m)` | Date OHLCV pentru indicatori |
| `get_symbol_info(symbol)` | Filtre LOT_SIZE, MIN_NOTIONAL (cu cache) |
| `order_market_buy/sell()` | Execuție ordine market |

### Ollama API (local, port 11434)

| Endpoint | Utilizare |
|---|---|
| `GET /api/tags` | Lista modele instalate |
| `POST /api/chat` | Decizie AI (stream: false) |
| `POST /api/pull` | Descărcare model nou (stream: true cu progress) |

---

## 9. Modele AI Ollama suportate

| Model | Size | Tip | `num_predict` | Recomandat pentru |
|---|---|---|---|---|
| **qwen2.5:7b** | 4.7 GB | numerical | 120 | Trading — cel mai precis cu cifre și JSON |
| **deepseek-r1:7b** | 4.7 GB | reasoning | 600 | Analiză detaliată, explică deciziile |
| **llama3:8b** | 4.7 GB | general | 150 | General, echilibrat |
| **llama3.1:8b** | 4.9 GB | general | 150 | Versiune îmbunătățită Llama 3 |
| **mistral:7b** | 4.1 GB | general | 150 | Rapid, bun pentru cicluri scurte |
| **gemma3:4b** | 3.3 GB | general | 150 | Mic și rapid, bun pe 4 GB VRAM |
| **phi4-mini:3.8b** | 2.5 GB | numerical | 150 | Cel mai mic/rapid, ideal RTX 3050 Ti |

> **Notă DeepSeek R1:** Folosește blocuri `<think>...</think>` înainte de JSON.  
> Botul le elimină automat cu regex înainte de parsare. `num_predict=600` asigură că modelul termină gândirea și produce JSON valid.

---

## 10. Setup & Instalare

### Cerințe sistem

| Componentă | Minim | Recomandat |
|---|---|---|
| OS | Windows 10 | Windows 11 |
| RAM | 8 GB | 16 GB |
| GPU VRAM | 4 GB (Ollama) | 8 GB |
| Python | 3.10+ | 3.11+ |
| Node.js | 18+ | 20+ |

### React App (dev mode)

```powershell
cd react-app
npm install
npm run dev
# Deschide: http://localhost:5173
```

### React App (build .exe)

```powershell
cd react-app
npm run build
npm run electron:build
# Output: release/AI Trader Setup.exe
```

### Python Bot

```powershell
cd Python_bot
pip install -r requirements.txt

# Opțiunea 1 — cu bot_config.json (generat din UI Settings):
#   Pune bot_config.json în Python_bot/ și rulează direct:
python ai_trading_bot.py

# Opțiunea 2 — cu variabile de mediu:
$env:BINANCE_API_KEY="cheia_ta"
$env:BINANCE_API_SECRET="secretul_tau"
python ai_trading_bot.py --capital 200

# Opțiunea 3 — cu argumente CLI:
python ai_trading_bot.py --capital 200 --model llama3:8b
```

### Ollama (necesar pentru AI)

```powershell
# Instalare: https://ollama.com
ollama serve                    # pornire server

# Instalare modele (alege unul):
ollama pull qwen2.5:7b          # recomandat pentru trading
ollama pull llama3:8b           # dacă ai deja instalat
ollama pull phi4-mini:3.8b      # cel mai mic (2.5 GB)
```

---

## 11. Fișiere generate la runtime

| Fișier | Generat de | Conținut |
|---|---|---|
| `Python_bot/trades.json` | Python bot | Array JSON cu toate tranzacțiile: acțiune, simbol, cantitate, preț, PnL, indicatori la momentul tranzacției |
| `Python_bot/bot_YYYYMMDD.log` | Python bot | Log text al zilei curente cu toate evenimentele (BUY/SELL/SKIP/erori) |
| `Python_bot/daily_state.json` | Python bot | `{"date": "2026-07-04", "start_value": 412.50}` — pentru limita zilnică de pierdere |
| `Python_bot/bot_config.json` | UI Settings | `{"BINANCE_API_KEY": "...", ...}` — generat prin download din Settings |
| `react-app/dist/` | `npm run build` | Aplicație React compilată (bundle JS + HTML) |

---

## 12. Workflow recomandat

### Pas 1 — Configurare inițială
1. Instalează **Ollama** și descarcă un model (`qwen2.5:7b` recomandat)
2. Deschide app-ul → **⚙️ Settings** → introdu Binance API keys → Salvează
3. Descarcă `bot_config.json` → pune-l în `Python_bot/`

### Pas 2 — Testare strategie
1. Deschide **🔬 Strategy Lab**
2. Alege coin + perioadă → **RUN BACKTEST**
3. Compară cele 6 strategii → `RSI + MACD` câștigă de obicei
4. Apasă **Analizează cu AI** pentru recomandare personalizată

### Pas 3 — Paper trading (obligatoriu înainte de bani reali)
1. Deschide **🤖 Paper Bot** → setează capital virtual → **START**
2. Lasă botul să ruleze câteva zile
3. Verifică win rate, P&L, deciziile din log
4. Dacă e profitabil consistent → treci la Pas 4

### Pas 4 — Trading real (cu prudență)
1. Asigură-te că ai USDT în **Spot Wallet** Binance (nu Funding)
2. Pornește Python bot cu sumă mică (`--capital 50`)
3. Monitorizează `trades.json` și log-ul zilnic
4. Mărește capitalul treptat după confirmare performanță

---

## ⚠️ Avertismente

- **Nu investi mai mult decât îți permiți să pierzi**
- Piețele crypto sunt volatile — AI-ul poate greși
- Botul tranzacționează 24/7 — verifică-l zilnic
- Testează ÎNTÂI cu suma minimă (~$20–50)
- Activează **IP restriction** pentru cheia Binance
- Nu activa niciodată permisiuni de **Withdrawal** pe cheile API
- Adaugă `bot_config.json` în `.gitignore` dacă folosești Git

---

*Documentație generată: 2026-07-04*  
*Versiune proiect: 1.0.0*
