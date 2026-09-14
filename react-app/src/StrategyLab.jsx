import { useState, useCallback, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── Indicatori tehnici (incremental) ────────────────────────
function computeIndicators(prices) {
  const n = prices.length;
  const K12 = 2/13, K26 = 2/27, KS = 2/10;
  const RSI_P = 14, BB_P = 20;

  let e12 = prices[0], e26 = prices[0], signalEma = 0, signalReady = false;
  let avgGain = 0, avgLoss = 0;
  const macdHists = [0];
  const out = [null];

  for (let i = 1; i < n; i++) {
    const delta = prices[i] - prices[i-1];

    // RSI
    if (i < RSI_P) {
      if (delta > 0) avgGain += delta; else avgLoss += Math.abs(delta);
      if (i === RSI_P - 1) { avgGain /= RSI_P; avgLoss /= RSI_P; }
    } else {
      avgGain = (avgGain * (RSI_P-1) + Math.max(0, delta)) / RSI_P;
      avgLoss = (avgLoss * (RSI_P-1) + Math.abs(Math.min(0, delta))) / RSI_P;
    }
    const rsiVal = avgLoss === 0 ? 100 : 100 - 100/(1 + avgGain/avgLoss);

    // MACD
    e12 = prices[i]*K12 + e12*(1-K12);
    e26 = prices[i]*K26 + e26*(1-K26);
    const macdVal = e12 - e26;
    if (!signalReady && i >= 35) { signalEma = macdVal; signalReady = true; }
    else if (signalReady) signalEma = macdVal*KS + signalEma*(1-KS);
    const hist = signalReady ? macdVal - signalEma : 0;
    const prevHist = macdHists[macdHists.length-1];
    macdHists.push(hist);

    // Bollinger
    let bbPos = 50;
    if (i >= BB_P) {
      const sl = prices.slice(i-BB_P+1, i+1);
      const mean = sl.reduce((a,b)=>a+b,0)/BB_P;
      const std = Math.sqrt(sl.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/BB_P);
      const u = mean+2*std, l = mean-2*std;
      bbPos = u===l ? 50 : Math.max(0, Math.min(100, (prices[i]-l)/(u-l)*100));
    }

    out.push({ rsi: rsiVal, macdHist: hist, prevMacdHist: prevHist, bbPos });
  }
  return out;
}

// ─── Engine backtest cu suport pentru comisioane ─────────────
function runBacktest(prices, indicators, strategy, initialCash = 10000, feeRate = 0.001) {
  let cash = initialCash, qty = 0, costBasis = 0;
  let peak = initialCash, maxDD = 0;
  const equity = [initialCash];
  const trades = [];
  const { rsiBuy = 30, rsiSell = 70, mode } = strategy.params;

  for (let i = 35; i < prices.length; i++) {
    const ind = indicators[i];
    if (!ind) { equity.push(cash + qty * prices[i]); continue; }
    const { rsi, macdHist, prevMacdHist, bbPos } = ind;
    const price = prices[i];
    const val = cash + qty * price;
    if (val > peak) peak = val;
    const dd = (peak - val) / peak * 100;
    if (dd > maxDD) maxDD = dd;

    let buySignal = false, sellSignal = false;
    if (mode === "rsi")      { buySignal = rsi < rsiBuy; sellSignal = rsi > rsiSell; }
    if (mode === "rsi_macd") { buySignal = rsi < rsiBuy && macdHist > 0; sellSignal = rsi > rsiSell && macdHist < 0; }
    if (mode === "all")      { buySignal = rsi < rsiBuy && macdHist > 0 && bbPos < 25; sellSignal = rsi > rsiSell && macdHist < 0 && bbPos > 75; }
    if (mode === "macd")     { buySignal = prevMacdHist < 0 && macdHist > 0; sellSignal = prevMacdHist > 0 && macdHist < 0; }
    if (mode === "bb")       { buySignal = bbPos < 20; sellSignal = bbPos > 80; }

    if (qty === 0 && buySignal && cash > 10) {
      // BUY: comisionul scade din cantitatea cumpărată
      const fee = cash * feeRate;
      qty = (cash - fee) / price;
      costBasis = cash;
      cash = 0;
    } else if (qty > 0 && sellSignal) {
      // SELL: comisionul scade din venitul brut
      const grossRevenue = qty * price;
      const fee = grossRevenue * feeRate;
      const netRevenue = grossRevenue - fee;
      const pnl = netRevenue - costBasis;
      const pct = (pnl / costBasis) * 100;
      trades.push({ buy: costBasis / qty, sell: price, pnl, pct });
      cash = netRevenue;
      qty = 0;
      costBasis = 0;
    }
    equity.push(cash + qty * price);
  }

  // Închide poziție deschisă
  if (qty > 0) {
    const last = prices[prices.length - 1];
    const grossRevenue = qty * last;
    const fee = grossRevenue * feeRate;
    const netRevenue = grossRevenue - fee;
    const pnl = netRevenue - costBasis;
    trades.push({ buy: costBasis / qty, sell: last, pnl, pct: (pnl / costBasis) * 100, open: true });
    cash = netRevenue;
    qty = 0;
  }

  const finalVal = cash;
  const totalReturn = (finalVal - initialCash) / initialCash * 100;
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = trades.length ? wins / trades.length * 100 : 0;
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 0;

  // Sharpe anualizat din date orare (24*365 = 8760 ore/an)
  const dailyRet = equity.slice(1).map((v, i) => equity[i] > 0 ? (v - equity[i]) / equity[i] : 0);
  const mr = dailyRet.reduce((a, b) => a + b, 0) / dailyRet.length;
  const sr = Math.sqrt(dailyRet.map(r => (r - mr) ** 2).reduce((a, b) => a + b, 0) / dailyRet.length);
  const sharpe = sr > 0 ? +(mr / sr * Math.sqrt(8760)).toFixed(2) : 0;

  return {
    totalReturn: +totalReturn.toFixed(2),
    winRate: +winRate.toFixed(1),
    maxDD: +maxDD.toFixed(2),
    numTrades: trades.length,
    profitFactor: +profitFactor.toFixed(2),
    sharpe,
    equity,
    finalVal,
    trades,
  };
}

// ─── Configurație strategii ───────────────────────────────────
const STRATEGIES = [
  { id: "rsi_pure",  name: "RSI Pur",       color: "#60a5fa", params: { rsiBuy: 30, rsiSell: 70, mode: "rsi"      }, desc: "Cumpără RSI<30, vinde RSI>70 — mean reversion clasic" },
  { id: "rsi_tight", name: "RSI Strict",    color: "#34d399", params: { rsiBuy: 25, rsiSell: 75, mode: "rsi"      }, desc: "La fel dar cu praguri mai stricte — mai puține trades" },
  { id: "rsi_macd",  name: "RSI + MACD",    color: "#a78bfa", params: { rsiBuy: 35, rsiSell: 65, mode: "rsi_macd" }, desc: "Ambele condiții trebuie îndeplinite — confirmare dublă" },
  { id: "all_three", name: "RSI+MACD+BB",   color: "#fbbf24", params: { rsiBuy: 35, rsiSell: 65, mode: "all"      }, desc: "Toate 3 indicatori — semnale rare dar de calitate înaltă" },
  { id: "macd_only", name: "MACD Crossover",color: "#fb923c", params: { mode: "macd" }, desc: "Intră/iese la crossover MACD — urmărire trend" },
  { id: "bb_only",   name: "Bollinger",     color: "#f472b6", params: { mode: "bb"   }, desc: "Cumpără la lower band, vinde la upper band" },
];

const COINS = [
  { id: "bitcoin",  label: "BTC", name: "Bitcoin"  },
  { id: "ethereum", label: "ETH", name: "Ethereum" },
  { id: "solana",   label: "SOL", name: "Solana"   },
];

const PERIODS = [
  { days: 30, label: "30 zile" },
  { days: 60, label: "60 zile" },
  { days: 90, label: "90 zile" },
];

// Modele Ollama — încărcate dinamic; placeholder până se fetch-uiesc
const OLLAMA_MODELS_PLACEHOLDER = [
  { id: "llama3:8b", label: "Llama 3", note: "general" },
];

// Comisioane Binance Spot (0.1% maker/taker standard)
const BINANCE_FEE_RATE = 0.001;

// ─── Score compozit (0–100) ───────────────────────────────────
function score(r) {
  const retScore = Math.min(100, Math.max(0, r.totalReturn + 30)) / 60 * 40;
  const ddScore  = Math.max(0, (50 - r.maxDD) / 50) * 30;
  const wrScore  = r.winRate / 100 * 20;
  const pfScore  = Math.min(r.profitFactor, 3) / 3 * 10;
  return +(retScore + ddScore + wrScore + pfScore).toFixed(1);
}

// ─── Custom Tooltip ───────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#06101f", border: "1px solid #1e3a5f", padding: "8px 12px", borderRadius: 4, fontSize: 11 }}>
      <div style={{ color: "#4b5563", marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <b>{p.value > 0 ? "+" : ""}{(p.value - 100).toFixed(1)}%</b>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
const TREND_COLORS_SL = ["#60a5fa", "#34d399", "#a78bfa", "#fbbf24", "#fb923c"];

export default function StrategyLab() {
  const [coin, setCoin]         = useState("bitcoin");
  const [period, setPeriod]     = useState(60);
  const [capitalInput, setCapitalInput] = useState(() => Number.parseFloat(localStorage.getItem('sl_capital')) || 10000);
  const [coinList, setCoinList] = useState(COINS);
  const [trendingCoins, setTrendingCoins] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState(null);
  const [chartData, setChartData] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [statusMsg, setStatusMsg]   = useState("");
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('sl_ollama_model') || 'llama3:8b');
  const [availableModels, setAvailableModels] = useState(OLLAMA_MODELS_PLACEHOLDER);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [pullStatus, setPullStatus] = useState({});
  const [includeFees, setIncludeFees] = useState(() => localStorage.getItem('sl_include_fees') !== 'false');

  // Încarcă modelele instalate din Ollama
  useEffect(() => {
    fetch("http://localhost:11434/api/tags")
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map(m => ({
          id: m.name,
          label: m.name.split(":")[0],
          note: m.name.toLowerCase().includes("deepseek") ? "reasoning"
              : m.name.toLowerCase().includes("qwen") ? "numerical"
              : "general",
        }));
        if (models.length > 0) {
          setAvailableModels(models);
          const saved = localStorage.getItem('sl_ollama_model');
          const exists = models.find(m => m.id === saved);
          if (!exists) {
            setOllamaModel(models[0].id);
            localStorage.setItem('sl_ollama_model', models[0].id);
          }
        }
      })
      .catch(() => setStatusMsg("⚠️ Ollama offline — pornește cu: ollama serve"));
  }, []);

  const refreshModels = () => {
    fetch("http://localhost:11434/api/tags")
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map(m => ({
          id: m.name, label: m.name.split(":")[0],
          note: m.name.toLowerCase().includes("deepseek") ? "reasoning"
              : m.name.toLowerCase().includes("qwen") ? "numerical" : "general",
        }));
        if (models.length > 0) setAvailableModels(models);
      })
      .catch(() => {});
  };

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

  const RECOMMENDED_MODELS_SL = [
    { id: "qwen2.5:7b",        label: "Qwen 2.5 7B",       note: "numerical",  size: "4.7GB", desc: "Cel mai bun pentru trading — cifre precise, JSON corect" },
    { id: "deepseek-r1:7b",    label: "DeepSeek R1 7B",    note: "reasoning",  size: "4.7GB", desc: "Raționament explicit, explică deciziile pas cu pas" },
    { id: "llama3.1:8b",       label: "Llama 3.1 8B",      note: "general",    size: "4.9GB", desc: "Model general Meta, echilibrat și rapid" },
    { id: "mistral:7b",        label: "Mistral 7B",         note: "general",    size: "4.1GB", desc: "Rapid și eficient, bun pentru analiză rapidă" },
    { id: "gemma3:4b",         label: "Gemma 3 4B",        note: "general",    size: "3.3GB", desc: "Google DeepMind, mic și rapid" },
    { id: "phi4-mini:3.8b",    label: "Phi-4 Mini 3.8B",   note: "numerical",  size: "2.5GB", desc: "Microsoft, cel mai mic și cel mai rapid" },
  ];

  const fetchTrending = useCallback(async () => {
    setTrendLoading(true);
    setStatusMsg("🔥 Obțin trending coins...");
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/search/trending");
      const data = await res.json();
      const newList = data.coins.slice(0, 5).map(({ item }, i) => ({
        id: item.id, label: item.symbol.toUpperCase(), name: item.name, color: TREND_COLORS_SL[i],
      }));
      setCoinList(newList);
      setCoin(newList[0].id);
      setTrendingCoins(true);
      setStatusMsg(`🔥 Top trending: ${newList.map(c => c.label).join(", ")}`);
    } catch (e) {
      const hint = e.message?.includes("fetch")
        ? "❌ CoinGecko indisponibil — verifică internetul sau încearcă mai târziu (rate limit)."
        : `❌ Eroare: ${e.message}`;
      setStatusMsg(hint);
    }
    setTrendLoading(false);
  }, []);

  const resetToFixed = useCallback(() => {
    setCoinList(COINS);
    setCoin(COINS[0].id);
    setTrendingCoins(false);
    setStatusMsg("");
  }, []);

  const runBacktests = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setAiAnalysis("");
    setChartData([]);
    setStatusMsg("📡 Descarc date istorice...");

    try {
      const coinInfo = coinList.find(c => c.id === coin);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=${period}&interval=hourly`
      );
      const data = await res.json();
      const prices = (data.prices || []).map(p => p[1]);
      const timestamps = (data.prices || []).map(p => p[0]);

      if (prices.length < 50) {
        setStatusMsg("❌ Date insuficiente. Încearcă din nou.");
        setLoading(false);
        return;
      }

      setStatusMsg(`📊 Calculez indicatori pe ${prices.length} lumânări orare...`);
      await new Promise(r => setTimeout(r, 50));
      const indicators = computeIndicators(prices);

      const ic = capitalInput > 0 ? capitalInput : 10000;
      localStorage.setItem('sl_capital', ic);
      localStorage.setItem('sl_include_fees', String(includeFees));

      // Buy & Hold benchmark (cu sau fără fee)
      const fee = includeFees ? BINANCE_FEE_RATE : 0;
      const holdEquity = prices.map(p => ic * (1 - fee) * (p / prices[0]));

      setStatusMsg(`🔬 Rulez backteste pentru 6 strategii (fee: ${(fee * 100).toFixed(2)}%)...`);
      await new Promise(r => setTimeout(r, 50));

      const stratResults = STRATEGIES.map(s => ({
        ...s,
        result: runBacktest(prices, indicators, s, ic, fee),
      }));

      // Compute scores și sortează
      const ranked = stratResults
        .map(s => ({ ...s, score: score(s.result) }))
        .sort((a, b) => b.score - a.score);

      setResults({
        ranked, coinInfo, period,
        priceStart: prices[0], priceEnd: prices[prices.length - 1],
        initialCash: ic, feeRate: fee,
      });

      // Build chart data (normalized la 100 = capital start)
      const norm = ic / 100;
      const step = Math.max(1, Math.floor(prices.length / 200));
      const cd = [];
      for (let i = 0; i < prices.length; i += step) {
        const point = { t: new Date(timestamps[i]).toLocaleDateString("ro-RO", { month: "short", day: "numeric" }) };
        point.hold = +(holdEquity[i] / norm).toFixed(2);
        stratResults.forEach(s => {
          const eq = s.result.equity;
          point[s.id] = +(eq[Math.min(i, eq.length - 1)] / norm).toFixed(2);
        });
        cd.push(point);
      }
      setChartData(cd);
      setStatusMsg(`✅ Backtest finalizat pe ${prices.length} ore${includeFees ? ' (cu comisioane 0.1%)' : ' (fără comisioane)'}.`);

    } catch (e) {
      setStatusMsg(`❌ Eroare: ${e.message}`);
    }
    setLoading(false);
  }, [coin, period, capitalInput, coinList, includeFees]);

  const askAI = useCallback(async () => {
    if (!results) return;
    setAiLoading(true);
    setAiAnalysis("");

    const summary = results.ranked.map(s => (
      `${s.name}: return=${s.result.totalReturn}%, maxDD=${s.result.maxDD}%, winRate=${s.result.winRate}%, trades=${s.result.numTrades}, PF=${s.result.profitFactor}, Sharpe=${s.result.sharpe}, Score=${s.score}`
    )).join("\n");

    const coinChange = ((results.priceEnd - results.priceStart) / results.priceStart * 100).toFixed(1);
    const feeNote = results.feeRate > 0
      ? `\nComisioane incluse: ${(results.feeRate * 100).toFixed(2)}% per trade (Binance Spot standard).`
      : `\nComisioane: NU sunt incluse (rezultate optimiste).`;

    const prompt = `Ești un expert în trading sistematic și backtesting. Analizează rezultatele următoarelor 6 strategii de trading pentru ${results.coinInfo.name} pe o perioadă de ${results.period} zile.

Prețul ${results.coinInfo.label}: a variat ${coinChange > 0 ? "+" : ""}${coinChange}% în această perioadă (buy&hold).${feeNote}

Rezultate backtesting:
${summary}

Analizează:
1. Care strategie recomandezi și DE CE (motivație detaliată)
2. Care strategie este cea mai STABILĂ (risc redus, drawdown mic)
3. Care are cel mai bun raport risc/recompensă
4. Ce riscuri sau limitări are backtestingul (overfitting, date insuficiente)
5. Recomandare concretă pentru un trader cu capital de $${results.initialCash.toLocaleString()} USDT

Răspunde în română, concis dar complet (max 400 cuvinte).`;

    try {
      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: 0.3 },
        }),
      });
      const d = await res.json();
      const raw = d.message?.content || "Eroare: răspuns invalid de la Ollama.";
      // Elimină blocurile <think>...</think> de la DeepSeek R1 — nu sunt relevante pentru utilizator
      const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      setAiAnalysis(cleaned);
    } catch (e) {
      setAiAnalysis(`Eroare: ${e.message}. Asigură-te că Ollama rulează (ollama serve).`);
    }
    setAiLoading(false);
  }, [results, ollamaModel]);

  // ─── Render ───────────────────────────────────────────────
  const S = {
    bg:     "#030712",
    panel:  "#06101f",
    border: "#0d1f3c",
    dimTxt: "#4b5563",
    txt:    "#e2e8f0",
    mono:   "'JetBrains Mono','Courier New',monospace",
  };

  const Panel = ({ children, style }) => (
    <div style={{ background: S.panel, border: `1px solid ${S.border}`, borderRadius: 5, padding: 12, ...style }}>
      {children}
    </div>
  );

  const Label = ({ children }) => (
    <div style={{ fontSize: 9, color: S.dimTxt, letterSpacing: "2px", marginBottom: 8 }}>{children}</div>
  );

  const medal = ["🥇", "🥈", "🥉", "4", "5", "6"];

  return (
    <div style={{ fontFamily: S.mono, background: S.bg, color: S.txt, minHeight: "100vh", fontSize: 13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Orbitron:wght@600&display=swap');
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#0d1f3c}
        .strat-row:hover{background:rgba(255,255,255,0.03)!important}
      `}</style>

      {/* HEADER */}
      <div style={{ background: "#04091a", borderBottom: `1px solid ${S.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "Orbitron,sans-serif", fontSize: 14, color: "#22d3ee", letterSpacing: 4 }}>STRATEGY LAB</div>
        <div style={{ width: 1, height: 28, background: S.border }} />
        <div style={{ fontSize: 11, color: S.dimTxt }}>Backtesting · Simulare Strategii · Analiză AI</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, color: S.dimTxt }}>{statusMsg}</div>
      </div>

      <div style={{ padding: 10 }}>
        {/* CONTROLS */}
        <Panel style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <Label>■ ACTIV {trendingCoins && <span style={{ color: "#f97316" }}>🔥 TRENDING</span>}</Label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {coinList.map(c => (
                <button key={c.id} onClick={() => setCoin(c.id)} style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600, fontFamily: S.mono,
                  border: `1px solid ${coin === c.id ? (c.color || "#22d3ee") : S.border}`,
                  background: coin === c.id ? `${c.color || "#22d3ee"}22` : "transparent",
                  color: coin === c.id ? (c.color || "#22d3ee") : S.dimTxt,
                  borderRadius: 4, cursor: "pointer",
                }}>{c.label}</button>
              ))}
              <button
                onClick={trendingCoins ? resetToFixed : fetchTrending}
                disabled={trendLoading}
                style={{
                  padding: "5px 12px", fontSize: 10, fontFamily: S.mono, letterSpacing: 1,
                  border: `1px solid ${trendingCoins ? "#f97316" : S.border}`,
                  background: trendingCoins ? "rgba(249,115,22,0.15)" : "transparent",
                  color: trendLoading ? S.dimTxt : trendingCoins ? "#f97316" : S.dimTxt,
                  borderRadius: 4, cursor: trendLoading ? "not-allowed" : "pointer",
                }}
              >{trendLoading ? "..." : trendingCoins ? "✕ RESET" : "🔥 TRENDING"}</button>
            </div>
          </div>

          <div>
            <Label>■ PERIOADĂ</Label>
            <div style={{ display: "flex", gap: 6 }}>
              {PERIODS.map(p => (
                <button key={p.days} onClick={() => setPeriod(p.days)} style={{
                  padding: "5px 12px", fontSize: 11, fontFamily: S.mono,
                  border: `1px solid ${period === p.days ? "#a78bfa" : S.border}`,
                  background: period === p.days ? "rgba(167,139,250,0.12)" : "transparent",
                  color: period === p.days ? "#a78bfa" : S.dimTxt,
                  borderRadius: 4, cursor: "pointer",
                }}>{p.label}</button>
              ))}
            </div>
          </div>

          <div>
            <Label>■ CAPITAL SIMULAT (USDT)</Label>
            <input
              type="number"
              min="1"
              value={capitalInput}
              onChange={e => setCapitalInput(Number.parseFloat(e.target.value) || 10000)}
              style={{
                padding: "5px 10px", background: "#020a17", border: `1px solid #0d1f3c`,
                color: "#e2e8f0", borderRadius: 4, fontSize: 13, fontFamily: "inherit", width: 120,
              }}
            />
          </div>

          <div>
            <Label>■ MODEL AI</Label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={ollamaModel}
                onChange={e => { setOllamaModel(e.target.value); localStorage.setItem('sl_ollama_model', e.target.value); }}
                style={{
                  padding: "5px 10px", background: "#020a17", border: `1px solid #22d3ee`,
                  color: "#e2e8f0", borderRadius: 4, fontSize: 11, fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label} ({m.note})</option>
                ))}
              </select>
              <button
                onClick={() => setShowModelPanel(p => !p)}
                style={{
                  padding: "5px 10px", fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap",
                  border: `1px solid ${showModelPanel ? "#a78bfa" : S.border}`,
                  background: showModelPanel ? "rgba(167,139,250,0.12)" : "transparent",
                  color: showModelPanel ? "#a78bfa" : S.dimTxt,
                  borderRadius: 4, cursor: "pointer",
                }}
              >⬇ MODELE</button>
            </div>

            {/* Panou instalare modele */}
            {showModelPanel && (
              <div style={{ marginTop: 8, border: `1px solid #1a2040`, borderRadius: 4, overflow: "hidden", minWidth: 320 }}>
                <div style={{ fontSize: 9, color: S.dimTxt, letterSpacing: 2, padding: "6px 10px", background: "#040b1a", borderBottom: `1px solid ${S.border}` }}>
                  ■ MODELE RECOMANDATE PENTRU TRADING
                </div>
                {RECOMMENDED_MODELS_SL.map(m => {
                  const installed = availableModels.some(a => a.id === m.id);
                  const ps = pullStatus[m.id];
                  const isDownloading = ps && !ps.done && !ps.err;
                  return (
                    <div key={m.id} style={{ padding: "7px 10px", borderBottom: `1px solid #050d1e` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: installed ? "#22c55e" : S.txt }}>
                            {installed ? "✓ " : ""}{m.label}
                          </span>
                          <span style={{ fontSize: 9, color: S.dimTxt, marginLeft: 6 }}>{m.size} · {m.note}</span>
                          <div style={{ fontSize: 9, color: S.dimTxt, marginTop: 1 }}>{m.desc}</div>
                        </div>
                        {!installed && !isDownloading && (
                          <button onClick={() => pullModel(m.id)} style={{
                            padding: "4px 10px", fontSize: 10, flexShrink: 0,
                            border: "1px solid #22d3ee", background: "rgba(34,211,238,0.08)",
                            color: "#22d3ee", borderRadius: 4, cursor: "pointer",
                          }}>↓ GET</button>
                        )}
                        {installed && <span style={{ fontSize: 9, color: "#22c55e", flexShrink: 0 }}>✓ instalat</span>}
                        {isDownloading && <span style={{ fontSize: 9, color: "#f59e0b", flexShrink: 0 }}>↓ {ps.pct ?? 0}%</span>}
                      </div>
                      {ps && !ps.done && !ps.err && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ height: 2, background: S.border, borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${ps.pct ?? 0}%`, background: "#f59e0b", borderRadius: 1, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: 8, color: S.dimTxt, marginTop: 2 }}>{ps.status}</div>
                        </div>
                      )}
                      {ps?.done && <div style={{ fontSize: 8, color: "#22c55e", marginTop: 2 }}>✓ Instalat cu succes!</div>}
                      {ps?.err && <div style={{ fontSize: 8, color: "#ef4444", marginTop: 2 }}>✗ {ps.err}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>■ COMISIOANE</Label>
            <button
              onClick={() => setIncludeFees(!includeFees)}
              style={{
                padding: "5px 12px", fontSize: 11, fontFamily: S.mono, letterSpacing: 1,
                border: `1px solid ${includeFees ? "#22c55e" : S.border}`,
                background: includeFees ? "rgba(34,197,94,0.12)" : "transparent",
                color: includeFees ? "#22c55e" : S.dimTxt,
                borderRadius: 4, cursor: "pointer",
              }}
            >{includeFees ? "✓ 0.1% INCLUSE" : "○ FĂRĂ FEES"}</button>
          </div>

          <div style={{ flex: 1 }} />

          <button onClick={runBacktests} disabled={loading} style={{
            padding: "10px 28px", fontFamily: "Orbitron,sans-serif", fontSize: 12,
            letterSpacing: 2, border: "1px solid #22c55e", background: "rgba(34,197,94,0.12)",
            color: loading ? S.dimTxt : "#22c55e", borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer",
            borderColor: loading ? S.border : "#22c55e",
          }}>
            {loading ? "▶ CALCULEZ..." : "▶ RUN BACKTEST"}
          </button>
        </Panel>

        {/* LEGEND STRATEGIES */}
        {!results && !loading && (
          <Panel>
            <Label>■ STRATEGII TESTATE</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {STRATEGIES.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px", background: "#030a18", borderRadius: 4, border: `1px solid ${S.border}` }}>
                  <div style={{ width: 3, height: 40, background: s.color, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: s.color }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: S.dimTxt, lineHeight: 1.5, marginTop: 2 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: S.dimTxt, lineHeight: 1.7, borderTop: `1px solid ${S.border}`, paddingTop: 10 }}>
              <b style={{ color: "#e2e8f0" }}>Capital simulat:</b> ${capitalInput.toLocaleString()} USDT &nbsp;·&nbsp;
              <b style={{ color: "#e2e8f0" }}>Trade size:</b> 100% in/out per semnal &nbsp;·&nbsp;
              <b style={{ color: "#e2e8f0" }}>Date:</b> CoinGecko (prețuri orare reale) &nbsp;·&nbsp;
              <b style={{ color: includeFees ? "#22c55e" : "#f59e0b" }}>
                Comisioane: {includeFees ? "0.1% per trade (Binance)" : "DEZACTIVATE"}
              </b> &nbsp;·&nbsp;
              <b style={{ color: "#e2e8f0" }}>Slippage:</b> nu este simulat
            </div>
          </Panel>
        )}

        {/* RESULTS */}
        {results && !loading && (
          <>
            {/* Coin info */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {[
                ["ACTIV", `${results.coinInfo.name} (${results.coinInfo.label})`],
                ["PERIOADĂ", `${results.period} zile`],
                ["BUY & HOLD", `${((results.priceEnd - results.priceStart) / results.priceStart * 100).toFixed(1)}%`],
                ["FEES", results.feeRate > 0 ? `${(results.feeRate * 100).toFixed(2)}% / trade` : "fără"],
              ].map(([l, v]) => (
                <Panel key={l} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: S.dimTxt, marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
                </Panel>
              ))}
            </div>

            {/* Main grid: table + chart */}
            <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 10, marginBottom: 10 }}>

              {/* RANKINGS TABLE */}
              <Panel style={{ overflow: "hidden" }}>
                <Label>■ CLASAMENT STRATEGII</Label>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                        {["#", "Strategie", "Return", "MaxDD", "WR%", "Score"].map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: "right", fontSize: 9, color: S.dimTxt, fontWeight: 400, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.ranked.map((s, idx) => {
                        const r = s.result;
                        const isTop = idx === 0;
                        return (
                          <tr key={s.id} className="strat-row" style={{ borderBottom: `1px solid #060f1e`, transition: "background 0.15s" }}>
                            <td style={{ padding: "7px 6px", color: S.dimTxt, fontSize: 12 }}>{medal[idx]}</td>
                            <td style={{ padding: "7px 6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 3, height: 16, background: s.color, borderRadius: 2 }} />
                                <span style={{ color: isTop ? s.color : S.txt, fontWeight: isTop ? 600 : 400 }}>{s.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: "7px 6px", textAlign: "right", color: r.totalReturn >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                              {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn}%
                            </td>
                            <td style={{ padding: "7px 6px", textAlign: "right", color: r.maxDD < 10 ? "#22c55e" : r.maxDD < 25 ? "#f59e0b" : "#ef4444" }}>
                              -{r.maxDD}%
                            </td>
                            <td style={{ padding: "7px 6px", textAlign: "right", color: S.txt }}>
                              {r.winRate > 0 ? r.winRate.toFixed(0) : "—"}%
                            </td>
                            <td style={{ padding: "7px 6px", textAlign: "right" }}>
                              <span style={{
                                background: isTop ? "rgba(34,197,94,0.15)" : "transparent",
                                color: isTop ? "#22c55e" : S.txt,
                                border: isTop ? "1px solid rgba(34,197,94,0.3)" : "none",
                                padding: "2px 6px", borderRadius: 3, fontWeight: isTop ? 600 : 400,
                              }}>{s.score}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Buy & Hold */}
                      <tr style={{ borderTop: `1px solid ${S.border}` }}>
                        <td style={{ padding: "7px 6px", color: S.dimTxt }}>—</td>
                        <td style={{ padding: "7px 6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 3, height: 16, background: "#6b7280", borderRadius: 2 }} />
                            <span style={{ color: S.dimTxt }}>Buy & Hold</span>
                          </div>
                        </td>
                        <td colSpan="4" style={{ padding: "7px 6px", textAlign: "right", color: S.dimTxt }}>
                          {((results.priceEnd - results.priceStart) / results.priceStart * 100).toFixed(1)}% (benchmark)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mini stats for winner */}
                <div style={{ marginTop: 12, padding: 10, background: "#030a18", borderRadius: 4, border: `1px solid ${S.border}` }}>
                  <div style={{ fontSize: 9, color: results.ranked[0].color, letterSpacing: 2, marginBottom: 8 }}>■ DETALII CÂȘTIGĂTOR: {results.ranked[0].name.toUpperCase()}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                    {[
                      ["Profit Factor", results.ranked[0].result.profitFactor],
                      ["Sharpe (anualiz.)", results.ranked[0].result.sharpe],
                      ["Nr. Trades", results.ranked[0].result.numTrades],
                      ["Valoare finală", `$${results.ranked[0].result.finalVal.toFixed(0)}`],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <span style={{ color: S.dimTxt }}>{l}: </span>
                        <span style={{ color: results.ranked[0].color, fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: S.dimTxt }}>{results.ranked[0].desc}</div>
                </div>
              </Panel>

              {/* EQUITY CHART */}
              <Panel>
                <Label>■ CURBE EQUITY — TOATE STRATEGIILE (baza 100 = ${results.initialCash.toLocaleString()})</Label>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d1f3c" />
                    <XAxis dataKey="t" tick={{ fill: "#4b5563", fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line dataKey="hold" name="Buy&Hold" stroke="#6b7280" dot={false} strokeWidth={1} strokeDasharray="4 4" />
                    {STRATEGIES.map(s => (
                      <Line key={s.id} dataKey={s.id} name={s.name} stroke={s.color} dot={false}
                        strokeWidth={results.ranked[0].id === s.id ? 2.5 : 1.2}
                        opacity={results.ranked[0].id === s.id ? 1 : 0.6}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <div style={{ width: 20, height: 2, background: "#6b7280" }} />
                    <span style={{ color: S.dimTxt }}>Buy&Hold</span>
                  </div>
                  {STRATEGIES.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                      <div style={{ width: 20, height: results.ranked[0].id === s.id ? 3 : 2, background: s.color, borderRadius: 2 }} />
                      <span style={{ color: results.ranked[0].id === s.id ? s.color : S.dimTxt, fontWeight: results.ranked[0].id === s.id ? 600 : 400 }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* AI ANALYSIS */}
            <Panel>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Label>■ ANALIZĂ AI ({ollamaModel}) — RECOMANDARE STRATEGIE</Label>
                <button onClick={askAI} disabled={aiLoading} style={{
                  padding: "7px 20px", fontFamily: "Orbitron,sans-serif", fontSize: 11,
                  letterSpacing: 2, border: "1px solid #22d3ee",
                  background: aiLoading ? "transparent" : "rgba(34,211,238,0.1)",
                  color: aiLoading ? S.dimTxt : "#22d3ee",
                  borderColor: aiLoading ? S.border : "#22d3ee",
                  borderRadius: 4, cursor: aiLoading ? "not-allowed" : "pointer",
                }}>
                  {aiLoading ? "🤖 ANALIZEZ..." : "🤖 ANALIZEAZĂ CU AI"}
                </button>
              </div>
              {!aiAnalysis && !aiLoading && (
                <div style={{ fontSize: 11, color: S.dimTxt, textAlign: "center", padding: "20px 0" }}>
                  Apasă butonul pentru ca AI-ul să analizeze rezultatele și să îți recomande cea mai bună strategie pentru situația ta.
                </div>
              )}
              {aiLoading && (
                <div style={{ fontSize: 11, color: S.dimTxt, textAlign: "center", padding: "20px 0" }}>
                  {ollamaModel} analizează toate cele 6 strategii... ⏳
                </div>
              )}
              {aiAnalysis && (
                <div style={{ fontSize: 12, lineHeight: 1.8, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>
                  {aiAnalysis}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}