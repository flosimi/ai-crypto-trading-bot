import { useState, useEffect, useRef, useCallback } from "react";

// ─── Technical Indicators ────────────────────────────────────
function emaArr(prices, period) {
  const k = 2 / (period + 1);
  return prices.reduce((acc, v, i) => {
    acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k));
    return acc;
  }, []);
}
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  const d = prices.slice(1).map((v, i) => v - prices[i]);
  let ag = d.slice(0, period).filter(x => x > 0).reduce((a, b) => a + b, 0) / period;
  let al = Math.abs(d.slice(0, period).filter(x => x < 0).reduce((a, b) => a + b, 0)) / period;
  for (let i = period; i < d.length; i++) {
    ag = (ag * (period - 1) + Math.max(0, d[i])) / period;
    al = (al * (period - 1) + Math.abs(Math.min(0, d[i]))) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}
function calcMACD(prices) {
  if (prices.length < 35) return { macd: 0, signal: 0, hist: 0 };
  const e12 = emaArr(prices, 12), e26 = emaArr(prices, 26);
  const ml = e12.map((v, i) => v - e26[i]);
  const sl = emaArr(ml.slice(-15), 9);
  const m = ml[ml.length - 1], s = sl[sl.length - 1];
  return { macd: m, signal: s, hist: m - s };
}
function calcBoll(prices, period = 20) {
  if (prices.length < period) return { pos: 50, upper: 0, lower: 0 };
  const sl = prices.slice(-period);
  const mean = sl.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(sl.map(v => (v - mean) ** 2).reduce((a, b) => a + b, 0) / period);
  const upper = mean + 2 * std, lower = mean - 2 * std;
  const last = prices[prices.length - 1];
  return { pos: upper === lower ? 50 : Math.max(0, Math.min(100, ((last - lower) / (upper - lower)) * 100)), upper, lower };
}

// ─── Sparkline ───────────────────────────────────────────────
function Spark({ data = [], w = 140, h = 44 }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => [+(i / (data.length - 1) * w).toFixed(1), +(h - (v - mn) / rng * (h - 4) - 2).toFixed(1)]);
  const poly = pts.map(p => p.join(",")).join(" ");
  const area = `${poly} ${w},${h} 0,${h}`;
  const up = data[data.length - 1] >= data[0];
  const col = up ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h} style={{ overflow: "visible", display: "block" }}>
      <polygon points={area} fill={col} fillOpacity="0.08" />
      <polyline points={poly} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Gauge Bar ───────────────────────────────────────────────
function Gauge({ label, value, min = 0, max = 100 }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const col = pct < 30 ? "#ef4444" : pct > 70 ? "#22c55e" : "#f59e0b";
  return (
    <div style={{ marginBottom: "5px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
        <span style={{ color: "#4b5563" }}>{label}</span>
        <span style={{ color: col, fontWeight: 600 }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: "3px", background: "#111827", borderRadius: "2px" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: "2px", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────
function Badge({ action, confidence }) {
  const cfg = { BUY: { col: "#22c55e", bg: "rgba(34,197,94,0.12)" }, SELL: { col: "#ef4444", bg: "rgba(239,68,68,0.12)" }, HOLD: { col: "#f59e0b", bg: "rgba(245,158,11,0.12)" } };
  const { col, bg } = cfg[action] || cfg.HOLD;
  return (
    <span style={{ fontSize: "10px", fontWeight: 600, color: col, background: bg, border: `1px solid ${col}`, padding: "2px 8px", borderRadius: "3px", letterSpacing: "1px" }}>
      {action} {confidence}%
    </span>
  );
}

// ─── Constants ───────────────────────────────────────────────
const FIXED_COINS = {
  BTC: { id: "bitcoin", name: "Bitcoin", color: "#f97316" },
  ETH: { id: "ethereum", name: "Ethereum", color: "#8b5cf6" },
  SOL: { id: "solana", name: "Solana", color: "#06b6d4" },
};
const TREND_COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b"];
const CYCLE_MS = 90000;

// Strategie confirmată prin backtesting (StrategyLab)
const RSI_BUY  = 35;
const RSI_SELL = 65;

// Stop-loss per poziție: dacă prețul scade cu mai mult de 5% față de avg_price → vinde tot
const STOP_LOSS_PCT = -0.05;

// Modele recomandate pentru trading (cu descrieri)
const RECOMMENDED_MODELS = [
  { id: "qwen2.5:7b",        label: "Qwen 2.5 7B",       note: "numerical",  size: "4.7GB", desc: "Cel mai bun pentru trading — cifre precise, JSON corect" },
  { id: "deepseek-r1:7b",    label: "DeepSeek R1 7B",    note: "reasoning",  size: "4.7GB", desc: "Raționament explicit, explică deciziile pas cu pas" },
  { id: "llama3.1:8b",       label: "Llama 3.1 8B",      note: "general",    size: "4.9GB", desc: "Model general Meta, echilibrat și rapid" },
  { id: "mistral:7b",        label: "Mistral 7B",         note: "general",    size: "4.1GB", desc: "Rapid și eficient, bun pentru analiză rapidă" },
  { id: "gemma3:4b",         label: "Gemma 3 4B",        note: "general",    size: "3.3GB", desc: "Google DeepMind, mic și rapid, bun pe GPU mic" },
  { id: "phi4-mini:3.8b",    label: "Phi-4 Mini 3.8B",   note: "numerical",  size: "2.5GB", desc: "Microsoft, cel mai mic și cel mai rapid, bun pe 4GB VRAM" },
];

// Modele Ollama — configurație statică cu num_predict per tip model
const OLLAMA_MODEL_CFG = {
  "deepseek":  { note: "reasoning", numPredict: 600  },
  "qwen":      { note: "numerical", numPredict: 120  },
  "llama":     { note: "general",   numPredict: 150  },
  "gemma":     { note: "general",   numPredict: 150  },
  "mistral":   { note: "general",   numPredict: 150  },
  "phi":       { note: "general",   numPredict: 150  },
  "default":   { note: "general",   numPredict: 150  },
};
function getModelCfg(modelId) {
  const key = Object.keys(OLLAMA_MODEL_CFG).find(k => modelId.toLowerCase().includes(k));
  return OLLAMA_MODEL_CFG[key || "default"];
}

// ─── App ─────────────────────────────────────────────────────
export default function TradingBot() {
  const [initialCash, setInitialCash] = useState(() => {
    const v = parseFloat(localStorage.getItem('pb_initial_cash'));
    return isNaN(v) ? 10000 : v;
  });
  const [inputCash, setInputCash] = useState(() => {
    const v = parseFloat(localStorage.getItem('pb_initial_cash'));
    return isNaN(v) ? 10000 : v;
  });
  const [portfolio, setPortfolio] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pb_portfolio'));
      if (saved) return saved;
    } catch {}
    const ic = parseFloat(localStorage.getItem('pb_initial_cash')) || 10000;
    return { cash: ic, positions: {}, history: [ic] };
  });
  const [prices, setPrices] = useState({});
  const [sparkMap, setSparkMap] = useState({});
  const [signals, setSignals] = useState({});
  const [log, setLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pb_log')) || [] }
    catch { return [] }
  });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Bot oprit. Apasă START pentru a porni analiza AI.");
  const [risk, setRisk] = useState(() => localStorage.getItem('pb_risk') || 'medium');
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('pb_ollama_model') || 'qwen2.5:7b');
  const [countdown, setCountdown] = useState(null);
  const [nextAt, setNextAt] = useState(null);

  const [coins, setCoins] = useState(FIXED_COINS);
  const [trendingMode, setTrendingMode] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [pullStatus, setPullStatus] = useState({});   // { modelId: { pct, status, done, err } }

  const portRef = useRef(portfolio);
  const pricesRef = useRef({});
  const riskRef = useRef("medium");
  const modelRef = useRef("qwen2.5:7b");
  const runRef = useRef(false);
  const cycleRunningRef = useRef(false);  // previne suprapunerea ciclurilor
  const timerRef = useRef(null);
  const logRef = useRef(log);
  const coinsRef = useRef(FIXED_COINS);
  const histCache = useRef({});

  useEffect(() => { portRef.current = portfolio; }, [portfolio]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);
  useEffect(() => { riskRef.current = risk; }, [risk]);
  useEffect(() => { modelRef.current = ollamaModel; }, [ollamaModel]);
  useEffect(() => { logRef.current = log; }, [log]);
  useEffect(() => { coinsRef.current = coins; }, [coins]);

  // Persistență localStorage
  useEffect(() => { localStorage.setItem('pb_portfolio', JSON.stringify(portfolio)) }, [portfolio]);
  useEffect(() => { localStorage.setItem('pb_log', JSON.stringify(log)) }, [log]);
  useEffect(() => { localStorage.setItem('pb_risk', risk) }, [risk]);
  useEffect(() => { localStorage.setItem('pb_ollama_model', ollamaModel) }, [ollamaModel]);

  useEffect(() => {
    const lnk = document.createElement("link");
    lnk.rel = "stylesheet";
    lnk.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Orbitron:wght@600;700&display=swap";
    document.head.appendChild(lnk);
  }, []);

  // Încarcă modelele instalate din Ollama și auto-selectează primul disponibil
  useEffect(() => {
    fetch("http://localhost:11434/api/tags")
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map(m => ({
          id: m.name,
          label: m.name.split(":")[0],
          ...getModelCfg(m.name),
        }));
        setAvailableModels(models);
        if (models.length > 0) {
          const saved = localStorage.getItem('pb_ollama_model');
          const exists = models.find(m => m.id === saved);
          if (!exists) {
            // Modelul salvat nu mai există → auto-selectează primul
            setOllamaModel(models[0].id);
            localStorage.setItem('pb_ollama_model', models[0].id);
            setStatus(`⚠️ Modelul "${saved}" negăsit în Ollama. Selectat automat: ${models[0].id}`);
          }
        }
      })
      .catch(() => {
        setStatus("⚠️ Ollama nu rulează! Pornește Ollama cu: ollama serve");
      });
  }, []);

  // Reîncarcă lista de modele din Ollama
  const refreshModels = () => {
    fetch("http://localhost:11434/api/tags")
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map(m => ({
          id: m.name, label: m.name.split(":")[0], ...getModelCfg(m.name),
        }));
        if (models.length > 0) setAvailableModels(models);
      })
      .catch(() => {});
  };

  // Descarcă un model Ollama cu progres streaming
  const pullModel = async (modelId) => {
    setPullStatus(prev => ({ ...prev, [modelId]: { pct: 0, status: "Se pornește...", done: false, err: null } }));
    try {
      const r = await fetch("http://localhost:11434/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelId, stream: true }),
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const pct = obj.total > 0 ? Math.round(obj.completed / obj.total * 100) : null;
            setPullStatus(prev => ({
              ...prev,
              [modelId]: { pct: pct ?? prev[modelId]?.pct ?? 0, status: obj.status || "", done: false, err: null },
            }));
          } catch {}
        }
      }
      setPullStatus(prev => ({ ...prev, [modelId]: { pct: 100, status: "Instalat!", done: true, err: null } }));
      refreshModels();
    } catch (e) {
      setPullStatus(prev => ({ ...prev, [modelId]: { pct: 0, status: "", done: false, err: e.message } }));
    }
  };

  useEffect(() => {
    const iv = setInterval(() => {
      if (nextAt && runRef.current) setCountdown(Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)));
      else setCountdown(null);
    }, 500);
    return () => clearInterval(iv);
  }, [nextAt]);

  // ── Fetch live prices (cu exponential backoff la rate limit)
  const fetchPrices = async () => {
    const ids = Object.values(coinsRef.current).map(c => c.id).join(",");
    let delay = 5000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
      if (r.status === 429) {
        if (attempt < 2) {
          setStatus(`⏳ Rate limit CoinGecko (prețuri) — aștept ${delay / 1000}s...`);
          await new Promise(res => setTimeout(res, delay));
          delay *= 3;
          continue;
        }
        throw new Error("Rate limit CoinGecko după 3 încercări");
      }
      const d = await r.json();
      const out = {};
      for (const [sym, coin] of Object.entries(coinsRef.current)) {
        if (d[coin.id]) out[sym] = { price: d[coin.id].usd, ch: d[coin.id].usd_24h_change || 0 };
      }
      return out;
    }
  };

  // ── Fetch trending coins from CoinGecko
  const fetchTrendingCoins = useCallback(async () => {
    setStatus("🔥 Obțin top trending coins...");
    const res = await fetch("https://api.coingecko.com/api/v3/search/trending");
    const data = await res.json();
    const newCoins = {};
    data.coins.slice(0, 5).forEach(({ item }, i) => {
      const sym = item.symbol.toUpperCase();
      newCoins[sym] = { id: item.id, name: item.name, color: TREND_COLORS[i] };
    });
    coinsRef.current = newCoins;
    setCoins(newCoins);
    setSignals({});
    setSparkMap({});
    const names = Object.values(newCoins).map(c => c.name).join(", ");
    setStatus(`🔥 Trending activ: ${names}`);
  }, []);

  // ── Toggle trending / fixed mode
  const toggleTrending = useCallback(async () => {
    if (trendingMode) {
      coinsRef.current = FIXED_COINS;
      histCache.current = {};
      setCoins(FIXED_COINS);
      setTrendingMode(false);
      setSignals({});
      setSparkMap({});
      setStatus("Revenit la BTC / ETH / SOL.");
    } else {
      histCache.current = {};
      await fetchTrendingCoins();
      setTrendingMode(true);
    }
  }, [trendingMode, fetchTrendingCoins]);

  // ── Fetch historical closes (cache 15 min pentru a evita rate limit)
  // Folosim hourly în loc de minutely: ~48 puncte vs 1440 — reduce 30× callurile API
  const HIST_CACHE_MS = 15 * 60 * 1000;
  const fetchHist = async (coinId) => {
    const cached = histCache.current[coinId];
    if (cached && Date.now() - cached.at < HIST_CACHE_MS) return cached.data;
    // Exponential backoff: 3 reîncercări cu delay crescător
    let delay = 4000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=2&interval=hourly`);
      if (r.status === 429) {
        if (attempt < 2) {
          setStatus(`⏳ Rate limit CoinGecko — aștept ${delay / 1000}s (${coinId})...`);
          await new Promise(res => setTimeout(res, delay));
          delay *= 3;
          continue;
        }
        throw new Error(`Rate limit CoinGecko după 3 încercări (${coinId})`);
      }
      const d = await r.json();
      const data = (d.prices || []).map(p => p[1]);
      histCache.current[coinId] = { data, at: Date.now() };
      return data;
    }
  };

  // ── Ollama AI decision (folosește strategia confirmată RSI<35 / RSI>65)
  const getDecision = async (sym, ind, price, port) => {
    const pos = port.positions[sym];
    const totalVal = port.cash + Object.entries(port.positions).reduce(
      (s, [k, p]) => s + p.qty * (pricesRef.current[k]?.price || p.avgPrice), 0
    );

    // Context din istoricul tranzacțiilor
    const history = logRef.current;
    const symTrades = history.filter(t => t.sym === sym).slice(-5);
    const closedTrades = history.filter(t => t.pnl !== null);
    const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
    const totalWR = closedTrades.length > 0
      ? Math.round(closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100)
      : null;

    let histCtx = '';
    if (symTrades.length > 0) {
      histCtx += `\nRecent ${sym} trades (newest last):\n`;
      histCtx += symTrades.map(t =>
        `  ${t.action} @$${t.price.toFixed(0)} → ${t.pnl !== null ? (t.pnl >= 0 ? `+$${t.pnl.toFixed(0)} WIN` : `-$${Math.abs(t.pnl).toFixed(0)} LOSS`) : 'open'}`
      ).join('\n');
    }
    if (totalWR !== null) {
      histCtx += `\nOverall bot performance: win rate ${totalWR}% | total P&L ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(0)} out of ${closedTrades.length} closed trades`;
    }

    const rsiState  = ind.rsi < RSI_BUY ? "OVERSOLD" : ind.rsi > RSI_SELL ? "OVERBOUGHT" : "NEUTRAL";
    const macdState = ind.macd.hist > 0 ? "BULLISH" : "BEARISH";

    const prompt = `You are a precise crypto trading bot using RSI+MACD strategy. Reply ONLY with valid JSON.

Market data:
- Asset: ${sym} | Price: $${price.toFixed(2)}
- RSI(14): ${ind.rsi.toFixed(1)} → ${rsiState}
- MACD histogram: ${ind.macd.hist > 0 ? "+" : ""}${ind.macd.hist.toFixed(6)} → ${macdState}
- Bollinger position: ${ind.bb.pos.toFixed(1)}% (0=lower band, 100=upper band)

Portfolio: $${port.cash.toFixed(0)} cash | ${pos ? `${pos.qty.toFixed(5)} ${sym} avg@$${pos.avgPrice.toFixed(0)}` : "no position"} | Total: $${totalVal.toFixed(0)}
Risk level: ${riskRef.current}
${histCtx}

Confirmed strategy (backtested):
- BUY  when: RSI < ${RSI_BUY} AND MACD_hist > 0
- SELL when: RSI > ${RSI_SELL} AND MACD_hist < 0
- HOLD otherwise or when signals conflict
- Never exceed 35% of portfolio in one asset
- Learn from recent trade history: avoid repeating patterns that caused losses

Reply ONLY with valid JSON (no code blocks, no extra text):
{"action":"BUY"|"SELL"|"HOLD","confidence":1-100,"reasoning":"max 65 chars in Romanian"}`;

    // num_predict dinamic per model (DeepSeek R1 are nevoie de mai mulți tokens pt <think>)
    const numPredict = getModelCfg(modelRef.current).numPredict;

    const r = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelRef.current,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.1, num_predict: numPredict },
      }),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => `HTTP ${r.status}`);
      console.error(`[Ollama] HTTP ${r.status}:`, errTxt);
      return { action: "HOLD", confidence: 0, reasoning: `Ollama ${r.status}: ${errTxt.slice(0, 40)}` };
    }

    const d = await r.json();

    // Dacă Ollama returnează eroare (ex: model negăsit)
    if (d.error) {
      console.error("[Ollama] Eroare API:", d.error);
      return { action: "HOLD", confidence: 0, reasoning: `Ollama: ${String(d.error).slice(0, 50)}` };
    }

    // Elimină blocurile <think>...</think> (DeepSeek R1) și code blocks înainte de parsare
    const raw = d.message?.content ?? "";
    if (!raw) {
      console.error("[Ollama] Răspuns fără content:", JSON.stringify(d));
      return { action: "HOLD", confidence: 0, reasoning: "Ollama: răspuns gol" };
    }

    const txt = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")  // strip DeepSeek R1 thinking
      .replace(/```json?|```/g, "")
      .trim();
    try {
      const start = txt.indexOf("{");
      const end   = txt.lastIndexOf("}") + 1;
      if (start === -1 || end === 0) throw new Error("no JSON");
      return JSON.parse(txt.slice(start, end));
    }
    catch {
      console.error("[Ollama] JSON invalid:", txt);
      return { action: "HOLD", confidence: 0, reasoning: "Ollama: JSON invalid" };
    }
  };

  // ── Execute virtual trade (cu indicatori în log pentru Level 1 adaptive)
  const doTrade = useCallback((sym, action, price, confidence, reasoning, ind) => {
    const pcts = { low: 0.08, medium: 0.15, high: 0.25 };
    const pct = pcts[riskRef.current] || 0.15;

    setPortfolio(prev => {
      const np = { ...prev, positions: { ...prev.positions } };
      let rec = null;

      if (action === "BUY" && prev.cash > 1) {
        const spend = Math.min(prev.cash * pct, prev.cash * 0.35);
        const qty = spend / price;
        const ex = np.positions[sym];
        if (ex) {
          const tq = ex.qty + qty;
          np.positions[sym] = { qty: tq, avgPrice: (ex.qty * ex.avgPrice + qty * price) / tq };
        } else {
          np.positions[sym] = { qty, avgPrice: price };
        }
        np.cash = prev.cash - spend;
        rec = {
          id: Date.now(), time: new Date().toLocaleTimeString("ro-RO"),
          sym, action, price, qty, amount: spend, confidence, reasoning, pnl: null,
          indicators: ind ? { rsi: +ind.rsi.toFixed(2), macdHist: +ind.macd.hist.toFixed(6), bbPos: +ind.bb.pos.toFixed(2) } : null,
        };

      } else if (action === "SELL" && prev.positions[sym]) {
        const pos = prev.positions[sym];
        const sellQty = Math.min(pos.qty * pct * 2.5, pos.qty);
        const revenue = sellQty * price;
        const pnl = (price - pos.avgPrice) * sellQty;
        np.cash = prev.cash + revenue;
        const rem = pos.qty - sellQty;
        if (rem < 1e-9) delete np.positions[sym];
        else np.positions[sym] = { ...pos, qty: rem };
        rec = {
          id: Date.now(), time: new Date().toLocaleTimeString("ro-RO"),
          sym, action, price, qty: sellQty, amount: revenue, confidence, reasoning, pnl,
          indicators: ind ? { rsi: +ind.rsi.toFixed(2), macdHist: +ind.macd.hist.toFixed(6), bbPos: +ind.bb.pos.toFixed(2) } : null,
        };

      } else return prev;

      if (rec) setLog(l => [rec, ...l].slice(0, 200));

      const pr = pricesRef.current;
      const tot = np.cash + Object.entries(np.positions).reduce((s, [k, p]) => s + p.qty * (pr[k]?.price || p.avgPrice), 0);
      np.history = [...(prev.history || []), tot].slice(-200);
      return np;
    });
  }, []);

  // ── Bot cycle
  const cycle = useCallback(async () => {
    if (!runRef.current) return;
    // Dacă ciclul anterior încă rulează (5 monede trending + DeepSeek = >90s), sari peste
    if (cycleRunningRef.current) {
      setStatus("⏳ Ciclul anterior încă rulează — sar peste acest tick...");
      return;
    }
    cycleRunningRef.current = true;

    let pd = {};
    try {
      setStatus("📡 Obțin prețuri live...");
      pd = await fetchPrices();
    } catch {
      await new Promise(r => setTimeout(r, 3000));
      try { pd = await fetchPrices(); } catch (e2) {
        setStatus(`⚠️ CoinGecko indisponibil (${e2.message}). Reîncerc în 90s...`);
        if (runRef.current) setNextAt(Date.now() + CYCLE_MS);
        cycleRunningRef.current = false;
        return;
      }
    }

    if (!Object.keys(pd).length) {
      setStatus("⚠️ Prețuri goale — posibil rate limit CoinGecko. Reîncerc în 90s...");
      if (runRef.current) setNextAt(Date.now() + CYCLE_MS);
      cycleRunningRef.current = false;
      return;
    }

    setPrices(pd);
    pricesRef.current = pd;
    setSparkMap(prev => {
      const u = { ...prev };
      for (const [sym, d] of Object.entries(pd)) u[sym] = [...(prev[sym] || []), d.price].slice(-60);
      return u;
    });
    setPortfolio(prev => {
      const tot = prev.cash + Object.entries(prev.positions).reduce((s, [k, p]) => s + p.qty * (pd[k]?.price || p.avgPrice), 0);
      return { ...prev, history: [...(prev.history || []), tot].slice(-200) };
    });

    for (const [sym, coin] of Object.entries(coinsRef.current)) {
      if (!runRef.current) break;
      try {
        setStatus(`📊 Calc indicatori ${sym}...`);
        const hist = await fetchHist(coin.id);
        if (hist.length < 30) { setStatus(`⚠️ ${sym}: date insuficiente, sar peste.`); continue; }

        const ind = { rsi: calcRSI(hist), macd: calcMACD(hist), bb: calcBoll(hist) };
        const currentPrice = pd[sym]?.price || 0;

        // Stop-loss: verifică înainte de decizia AI
        const pos = portRef.current.positions[sym];
        if (pos && currentPrice > 0) {
          const pnlPct = (currentPrice - pos.avgPrice) / pos.avgPrice;
          if (pnlPct <= STOP_LOSS_PCT) {
            setStatus(`🛑 STOP-LOSS ${sym}: ${(pnlPct * 100).toFixed(1)}% → vând tot`);
            doTrade(sym, "SELL", currentPrice, 100, `stop-loss ${(pnlPct * 100).toFixed(1)}%`, ind);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
        }

        setStatus(`🤖 AI (${modelRef.current}) analizează ${sym}...`);
        const dec = await getDecision(sym, ind, currentPrice, portRef.current);
        setSignals(prev => ({ ...prev, [sym]: { ...ind, ...dec, price: pd[sym]?.price } }));

        if (dec.action !== "HOLD" && (dec.confidence || 0) >= 60) {
          setStatus(`⚡ Execut ${dec.action} ${sym} — ${dec.confidence}% confidence`);
          doTrade(sym, dec.action, currentPrice, dec.confidence, dec.reasoning, ind);
        }
      } catch (e) {
        const msg = e.message?.includes("fetch") ? "rețea/rate-limit" : e.message;
        setStatus(`⚠️ ${sym} sărit: ${msg}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (runRef.current) {
      const numCoins = Object.keys(coinsRef.current).length;
      setStatus(`✅ Ciclu finalizat (${numCoins} monede). Următor în 90 secunde...`);
      setNextAt(Date.now() + CYCLE_MS);
    }
    cycleRunningRef.current = false;
  }, [doTrade]);

  const start = useCallback(() => {
    runRef.current = true;
    setRunning(true);
    setStatus("🚀 Bot pornit!");
    localStorage.setItem('pb_autostart', 'true');
    cycle();
    timerRef.current = setInterval(cycle, CYCLE_MS);
  }, [cycle]);

  const stop = useCallback(() => {
    runRef.current = false;
    cycleRunningRef.current = false;
    setRunning(false);
    clearInterval(timerRef.current);
    setNextAt(null);
    setStatus("⏹ Bot oprit.");
    localStorage.setItem('pb_autostart', 'false');
  }, []);

  const resetPortfolio = useCallback((newCash) => {
    const ic = isNaN(newCash) || newCash <= 0 ? 10000 : newCash;
    setInitialCash(ic);
    setInputCash(ic);
    localStorage.setItem('pb_initial_cash', ic);
    const fresh = { cash: ic, positions: {}, history: [ic] };
    setPortfolio(fresh);
    localStorage.setItem('pb_portfolio', JSON.stringify(fresh));
    setLog([]);
    localStorage.setItem('pb_log', '[]');
    setStatus("Portofoliu resetat. Apasă START pentru a porni.");
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // Auto-start dacă botul era pornit la ultima închidere
  useEffect(() => {
    if (localStorage.getItem('pb_autostart') === 'true') start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Metrics
  const totalVal = portfolio.cash + Object.entries(portfolio.positions).reduce(
    (s, [sym, pos]) => s + pos.qty * (prices[sym]?.price || pos.avgPrice), 0
  );
  const pnl = totalVal - initialCash;
  const pnlPct = (pnl / initialCash) * 100;
  const wins = log.filter(t => t.pnl !== null && t.pnl > 0).length;
  const losses = log.filter(t => t.pnl !== null && t.pnl <= 0).length;
  const wr = wins + losses > 0 ? `${Math.round(wins / (wins + losses) * 100)}%` : "—";

  // ── Styles
  const S = {
    wrap: { fontFamily: "'JetBrains Mono', 'Courier New', monospace", background: "#030712", color: "#e2e8f0", minHeight: "100vh", fontSize: "13px" },
    header: { background: "#04091a", borderBottom: "1px solid #0d1f3c", padding: "10px 14px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" },
    statusBar: { background: "#020812", borderBottom: "1px solid #0d1f3c", padding: "3px 14px", fontSize: "10px", color: "#4b5563", letterSpacing: "0.5px" },
    grid: { display: "grid", gridTemplateColumns: "210px 1fr 250px", gap: "9px", padding: "9px", height: "calc(100vh - 80px)", overflow: "hidden" },
    col: { display: "flex", flexDirection: "column", gap: "9px", overflowY: "auto" },
    panel: { background: "#06101f", border: "1px solid #0d1f3c", borderRadius: "5px", padding: "11px" },
    label: { fontSize: "9px", color: "#374151", letterSpacing: "2px", marginBottom: "9px" },
    divider: { borderTop: "1px solid #0d1f3c", marginTop: "8px", paddingTop: "8px" },
  };

  return (
    <div style={S.wrap}>
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#0d1f3c}
        .pulse-dot{animation:blink 1.2s infinite}
        .fade-in{animation:fadeIn 0.3s ease}
      `}</style>

      {/* ── HEADER */}
      <div style={S.header}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "14px", color: "#22d3ee", letterSpacing: "4px", whiteSpace: "nowrap" }}>AI TRADER</div>
        <div style={{ width: 1, height: 28, background: "#0d1f3c", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: "9px", color: "#374151", marginBottom: 1 }}>VALOARE TOTALĂ</div>
          <div style={{ fontSize: "19px", fontWeight: 600 }}>${totalVal.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: "9px", color: "#374151", marginBottom: 1 }}>P&L</div>
          <div style={{ fontSize: "19px", fontWeight: 600, color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} <span style={{ fontSize: "13px" }}>({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {running && <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
          <span style={{ fontSize: "10px", color: running ? "#22c55e" : "#4b5563", letterSpacing: "2px" }}>
            {running ? "● LIVE" : "○ OPRIT"}
          </span>
          {countdown !== null && <span style={{ fontSize: "10px", color: "#374151" }}>| {countdown}s</span>}
        </div>
      </div>

      <div style={S.statusBar}>{status}</div>

      {/* ── MAIN GRID */}
      <div style={S.grid}>

        {/* LEFT */}
        <div style={S.col}>
          {/* Controls */}
          <div style={S.panel}>
            <div style={S.label}>■ CONTROL BOT</div>

            {/* Capital */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: "#374151", marginBottom: "4px", letterSpacing: "1px" }}>CAPITAL INIȚIAL (USDT)</div>
              <input
                type="number"
                disabled={running}
                value={inputCash}
                onChange={e => setInputCash(parseFloat(e.target.value) || '')}
                onBlur={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0 && v !== initialCash) resetPortfolio(v);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0 && v !== initialCash) resetPortfolio(v);
                    e.target.blur();
                  }
                }}
                style={{
                  width: "100%", padding: "6px 8px", background: "#020a17",
                  border: `1px solid ${running ? "#0d1f3c" : "#f59e0b"}`,
                  color: running ? "#4b5563" : "#e2e8f0",
                  borderRadius: "3px", fontSize: "13px", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              {!running && <div style={{ fontSize: "9px", color: "#374151", marginTop: "3px" }}>Tab/Enter pentru reset</div>}
            </div>

            {/* Model AI selector */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: "#374151", marginBottom: "4px", letterSpacing: "1px" }}>MODEL AI (OLLAMA)</div>
              <select
                disabled={running}
                value={ollamaModel}
                onChange={e => setOllamaModel(e.target.value)}
                style={{
                  width: "100%", padding: "6px 8px", background: "#020a17",
                  border: `1px solid ${running ? "#0d1f3c" : "#22d3ee"}`,
                  color: running ? "#4b5563" : "#e2e8f0",
                  borderRadius: "3px", fontSize: "11px", fontFamily: "inherit",
                  boxSizing: "border-box", cursor: running ? "default" : "pointer",
                }}
              >
                {availableModels.length > 0
                  ? availableModels.map(m => (
                      <option key={m.id} value={m.id}>{m.label} ({m.note})</option>
                    ))
                  : <option value={ollamaModel}>{ollamaModel} (verificând...)</option>
                }
              </select>
              {availableModels.length === 0 && (
                <div style={{ fontSize: "9px", color: "#ef4444", marginTop: "3px" }}>
                  ⚠️ Ollama offline sau fără modele
                </div>
              )}
              {/* Buton instalare modele noi */}
              <button
                disabled={running}
                onClick={() => setShowModelPanel(p => !p)}
                style={{
                  width: "100%", marginTop: "5px", padding: "5px", fontSize: "9px",
                  letterSpacing: "1px", borderRadius: "3px", cursor: running ? "default" : "pointer",
                  border: `1px solid ${showModelPanel ? "#a78bfa" : "#0d1f3c"}`,
                  background: showModelPanel ? "rgba(167,139,250,0.12)" : "transparent",
                  color: running ? "#1f2937" : showModelPanel ? "#a78bfa" : "#374151",
                }}
              >
                {showModelPanel ? "▲ ÎNCHIDE" : "⬇ INSTALEAZĂ MODELE NOI"}
              </button>
            </div>

            {/* Panou instalare modele */}
            {showModelPanel && (
              <div style={{ marginBottom: "10px", border: "1px solid #1a2040", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ fontSize: "9px", color: "#374151", letterSpacing: "1px", padding: "6px 8px", background: "#040b1a", borderBottom: "1px solid #0d1f3c" }}>
                  ■ MODELE RECOMANDATE
                </div>
                {RECOMMENDED_MODELS.map(m => {
                  const installed = availableModels.some(a => a.id === m.id);
                  const ps = pullStatus[m.id];
                  const isDownloading = ps && !ps.done && !ps.err;
                  return (
                    <div key={m.id} style={{ padding: "7px 8px", borderBottom: "1px solid #050d1e" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "10px", fontWeight: 600, color: installed ? "#22c55e" : "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {installed ? "✓ " : ""}{m.label}
                            <span style={{ fontSize: "9px", color: "#374151", marginLeft: 4 }}>{m.size}</span>
                          </div>
                          <div style={{ fontSize: "9px", color: "#374151", marginTop: "1px", lineHeight: 1.3 }}>{m.desc}</div>
                        </div>
                        {!installed && !isDownloading && (
                          <button onClick={() => pullModel(m.id)} style={{
                            flexShrink: 0, padding: "3px 7px", fontSize: "9px", letterSpacing: "0.5px",
                            border: "1px solid #22d3ee", background: "rgba(34,211,238,0.08)",
                            color: "#22d3ee", borderRadius: "3px", cursor: "pointer",
                          }}>↓ GET</button>
                        )}
                        {installed && !isDownloading && (
                          <span style={{ fontSize: "9px", color: "#22c55e", flexShrink: 0 }}>OK</span>
                        )}
                        {isDownloading && (
                          <span style={{ fontSize: "9px", color: "#f59e0b", flexShrink: 0 }}>↓ {ps.pct ?? 0}%</span>
                        )}
                      </div>
                      {/* Progress bar */}
                      {ps && !ps.done && !ps.err && (
                        <div style={{ marginTop: "4px" }}>
                          <div style={{ height: "2px", background: "#0d1f3c", borderRadius: "1px" }}>
                            <div style={{ height: "100%", width: `${ps.pct ?? 0}%`, background: "#f59e0b", borderRadius: "1px", transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: "8px", color: "#374151", marginTop: "2px" }}>{ps.status}</div>
                        </div>
                      )}
                      {ps?.done && <div style={{ fontSize: "8px", color: "#22c55e", marginTop: "2px" }}>✓ Instalat cu succes!</div>}
                      {ps?.err && <div style={{ fontSize: "8px", color: "#ef4444", marginTop: "2px" }}>✗ {ps.err}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Start/Stop */}
            <button onClick={running ? stop : start} style={{
              width: "100%", padding: "10px", borderRadius: "4px", cursor: "pointer",
              fontFamily: "'Orbitron', sans-serif", fontSize: "11px", letterSpacing: "2px",
              border: `1px solid ${running ? "#ef4444" : "#22c55e"}`,
              background: running ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
              color: running ? "#ef4444" : "#22c55e", marginBottom: "6px",
              transition: "all 0.2s",
            }}>
              {running ? "⏹ STOP" : "▶ START"}
            </button>

            {/* Trending toggle */}
            <button
              disabled={running}
              onClick={toggleTrending}
              style={{
                width: "100%", padding: "7px", borderRadius: "4px", marginBottom: "10px",
                cursor: running ? "default" : "pointer",
                fontFamily: "'Orbitron', sans-serif", fontSize: "9px", letterSpacing: "2px",
                border: `1px solid ${trendingMode ? "#f97316" : "#0d1f3c"}`,
                background: trendingMode ? "rgba(249,115,22,0.15)" : "transparent",
                color: running ? "#1f2937" : trendingMode ? "#f97316" : "#374151",
                transition: "all 0.2s",
              }}
            >
              {trendingMode ? "🔥 TRENDING ON" : "○ TRENDING OFF"}
            </button>

            {/* Risk */}
            <div style={{ fontSize: "9px", color: "#374151", marginBottom: "5px", letterSpacing: "1px" }}>NIVEL RISC</div>
            <div style={{ display: "flex", gap: "4px" }}>
              {[["low", "MIC"], ["medium", "MED"], ["high", "MARE"]].map(([r, lbl]) => (
                <button key={r} disabled={running} onClick={() => setRisk(r)} style={{
                  flex: 1, padding: "5px 2px", fontSize: "9px", letterSpacing: "1px",
                  border: `1px solid ${risk === r ? "#f59e0b" : "#0d1f3c"}`,
                  background: risk === r ? "rgba(245,158,11,0.12)" : "transparent",
                  color: risk === r ? "#f59e0b" : "#374151",
                  borderRadius: "3px", cursor: running ? "default" : "pointer",
                }}>{lbl}</button>
              ))}
            </div>
            <div style={{ marginTop: "10px", fontSize: "10px", color: "#1f2937", lineHeight: "1.5" }}>
              MIC: 8% / trade<br />MED: 15% / trade<br />MARE: 25% / trade
            </div>

            <div style={{ marginTop: "10px", fontSize: "9px", color: "#1f2937", lineHeight: "1.5", borderTop: "1px solid #0d1f3c", paddingTop: "8px" }}>
              <strong style={{ color: "#374151" }}>Strategie:</strong><br />
              BUY: RSI&lt;{RSI_BUY} + MACD&gt;0<br />
              SELL: RSI&gt;{RSI_SELL} + MACD&lt;0
            </div>
          </div>

          {/* Portfolio */}
          <div style={S.panel}>
            <div style={S.label}>■ PORTOFOLIU</div>
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", color: "#374151" }}>CASH DISPONIBIL</div>
              <div style={{ fontSize: "16px", fontWeight: 600 }}>${portfolio.cash.toFixed(2)}</div>
            </div>
            {Object.entries(portfolio.positions).map(([sym, pos]) => {
              const cur = prices[sym]?.price || pos.avgPrice;
              const val = pos.qty * cur;
              const posP = (cur - pos.avgPrice) * pos.qty;
              return (
                <div key={sym} style={S.divider} className="fade-in">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: coins[sym]?.color || "#e2e8f0", fontWeight: 600 }}>{sym}</span>
                    <span style={{ color: posP >= 0 ? "#22c55e" : "#ef4444", fontSize: "11px", fontWeight: 600 }}>
                      {posP >= 0 ? "+" : ""}{posP.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#4b5563" }}>{pos.qty.toFixed(6)} @ ${pos.avgPrice.toFixed(2)}</div>
                  <div style={{ fontSize: "13px" }}>${val.toFixed(2)}</div>
                </div>
              );
            })}
            {!Object.keys(portfolio.positions).length && (
              <div style={{ fontSize: "11px", color: "#1f2937", textAlign: "center", padding: "10px 0" }}>Nicio poziție activă</div>
            )}
          </div>

          {/* Stats */}
          <div style={S.panel}>
            <div style={S.label}>■ STATISTICI</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {[["TRADES", log.length], ["WIN RATE", wr], ["CÂȘTIG.", wins], ["PIERD.", losses]].map(([l, v]) => (
                <div key={l} style={{ background: "#020a17", border: "1px solid #0d1f3c", borderRadius: "4px", padding: "8px" }}>
                  <div style={{ fontSize: "9px", color: "#1f2937" }}>{l}</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: l === "CÂȘTIG." && wins > 0 ? "#22c55e" : l === "PIERD." && losses > 0 ? "#ef4444" : "#e2e8f0" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Capital evolution mini */}
          <div style={S.panel}>
            <div style={S.label}>■ CAPITAL (start: ${initialCash.toLocaleString()})</div>
            <Spark data={portfolio.history} w={186} h={50} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "4px", color: "#374151" }}>
              <span>Start: ${initialCash.toLocaleString()}</span>
              <span style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>Acum: ${totalVal.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div style={{ ...S.col, minWidth: 0 }}>
          {Object.entries(coins).map(([sym, coin]) => {
            const sig = signals[sym];
            const cur = prices[sym];
            const hist = sparkMap[sym] || [];
            const sparkUp = hist.length >= 2 && hist[hist.length - 1] >= hist[0];

            return (
              <div key={sym} style={{ ...S.panel, borderLeft: `3px solid ${coin.color}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 160px", gap: "12px", alignItems: "start" }}>

                  {/* Info */}
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "14px", color: coin.color }}>{sym}</span>
                      <span style={{ fontSize: "10px", color: "#374151" }}>{coin.name}</span>
                    </div>
                    {cur ? (
                      <>
                        <div style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                          ${cur.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: "11px", color: cur.ch >= 0 ? "#22c55e" : "#ef4444", marginTop: "2px" }}>
                          {cur.ch >= 0 ? "▲" : "▼"} {Math.abs(cur.ch).toFixed(2)}% (24h)
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "13px", color: "#1f2937", marginTop: "4px" }}>Aștept date...</div>
                    )}
                    {sig?.action && (
                      <div style={{ marginTop: "8px" }}>
                        <Badge action={sig.action} confidence={sig.confidence} />
                        {sig.reasoning && (
                          <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "5px", lineHeight: "1.4" }}>{sig.reasoning}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Indicators */}
                  <div style={{ paddingTop: "2px" }}>
                    {sig ? (
                      <>
                        <Gauge label="RSI (14)" value={sig.rsi} />
                        <Gauge label="Bollinger %" value={sig.bb?.pos || 50} />
                        <div style={{ marginTop: "7px", fontSize: "10px", color: "#4b5563" }}>MACD</div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: sig.macd?.hist > 0 ? "#22c55e" : "#ef4444" }}>
                          {sig.macd?.hist > 0 ? "▲ BULLISH" : "▼ BEARISH"}
                        </div>
                        <div style={{ fontSize: "9px", color: "#1f2937", marginTop: "1px" }}>
                          {sig.macd?.hist > 0 ? "+" : ""}{(sig.macd?.hist || 0).toFixed(6)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "11px", color: "#1f2937", paddingTop: "4px" }}>Pornește botul<br />pentru analiză...</div>
                    )}
                  </div>

                  {/* Sparkline */}
                  <div>
                    <Spark data={hist} w={155} h={55} />
                    {hist.length >= 2 && (
                      <div style={{ fontSize: "10px", color: sparkUp ? "#22c55e" : "#ef4444", marginTop: "3px" }}>
                        {sparkUp ? "▲" : "▼"} {Math.abs(((hist[hist.length - 1] - hist[0]) / hist[0]) * 100).toFixed(2)}% în sesiune
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Info Card */}
          <div style={{ ...S.panel, border: "1px solid #1a2d4f" }}>
            <div style={{ fontSize: "9px", color: "#1f2937", letterSpacing: "2px", marginBottom: "6px" }}>■ DESPRE SEMNALE AI</div>
            <div style={{ fontSize: "10px", color: "#374151", lineHeight: "1.6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div><span style={{ color: "#22c55e" }}>RSI &lt; {RSI_BUY}</span> = supravândut → potențial BUY</div>
              <div><span style={{ color: "#ef4444" }}>RSI &gt; {RSI_SELL}</span> = supracumpărat → potențial SELL</div>
              <div><span style={{ color: "#06b6d4" }}>MACD hist</span> = impuls direcțional al trendului</div>
            </div>
          </div>
        </div>

        {/* RIGHT: Trade Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: "9px", overflow: "hidden" }}>
          <div style={{ ...S.panel, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={S.label}>■ LOG TRANZACȚII ({log.length})</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {!log.length ? (
                <div style={{ fontSize: "11px", color: "#1f2937", textAlign: "center", padding: "24px 0", lineHeight: "1.8" }}>
                  Nicio tranzacție.<br />Pornește botul pentru<br />a vedea deciziile AI.
                </div>
              ) : log.map(t => (
                <div key={t.id} className="fade-in" style={{ borderBottom: "1px solid #0a1a30", paddingBottom: "8px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: t.action === "BUY" ? "#22c55e" : "#ef4444", fontWeight: 600, fontSize: "12px" }}>
                      {t.action} {t.sym}
                    </span>
                    <span style={{ fontSize: "9px", color: "#1f2937" }}>{t.time}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                    ${t.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} × {t.qty.toFixed(6)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "2px" }}>
                    <span style={{ color: "#374151" }}>${t.amount.toFixed(2)}</span>
                    {t.pnl !== null && (
                      <span style={{ color: t.pnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                        {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "9px", color: "#1f2937", marginTop: "2px" }}>
                    {t.confidence}% conf · {t.reasoning}
                  </div>
                  {t.indicators && (
                    <div style={{ fontSize: "9px", color: "#374151", marginTop: "2px" }}>
                      RSI:{t.indicators.rsi} · MACD:{t.indicators.macdHist > 0 ? "+" : ""}{t.indicators.macdHist.toFixed(4)} · BB:{t.indicators.bbPos}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Reset (FIX: foloseste initialCash, nu INITIAL_CASH) */}
          <button onClick={() => {
            if (running) stop();
            resetPortfolio(initialCash);
          }} style={{
            padding: "8px", fontSize: "10px", letterSpacing: "1px",
            border: "1px solid #0d1f3c", background: "transparent",
            color: "#374151", borderRadius: "4px", cursor: "pointer",
          }}>
            RESET PORTOFOLIU (${initialCash.toLocaleString()})
          </button>
        </div>
      </div>
    </div>
  );
}