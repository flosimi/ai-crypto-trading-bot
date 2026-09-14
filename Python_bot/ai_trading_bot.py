#!/usr/bin/env python3
"""
AI Trading Bot — Binance Real Trading
Powered by Ollama (local AI) + Technical Analysis (RSI, MACD, Bollinger Bands)

SETUP:
  export BINANCE_API_KEY="cheia_ta"
  export BINANCE_API_SECRET="secretul_tau"
  pip install python-binance
  ollama serve        (rulează în alt terminal)
  ollama pull qwen2.5:7b

RULARE:
  python ai_trading_bot_ollama.py
  python ai_trading_bot_ollama.py --capital 200
  python ai_trading_bot_ollama.py --model qwen2.5:7b
"""

import os
import re
import sys
import time
import json
import math
import logging
import argparse
import urllib.request
import urllib.error
from datetime import datetime, date
from binance.client import Client
from binance.exceptions import BinanceAPIException

# ─── CONFIGURARE ─────────────────────────────────────────────
# Prioritate: bot_config.json > variabile de mediu
# bot_config.json se genereaza din UI (Settings → Descarcă bot_config.json)
# Pune fisierul in acelasi folder cu scriptul.
def _load_config() -> dict:
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot_config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            print(f"[Config] Citit din bot_config.json")
            return cfg
        except Exception as e:
            print(f"[Config] Eroare la citire bot_config.json: {e}")
    return {}

_cfg = _load_config()

BINANCE_API_KEY    = _cfg.get("BINANCE_API_KEY")    or os.getenv("BINANCE_API_KEY",    "")
BINANCE_API_SECRET = _cfg.get("BINANCE_API_SECRET") or os.getenv("BINANCE_API_SECRET", "")
OLLAMA_URL         = (_cfg.get("OLLAMA_URL") or os.getenv("OLLAMA_URL", "http://localhost:11434")).rstrip("/") + "/api/chat"
OLLAMA_MODEL       = "qwen2.5:7b"   # testat pe RTX 3050 Ti 4GB VRAM

SYMBOLS            = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
CAPITAL_USDT       = float(_cfg.get("CAPITAL_USDT", 400))   # Din config sau default 400
CYCLE_MINUTES      = 2              # Frecventa analizei (minute)
MAX_POSITION_PCT   = 0.30           # Max 30% din capital intr-un asset
TRADE_SIZE_PCT     = 0.15           # 15% din cash disponibil per trade
MIN_AI_CONFIDENCE  = 65             # Min confidence AI pentru executie (0-100)
DAILY_LOSS_LIMIT   = -0.08          # Oprire automata la -8% pierdere zilnica
STOP_LOSS_PCT      = -0.05          # Stop-loss per pozitie la -5%

# ─── Strategie confirmata prin backtesting ────────────────────
# BUY  : RSI < 35 AND MACD_hist > 0
# SELL : RSI > 65 AND MACD_hist < 0
RSI_BUY_THRESHOLD  = 35
RSI_SELL_THRESHOLD = 65
# ─────────────────────────────────────────────────────────────


# ─── Logging ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            f"bot_{date.today().strftime('%Y%m%d')}.log", encoding="utf-8"
        ),
    ],
)
log = logging.getLogger("AIBot")


# ─── Indicatori tehnici (pure Python, fara dependente extra) ─
def _ema_array(prices: list, period: int) -> list:
    k = 2.0 / (period + 1)
    result = [prices[0]]
    for p in prices[1:]:
        result.append(p * k + result[-1] * (1 - k))
    return result


def calc_rsi(closes: list, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(0.0, d) for d in deltas]
    losses = [abs(min(0.0, d)) for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))


def calc_macd(closes: list) -> dict:
    if len(closes) < 35:
        return {"macd": 0.0, "signal": 0.0, "hist": 0.0}
    e12 = _ema_array(closes, 12)
    e26 = _ema_array(closes, 26)
    macd_line   = [e12[i] - e26[i] for i in range(len(closes))]
    signal_line = _ema_array(macd_line[-15:], 9)
    m = macd_line[-1]
    s = signal_line[-1]
    return {"macd": m, "signal": s, "hist": m - s}


def calc_bollinger(closes: list, period: int = 20) -> dict:
    if len(closes) < period:
        return {"pos": 50.0, "upper": 0.0, "lower": 0.0}
    sl   = closes[-period:]
    mean = sum(sl) / period
    std  = math.sqrt(sum((v - mean) ** 2 for v in sl) / period)
    upper = mean + 2 * std
    lower = mean - 2 * std
    last  = closes[-1]
    pos   = 50.0 if upper == lower else max(
        0.0, min(100.0, (last - lower) / (upper - lower) * 100)
    )
    return {"pos": pos, "upper": upper, "lower": lower}


# ─── Bot ─────────────────────────────────────────────────────
class AITradingBot:
    def __init__(self):
        log.info("Initializez AI Trading Bot...")
        self._check_api_keys()
        self.binance = Client(BINANCE_API_KEY, BINANCE_API_SECRET)
        self._verify_ollama()
        self.positions: dict             = {}
        self.trade_log: list             = []
        self.daily_start_value: float    = None
        self._lot_cache: dict            = {}   # cache lot_precision + min_notional
        self._verify_connection()
        self._sync_positions()
        self._load_daily_state()

    # ── Validare cheie API ────────────────────────────────────
    def _check_api_keys(self):
        if not BINANCE_API_KEY or not BINANCE_API_SECRET:
            log.error("BINANCE_API_KEY sau BINANCE_API_SECRET lipsesc!")
            log.error("   Seteaza variabilele de mediu inainte de a porni botul.")
            log.error("   Windows: $env:BINANCE_API_KEY='cheia_ta'")
            log.error("   Linux  : export BINANCE_API_KEY=cheia_ta")
            sys.exit(1)

    # ── Conexiune Binance ─────────────────────────────────────
    def _verify_connection(self):
        try:
            info = self.binance.get_account()
            log.info(f"Conexiune Binance OK | Tip cont: {info.get('accountType', 'SPOT')}")
        except BinanceAPIException as e:
            log.error(f"Eroare conectare Binance: {e}")
            log.error("Verifica API Key, Secret si restrictiile de IP.")
            sys.exit(1)

    # ── Sincronizare pozitii existente ────────────────────────
    def _sync_positions(self):
        try:
            account = self.binance.get_account()
            for bal in account["balances"]:
                asset = bal["asset"]
                free  = float(bal["free"])
                sym   = f"{asset}USDT"
                if asset != "USDT" and free > 0 and sym in SYMBOLS:
                    ticker = self.binance.get_symbol_ticker(symbol=sym)
                    price  = float(ticker["price"])
                    self.positions[sym] = {"qty": free, "avg_price": price}
                    log.info(f"  Pozitie gasita: {asset} = {free:.6f} (@${price:,.2f})")
        except Exception as e:
            log.warning(f"Nu am putut sincroniza pozitiile: {e}")

    # ── Balanta si valoare totala ─────────────────────────────
    def get_usdt_balance(self) -> float:
        bal = self.binance.get_asset_balance(asset="USDT")
        return float(bal["free"])

    def get_total_value_usdt(self) -> float:
        total = self.get_usdt_balance()
        for sym, pos in self.positions.items():
            try:
                price = float(self.binance.get_symbol_ticker(symbol=sym)["price"])
            except Exception:
                price = pos["avg_price"]
            total += pos["qty"] * price
        return total

    def get_current_price(self, symbol: str) -> float:
        return float(self.binance.get_symbol_ticker(symbol=symbol)["price"])

    # ── Date istorice ─────────────────────────────────────────
    def get_closes(self, symbol: str, limit: int = 150) -> list:
        klines = self.binance.get_klines(
            symbol=symbol,
            interval=Client.KLINE_INTERVAL_15MINUTE,
            limit=limit,
        )
        return [float(k[4]) for k in klines]

    # ── Persistenta daily_start_value peste restart ───────────
    def _load_daily_state(self):
        """Incarca daily_start_value din fisier daca data e aceeasi."""
        try:
            with open("daily_state.json", "r", encoding="utf-8") as f:
                state = json.load(f)
            if state.get("date") == date.today().isoformat():
                self.daily_start_value = state["start_value"]
                log.info(f"Daily state incarcat: start=${self.daily_start_value:.2f} ({state['date']})")
        except (FileNotFoundError, KeyError, json.JSONDecodeError):
            pass

    def _save_daily_state(self):
        try:
            with open("daily_state.json", "w", encoding="utf-8") as f:
                json.dump({"date": date.today().isoformat(), "start_value": self.daily_start_value}, f)
        except Exception as e:
            log.warning(f"Nu am putut salva daily_state.json: {e}")

    # ── Precizie cantitate LOT_SIZE (cu cache — info nu se schimba) ──
    def get_lot_precision(self, symbol: str) -> tuple:
        if symbol in self._lot_cache:
            return self._lot_cache[symbol]["precision"], self._lot_cache[symbol]["min_qty"]
        info = self.binance.get_symbol_info(symbol)
        precision, min_qty = 5, 0.00001
        min_notional = 10.0
        for f in info["filters"]:
            if f["filterType"] == "LOT_SIZE":
                step    = f["stepSize"]
                min_qty = float(f["minQty"])
                precision = (
                    len(step.rstrip("0").split(".")[-1]) if "." in step else 0
                )
            if f["filterType"] in ("MIN_NOTIONAL", "NOTIONAL"):
                min_notional = float(f.get("minNotional", f.get("notional", 10)))
        self._lot_cache[symbol] = {"precision": precision, "min_qty": min_qty, "min_notional": min_notional}
        return precision, min_qty

    def get_min_notional(self, symbol: str) -> float:
        if symbol not in self._lot_cache:
            self.get_lot_precision(symbol)   # populează cache-ul
        return self._lot_cache[symbol]["min_notional"]

    # ── Verificare Ollama ─────────────────────────────────────
    def _verify_ollama(self):
        try:
            req = urllib.request.Request("http://localhost:11434/api/tags")
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
            models = [m["name"] for m in data.get("models", [])]
            model_base = OLLAMA_MODEL.split(":")[0]
            if not any(model_base in m for m in models):
                log.warning(f"Modelul {OLLAMA_MODEL} nu a fost gasit local.")
                log.warning(f"  Modele disponibile: {models}")
                log.warning(f"  Ruleaza: ollama pull {OLLAMA_MODEL}")
            else:
                log.info(f"Ollama OK | Model: {OLLAMA_MODEL}")
        except Exception as e:
            log.error(f"Ollama nu ruleaza: {e}")
            log.error("Porneste Ollama cu: ollama serve")
            sys.exit(1)

    # ── Decizie AI (Ollama local — qwen2.5:7b) ───────────────
    def get_ai_decision(self, symbol: str, ind: dict, price: float) -> dict:
        pos       = self.positions.get(symbol)
        usdt_bal  = self.get_usdt_balance()
        pos_info  = (
            f"{pos['qty']:.6f} units @ avg ${pos['avg_price']:,.2f}"
            if pos else "no position"
        )

        rsi       = ind["rsi"]
        macd_hist = ind["macd"]["hist"]
        bb_pos    = ind["bb"]["pos"]

        rsi_state  = "OVERSOLD" if rsi < RSI_BUY_THRESHOLD else "OVERBOUGHT" if rsi > RSI_SELL_THRESHOLD else "NEUTRAL"
        macd_state = "BULLISH" if macd_hist > 0 else "BEARISH"

        open_pnl_info = ""
        if pos:
            open_pnl = (price - pos["avg_price"]) / pos["avg_price"] * 100
            open_pnl_info = f"\nOpen position P&L: {open_pnl:+.2f}%"

        prompt = f"""You are a precise crypto trading bot using RSI+MACD strategy. Reply ONLY with a JSON object.

Market data:
- Asset: {symbol} | Price: ${price:,.2f}
- RSI(14): {rsi:.1f} - {rsi_state}
- MACD histogram: {macd_hist:+.6f} - {macd_state}
- Bollinger position: {bb_pos:.1f}% (0=lower band, 100=upper band)
- Cash available: ${usdt_bal:.2f} | Capital limit: ${CAPITAL_USDT:.2f}
- Position: {pos_info}{open_pnl_info}

Confirmed strategy (backtested):
- BUY  when: RSI < {RSI_BUY_THRESHOLD} AND MACD_hist > 0
- SELL when: RSI > {RSI_SELL_THRESHOLD} AND MACD_hist < 0
- HOLD otherwise or when signals conflict

Constraints:
- Never exceed {MAX_POSITION_PCT*100:.0f}% of capital in one asset
- Respect capital limit of ${CAPITAL_USDT:.2f} USDT total

Required JSON (exact keys, no extra text):
{{"action":"HOLD","confidence":50,"reasoning":"motiv scurt in romana max 80 chars"}}"""

        try:
            # DeepSeek R1 are nevoie de mai multi tokens pentru blocul <think> inainte de JSON
            num_predict = 600 if "deepseek" in OLLAMA_MODEL.lower() else 120
            payload = json.dumps({
                "model":    OLLAMA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "stream":   False,
                "options":  {"temperature": 0.1, "num_predict": num_predict},
            }).encode("utf-8")

            req = urllib.request.Request(
                OLLAMA_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=45) as r:
                resp = json.loads(r.read())

            raw = resp["message"]["content"].strip()
            # Elimina blocurile <think>...</think> de la DeepSeek R1
            raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
            start = raw.find("{")
            end   = raw.rfind("}") + 1
            if start == -1 or end == 0:
                raise ValueError("Nu s-a gasit JSON in raspuns")
            result = json.loads(raw[start:end])

            if result.get("action") not in ("BUY", "SELL", "HOLD"):
                result["action"] = "HOLD"
            result["confidence"] = max(0, min(100, int(result.get("confidence", 50))))
            result["reasoning"]  = str(result.get("reasoning", ""))[:80]
            return result

        except json.JSONDecodeError as e:
            log.error(f"JSON invalid de la Ollama: {e}")
            return {"action": "HOLD", "confidence": 0, "reasoning": "Eroare JSON Ollama"}
        except urllib.error.URLError as e:
            log.error(f"Ollama nu raspunde: {e}")
            return {"action": "HOLD", "confidence": 0, "reasoning": "Ollama offline"}
        except Exception as e:
            log.error(f"Eroare Ollama: {e}")
            return {"action": "HOLD", "confidence": 0, "reasoning": "Eroare AI"}

    # ── Stop-loss per pozitie ─────────────────────────────────
    def check_stop_loss(self, symbol: str, price: float) -> bool:
        """Returneaza True daca stop-loss-ul a fost atins si pozitia a fost lichidata."""
        pos = self.positions.get(symbol)
        if not pos:
            return False
        pnl_pct = (price - pos["avg_price"]) / pos["avg_price"]
        if pnl_pct <= STOP_LOSS_PCT:
            log.warning(
                f"STOP-LOSS {symbol}: {pnl_pct*100:.2f}% "
                f"(avg ${pos['avg_price']:,.2f} -> acum ${price:,.2f})"
            )
            self.execute_sell(
                symbol, price,
                confidence=100,
                reasoning=f"stop-loss {pnl_pct*100:.1f}%",
                force_all=True,
            )
            return True
        return False

    # ── Executie BUY ──────────────────────────────────────────
    def execute_buy(self, symbol: str, price: float, confidence: int,
                    reasoning: str, ind: dict):
        usdt_bal  = self.get_usdt_balance()
        total_val = self.get_total_value_usdt()
        pos       = self.positions.get(symbol)

        # Respecta limita de capital alocat
        capital_used = total_val - usdt_bal
        if capital_used >= CAPITAL_USDT:
            log.info(f"SKIP BUY {symbol}: capital limit ${CAPITAL_USDT} atins")
            return

        # Respecta limita de concentrare per asset
        if pos:
            pos_pct = (pos["qty"] * price) / CAPITAL_USDT
            if pos_pct >= MAX_POSITION_PCT:
                log.info(
                    f"SKIP BUY {symbol}: pozitie la {pos_pct*100:.1f}% "
                    f"(max {MAX_POSITION_PCT*100:.0f}%)"
                )
                return

        spend_usdt   = min(
            usdt_bal * TRADE_SIZE_PCT,
            CAPITAL_USDT * MAX_POSITION_PCT,
        )
        min_notional = self.get_min_notional(symbol)

        if spend_usdt < min_notional:
            log.warning(f"SKIP BUY {symbol}: ${spend_usdt:.2f} < minim ${min_notional:.2f}")
            return

        precision, min_qty = self.get_lot_precision(symbol)
        qty = round(spend_usdt / price, precision)

        if qty < min_qty:
            log.warning(f"SKIP BUY {symbol}: cantitate {qty} < minim {min_qty}")
            return

        try:
            order      = self.binance.order_market_buy(symbol=symbol, quantity=qty)
            fill_price = float(order["fills"][0]["price"]) if order.get("fills") else price
            fill_qty   = float(order["executedQty"])
            cost       = fill_qty * fill_price

            if symbol in self.positions:
                ex      = self.positions[symbol]
                tot_qty = ex["qty"] + fill_qty
                self.positions[symbol] = {
                    "qty":       tot_qty,
                    "avg_price": (ex["qty"] * ex["avg_price"] + fill_qty * fill_price) / tot_qty,
                }
            else:
                self.positions[symbol] = {"qty": fill_qty, "avg_price": fill_price}

            log.info(
                f"BUY  {symbol}: {fill_qty:.6f} @ ${fill_price:,.4f} "
                f"= ${cost:.2f} | {confidence}% | {reasoning}"
            )
            self._record_trade("BUY", symbol, fill_qty, fill_price, confidence, reasoning, ind=ind)

        except BinanceAPIException as e:
            log.error(f"EROARE BUY {symbol}: {e}")

    # ── Executie SELL ─────────────────────────────────────────
    def execute_sell(self, symbol: str, price: float, confidence: int,
                     reasoning: str, ind: dict = None, force_all: bool = False):
        pos = self.positions.get(symbol)
        if not pos or pos["qty"] <= 0:
            log.info(f"SKIP SELL {symbol}: nicio pozitie")
            return

        precision, min_qty = self.get_lot_precision(symbol)

        if force_all:
            sell_qty = round(pos["qty"], precision)
        else:
            sell_pct = min(TRADE_SIZE_PCT * 2.5, 1.0)
            sell_qty = round(pos["qty"] * sell_pct, precision)
            remainder = round(pos["qty"] - sell_qty, precision)
            if remainder < min_qty:
                sell_qty = round(pos["qty"], precision)

        if sell_qty < min_qty:
            log.warning(f"SKIP SELL {symbol}: cantitate prea mica ({sell_qty} < {min_qty})")
            return

        try:
            order      = self.binance.order_market_sell(symbol=symbol, quantity=sell_qty)
            fill_price = float(order["fills"][0]["price"]) if order.get("fills") else price
            fill_qty   = float(order["executedQty"])
            pnl        = (fill_price - pos["avg_price"]) * fill_qty

            new_qty = round(pos["qty"] - fill_qty, precision)
            if new_qty < min_qty:
                del self.positions[symbol]
            else:
                self.positions[symbol] = {**pos, "qty": new_qty}

            emoji = "+" if pnl >= 0 else "-"
            log.info(
                f"SELL {symbol}: {fill_qty:.6f} @ ${fill_price:,.4f} "
                f"| PnL: {'+' if pnl >= 0 else ''}{pnl:.2f}$ | {confidence}% | {reasoning}"
            )
            self._record_trade(
                "SELL", symbol, fill_qty, fill_price, confidence, reasoning, pnl=pnl, ind=ind
            )

        except BinanceAPIException as e:
            log.error(f"EROARE SELL {symbol}: {e}")

    # ── Inregistrare tranzactie cu indicatori ─────────────────
    def _record_trade(self, action, symbol, qty, price, confidence,
                      reasoning, pnl=None, ind: dict = None):
        record = {
            "timestamp":  datetime.now().isoformat(),
            "action":     action,
            "symbol":     symbol,
            "qty":        qty,
            "price":      price,
            "value_usdt": round(qty * price, 4),
            "confidence": confidence,
            "reasoning":  reasoning,
            "pnl_usdt":   round(pnl, 4) if pnl is not None else None,
            # Indicatori — necesari pentru Level 1 adaptive thresholds
            "indicators": {
                "rsi":       round(ind["rsi"], 2)           if ind else None,
                "macd_hist": round(ind["macd"]["hist"], 6)  if ind else None,
                "bb_pos":    round(ind["bb"]["pos"], 2)     if ind else None,
            },
        }
        self.trade_log.append(record)
        try:
            with open("trades.json", "w", encoding="utf-8") as f:
                json.dump(self.trade_log, f, indent=2, ensure_ascii=False)
        except Exception as e:
            log.warning(f"Nu am putut salva trades.json: {e}")

    # ── Safety: daily loss limit ──────────────────────────────
    def check_daily_loss_limit(self) -> bool:
        current = self.get_total_value_usdt()
        if self.daily_start_value is None:
            self.daily_start_value = current
            log.info(f"Valoare start zi: ${current:.2f}")
            self._save_daily_state()
            return True
        pnl_pct = (current - self.daily_start_value) / self.daily_start_value
        if pnl_pct <= DAILY_LOSS_LIMIT:
            log.error(f"LIMITA PIERDERE ZILNICA ATINSA: {pnl_pct*100:.2f}%")
            log.error(f"  Start zi: ${self.daily_start_value:.2f} | Acum: ${current:.2f}")
            log.error("  Botul se opreste pentru a preveni pierderi suplimentare.")
            return False
        return True

    # ── Ciclu principal ───────────────────────────────────────
    def run_cycle(self):
        log.info("-" * 70)
        total = self.get_total_value_usdt()
        usdt  = self.get_usdt_balance()
        log.info(
            f"Ciclu | Total: ${total:.2f} | "
            f"Cash USDT: ${usdt:.2f} | Capital limit: ${CAPITAL_USDT:.2f}"
        )

        if not self.check_daily_loss_limit():
            sys.exit(0)

        for symbol in SYMBOLS:
            try:
                closes = self.get_closes(symbol)
                if len(closes) < 35:
                    log.warning(f"{symbol}: date insuficiente ({len(closes)} inchideri)")
                    continue

                price = closes[-1]
                ind   = {
                    "rsi":  calc_rsi(closes),
                    "macd": calc_macd(closes),
                    "bb":   calc_bollinger(closes),
                }

                log.info(
                    f"{symbol} | ${price:,.2f} | "
                    f"RSI: {ind['rsi']:.1f} | "
                    f"MACD: {'+' if ind['macd']['hist'] > 0 else ''}{ind['macd']['hist']:.6f} | "
                    f"BB: {ind['bb']['pos']:.1f}%"
                )

                # Verifica stop-loss inainte de decizia AI
                if self.check_stop_loss(symbol, price):
                    log.info(f"  Stop-loss executat pentru {symbol}, sar la urmator.")
                    time.sleep(2)
                    continue

                decision = self.get_ai_decision(symbol, ind, price)
                action   = decision.get("action", "HOLD")
                conf     = decision.get("confidence", 0)
                reason   = decision.get("reasoning", "")

                log.info(f"  AI: {action} ({conf}%) - {reason}")

                if conf >= MIN_AI_CONFIDENCE:
                    if action == "BUY":
                        self.execute_buy(symbol, price, conf, reason, ind=ind)
                    elif action == "SELL":
                        self.execute_sell(symbol, price, conf, reason, ind=ind)
                else:
                    log.info(f"  SKIP: confidence {conf}% < minim {MIN_AI_CONFIDENCE}%")

                time.sleep(2)

            except BinanceAPIException as e:
                log.error(f"Binance API error pentru {symbol}: {e}")
            except Exception as e:
                log.error(f"Eroare neasteptata pentru {symbol}: {e}", exc_info=True)

        log.info(f"Ciclu finalizat. Urmator in {CYCLE_MINUTES} minute.")

    # ── Entry point ───────────────────────────────────────────
    def run(self):
        log.info("=" * 70)
        log.info("       AI TRADING BOT - BINANCE SPOT - REAL MONEY")
        log.info("=" * 70)
        log.info(f"  Model AI       : {OLLAMA_MODEL}")
        log.info(f"  Capital alocat : ${CAPITAL_USDT} USDT")
        log.info(f"  Simboluri      : {', '.join(SYMBOLS)}")
        log.info(f"  Ciclu          : {CYCLE_MINUTES} minute")
        log.info(f"  Min confidence : {MIN_AI_CONFIDENCE}%")
        log.info(f"  Max pos/asset  : {MAX_POSITION_PCT*100:.0f}%")
        log.info(f"  Stop-loss/pos  : {STOP_LOSS_PCT*100:.0f}%")
        log.info(f"  Stop zilnic    : {DAILY_LOSS_LIMIT*100:.0f}%")
        log.info(f"  Strategie      : RSI<{RSI_BUY_THRESHOLD}+MACD>0 -> BUY | RSI>{RSI_SELL_THRESHOLD}+MACD<0 -> SELL")
        log.info("=" * 70)
        log.info("Apasa Ctrl+C pentru a opri botul.")

        try:
            while True:
                cycle_start = time.time()
                self.run_cycle()
                elapsed = time.time() - cycle_start
                wait = max(0, CYCLE_MINUTES * 60 - elapsed)
                if wait > 0:
                    time.sleep(wait)
        except KeyboardInterrupt:
            log.info("Bot oprit manual (Ctrl+C).")
            final = self.get_total_value_usdt()
            log.info(f"Valoare finala portofoliu: ${final:.2f} USDT")
            if self.trade_log:
                sells = [
                    t for t in self.trade_log
                    if t["action"] == "SELL" and t["pnl_usdt"] is not None
                ]
                if sells:
                    total_pnl    = sum(t["pnl_usdt"] for t in sells)
                    wins         = len([t for t in sells if t["pnl_usdt"] > 0])
                    total_trades = len(sells)
                    log.info(
                        f"Total tranzactii: {len(self.trade_log)} | "
                        f"PnL realizat: ${total_pnl:+.2f} | "
                        f"Win rate: {wins}/{total_trades}"
                    )
            log.info("La revedere!")


# ─── Selectare capital interactiv ────────────────────────────
def prompt_capital(default: float, available_usdt: float = None) -> float:
    """Cere utilizatorului sa selecteze capitalul cu validare."""
    print()
    print("=" * 70)
    print("       SELECTEAZA CAPITALUL DE TRADING")
    print("=" * 70)
    if available_usdt is not None:
        print(f"  Balance disponibil in cont : ${available_usdt:,.2f} USDT")
    print(f"  Valoare implicita          : ${default:,.2f} USDT")
    print(f"  Minim acceptat             : $20.00 USDT")
    if available_usdt is not None:
        print(f"  Maxim acceptat             : ${available_usdt:,.2f} USDT")
    print("-" * 70)

    while True:
        try:
            val = input(f"  Introdu suma in USDT [Enter pentru ${default:,.2f}]: ").strip()
        except EOFError:
            return default

        if not val:
            return default

        try:
            amount = float(val.replace(",", "."))
        except ValueError:
            print(f"  >> Valoare invalida: '{val}'. Incearca din nou.")
            continue

        if amount < 20:
            print(f"  >> Suma prea mica (${amount:.2f}). Minim $20.")
            continue

        if available_usdt is not None and amount > available_usdt:
            print(f"  >> Suma ${amount:.2f} > balance disponibil ${available_usdt:.2f}.")
            confirm = input("     Continui oricum? (y/N): ").strip().lower()
            if confirm != "y":
                continue

        print(f"  >> Capital setat: ${amount:,.2f} USDT")
        print("=" * 70)
        return amount


# ─── Main ────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Trading Bot - Binance + Ollama")
    parser.add_argument(
        "--capital", type=float, default=None,
        help="Capitalul maxim alocat in USDT (ex: --capital 200) - omite promptul interactiv"
    )
    parser.add_argument(
        "--model", type=str, default=None,
        help=f"Modelul Ollama de folosit (default: {OLLAMA_MODEL})"
    )
    args = parser.parse_args()

    if args.model:
        OLLAMA_MODEL = args.model

    # Verifica API keys + conexiune Binance INAINTE de a alege capitalul
    # ca sa putem afisa balance-ul real al utilizatorului ca referinta
    if not BINANCE_API_KEY or not BINANCE_API_SECRET:
        print("EROARE: BINANCE_API_KEY sau BINANCE_API_SECRET lipsesc!")
        print("  Windows: $env:BINANCE_API_KEY='cheia_ta'")
        print("  Linux  : export BINANCE_API_KEY=cheia_ta")
        sys.exit(1)

    available_balance = None
    try:
        temp_client = Client(BINANCE_API_KEY, BINANCE_API_SECRET)
        bal = temp_client.get_asset_balance(asset="USDT")
        available_balance = float(bal["free"])
    except Exception as e:
        print(f"AVERTISMENT: Nu am putut citi balance-ul Binance ({e}).")
        print("  Continui fara afisare balance, verifica conexiunea.")

    if args.capital is not None:
        if args.capital < 20:
            print(f"EROARE: --capital ${args.capital} < minim $20")
            sys.exit(1)
        CAPITAL_USDT = args.capital
    else:
        CAPITAL_USDT = prompt_capital(CAPITAL_USDT, available_balance)

    bot = AITradingBot()
    bot.run()