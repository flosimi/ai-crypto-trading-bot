# Ghid Setup — AI Trading Bot Binance

## PASUL 1: Generează API Keys Binance (5 minute)

1. Loghează-te pe **binance.com**
2. Click pe iconița de profil (dreapta sus) → **"API Management"**
3. Click **"Create API"** → alege **"System generated"**
4. Pune un nume (ex: `ai-trading-bot`) → **Next**
5. Verificare 2FA (email + authenticator)

### ⚠️ Setări critice de securitate:
- ✅ **Enable Reading** — DA
- ✅ **Enable Spot & Margin Trading** — DA
- ❌ **Enable Withdrawals** — NU (niciodată!)
- ❌ **Enable Futures** — NU
- ✅ **Restrict access to trusted IPs only** — DA (adaugă IP-ul tău)
  - Află IP-ul tău la: https://whatismyip.com

6. Copiază **API Key** și **Secret Key** — salveaz-le în Notepad temporar
   (Secret Key se vede o singură dată!)

---

## PASUL 2: Instalează Python și dependențele

### Dacă nu ai Python:
Descarcă de la: https://python.org/downloads (Python 3.10+)
Bifează **"Add Python to PATH"** la instalare!

### Instalează librăriile necesare:
```bash
pip install python-binance anthropic
```

---

## PASUL 3: Configurează botul

Deschide fișierul `ai_trading_bot.py` și editează secțiunea de configurare:

```python
BINANCE_API_KEY    = "cheia_ta_api_de_la_binance"
BINANCE_API_SECRET = "secretul_tau_de_la_binance"
CLAUDE_API_KEY     = "cheia_ta_anthropic"     # de la console.anthropic.com
CAPITAL_USDT       = 400     # câți USDT alocat botului
CYCLE_MINUTES      = 5       # la câte minute analizează
MIN_AI_CONFIDENCE  = 65      # min % confidence pentru execuție
```

### Unde găsești Claude API Key:
1. Mergi la https://console.anthropic.com
2. Settings → API Keys → Create Key
3. Copiaz-o și pune-o în bot

---

## PASUL 4: Rulează botul

```bash
python ai_trading_bot.py
```

Botul va afișa în consolă toate deciziile și tranzacțiile.
Se salvează și în `trades.json` și `bot_YYYYMMDD.log`.

### Pentru a rula non-stop (opțional):
```bash
# Windows — rulează în background:
start /B python ai_trading_bot.py > output.log 2>&1

# Mac/Linux:
nohup python ai_trading_bot.py &
```

---

## Limite de siguranță implementate

| Limită | Valoare |
|--------|---------|
| Max % per asset | 30% din portofoliu |
| Trade size | 15% din cash disponibil |
| Min confidence AI | 65% |
| Limită pierdere zilnică | -8% → bot se oprește |
| Withdrawals API | DEZACTIVAT |

---

## ⚠️ Avertismente importante

- **Nu investi mai mult decât îți permiți să pierzi**
- Botul tranzacționează 24/7 — verifică-l zilnic
- Piețele crypto sunt volatile — AI-ul poate greși
- Testează ÎNTÂI cu suma minimă posibilă (~20-50€)
- Verifică `trades.json` regulat să vezi ce face

---

## Troubleshooting

**Eroare "IP not whitelisted"**: Adaugă IP-ul tău în setările API Binance

**Eroare "insufficient balance"**: Asigură-te că ai USDT în Spot Wallet (nu Funding)

**Eroare "MIN_NOTIONAL"**: Suma e prea mică. Binance cere minim ~10$ per ordin

**Bot nu tranzacționează**: Verifică că AI confidence e ≥65% — semnalele pot fi mixte
