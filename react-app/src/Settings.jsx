import { useState, useEffect } from "react";

const S = {
  bg:     "#030712",
  panel:  "#06101f",
  border: "#0d1f3c",
  dim:    "#4b5563",
  txt:    "#e2e8f0",
  mono:   "'JetBrains Mono','Courier New',monospace",
};

function Panel({ children, style }) {
  return (
    <div style={{ background: S.panel, border: `1px solid ${S.border}`, borderRadius: 5, padding: 16, ...style }}>
      {children}
    </div>
  );
}
function Label({ children }) {
  return <div style={{ fontSize: 9, color: S.dim, letterSpacing: "2px", marginBottom: 10 }}>{children}</div>;
}
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button onClick={copy} style={{
      padding: "2px 8px", fontSize: 9, cursor: "pointer", borderRadius: 3,
      border: `1px solid ${copied ? "#22c55e" : S.border}`,
      background: copied ? "rgba(34,197,94,0.1)" : "transparent",
      color: copied ? "#22c55e" : S.dim, transition: "all 0.2s",
    }}>{copied ? "✓ Copiat!" : "⎘ Copiază"}</button>
  );
}

export default function Settings() {
  const [apiKey,    setApiKey]    = useState(() => localStorage.getItem("cfg_binance_api_key")    || "");
  const [apiSecret, setApiSecret] = useState(() => localStorage.getItem("cfg_binance_api_secret") || "");
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem("cfg_ollama_url")         || "http://localhost:11434");
  const [capital,   setCapital]   = useState(() => localStorage.getItem("cfg_capital")             || "400");

  const [showKey,    setShowKey]    = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null); // null | "ok" | "err"

  // Testează conexiunea Ollama
  const testOllama = () => {
    setOllamaStatus(null);
    fetch(`${ollamaUrl}/api/tags`)
      .then(r => r.json())
      .then(d => setOllamaStatus(d.models ? "ok" : "err"))
      .catch(() => setOllamaStatus("err"));
  };

  const save = () => {
    localStorage.setItem("cfg_binance_api_key",    apiKey.trim());
    localStorage.setItem("cfg_binance_api_secret", apiSecret.trim());
    localStorage.setItem("cfg_ollama_url",         ollamaUrl.trim());
    localStorage.setItem("cfg_capital",            capital);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Generează bot_config.json și descarcă
  const downloadConfig = () => {
    const cfg = {
      BINANCE_API_KEY:    apiKey.trim(),
      BINANCE_API_SECRET: apiSecret.trim(),
      OLLAMA_URL:         ollamaUrl.trim(),
      CAPITAL_USDT:       parseFloat(capital) || 400,
    };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bot_config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const masked = (v) => v ? v.slice(0, 4) + "•".repeat(Math.max(0, v.length - 8)) + v.slice(-4) : "";

  const cmdPS  = `$env:BINANCE_API_KEY="${apiKey}"; $env:BINANCE_API_SECRET="${apiSecret}"; python ai_trading_bot.py --capital ${capital}`;
  const cmdCMD = `set BINANCE_API_KEY=${apiKey} && set BINANCE_API_SECRET=${apiSecret} && python ai_trading_bot.py --capital ${capital}`;
  const cmdLin = `BINANCE_API_KEY="${apiKey}" BINANCE_API_SECRET="${apiSecret}" python ai_trading_bot.py --capital ${capital}`;

  const inputStyle = (show) => ({
    width: "100%", padding: "8px 10px", background: "#020a17",
    border: `1px solid #1a3060`, color: show ? "#22d3ee" : S.txt,
    borderRadius: 4, fontSize: show ? 12 : 13, fontFamily: S.mono,
    boxSizing: "border-box", outline: "none", letterSpacing: show ? "0.5px" : "2px",
  });

  return (
    <div style={{ fontFamily: S.mono, background: S.bg, color: S.txt, minHeight: "100vh", fontSize: 13 }}>
      {/* HEADER */}
      <div style={{ background: "#04091a", borderBottom: `1px solid ${S.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: "Orbitron,sans-serif", fontSize: 14, color: "#22d3ee", letterSpacing: 4 }}>SETTINGS</div>
        <div style={{ width: 1, height: 28, background: S.border }} />
        <div style={{ fontSize: 11, color: S.dim }}>Configurare API Keys · Ollama · Capital</div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── BINANCE API ── */}
        <Panel>
          <Label>■ BINANCE API KEYS</Label>
          <div style={{ fontSize: 10, color: S.dim, marginBottom: 12, lineHeight: 1.7 }}>
            Obții cheile din{" "}
            <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noreferrer"
              style={{ color: "#f59e0b" }}>Binance → API Management</a>.{" "}
            Activează <b style={{ color: S.txt }}>Enable Reading</b> și <b style={{ color: S.txt }}>Enable Spot & Margin Trading</b>.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            {/* API Key */}
            <div>
              <div style={{ fontSize: 10, color: S.dim, marginBottom: 5 }}>API KEY</div>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Introdu API Key Binance..."
                  style={inputStyle(showKey)}
                />
                <button onClick={() => setShowKey(p => !p)} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 12,
                }}>{showKey ? "🙈" : "👁"}</button>
              </div>
            </div>

            {/* API Secret */}
            <div>
              <div style={{ fontSize: 10, color: S.dim, marginBottom: 5 }}>API SECRET</div>
              <div style={{ position: "relative" }}>
                <input
                  type={showSecret ? "text" : "password"}
                  value={apiSecret}
                  onChange={e => setApiSecret(e.target.value)}
                  placeholder="Introdu API Secret Binance..."
                  style={inputStyle(showSecret)}
                />
                <button onClick={() => setShowSecret(p => !p)} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: S.dim, cursor: "pointer", fontSize: 12,
                }}>{showSecret ? "🙈" : "👁"}</button>
              </div>
            </div>
          </div>

          {/* Capital */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: S.dim, marginBottom: 5 }}>CAPITAL ALOCAT (USDT) — pentru Python bot</div>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(e.target.value)}
              min="20"
              style={{ ...inputStyle(true), width: 160 }}
            />
          </div>

          {/* Status chei */}
          {(apiKey || apiSecret) && (
            <div style={{ fontSize: 10, color: S.dim, background: "#020a17", borderRadius: 4, padding: "8px 12px", marginBottom: 14, border: `1px solid ${S.border}` }}>
              <div style={{ marginBottom: 3 }}>
                API Key: <span style={{ color: apiKey ? "#22c55e" : "#ef4444" }}>{apiKey ? masked(apiKey) : "— lipsă"}</span>
              </div>
              <div>
                Secret: <span style={{ color: apiSecret ? "#22c55e" : "#ef4444" }}>{apiSecret ? masked(apiSecret) : "— lipsă"}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{
              padding: "9px 24px", fontFamily: "Orbitron,sans-serif", fontSize: 11, letterSpacing: 2,
              border: `1px solid ${saved ? "#22c55e" : "#22d3ee"}`,
              background: saved ? "rgba(34,197,94,0.12)" : "rgba(34,211,238,0.1)",
              color: saved ? "#22c55e" : "#22d3ee", borderRadius: 4, cursor: "pointer",
            }}>{saved ? "✓ SALVAT!" : "💾 SALVEAZĂ"}</button>

            <button onClick={downloadConfig} disabled={!apiKey || !apiSecret} style={{
              padding: "9px 20px", fontSize: 11, letterSpacing: 1,
              border: `1px solid ${apiKey && apiSecret ? "#f59e0b" : S.border}`,
              background: "transparent",
              color: apiKey && apiSecret ? "#f59e0b" : S.dim,
              borderRadius: 4, cursor: apiKey && apiSecret ? "pointer" : "default",
            }}>⬇ DESCARCĂ bot_config.json</button>
          </div>

          {(!apiKey || !apiSecret) && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 8 }}>
              ⚠️ Completează ambele câmpuri pentru a genera config-ul.
            </div>
          )}
        </Panel>

        {/* ── COMENZI TERMINAL ── */}
        {apiKey && apiSecret && (
          <Panel>
            <Label>■ COMENZI PORNIRE PYTHON BOT</Label>
            <div style={{ fontSize: 10, color: S.dim, marginBottom: 12 }}>
              Copiază comanda potrivită sistemului tău și rulează în folderul <code style={{ color: "#22d3ee" }}>Python_bot/</code>
            </div>

            {[
              { label: "Windows PowerShell", cmd: cmdPS,  color: "#22d3ee" },
              { label: "Windows CMD",        cmd: cmdCMD, color: "#f59e0b" },
              { label: "Linux / macOS",      cmd: cmdLin, color: "#22c55e" },
            ].map(({ label, cmd, color }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: S.dim, marginBottom: 4, letterSpacing: 1 }}>{label}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{
                    flex: 1, padding: "8px 10px", background: "#020a17",
                    border: `1px solid ${S.border}`, borderRadius: 4,
                    fontSize: 10, color, fontFamily: S.mono,
                    wordBreak: "break-all", lineHeight: 1.6,
                  }}>{cmd}</div>
                  <CopyBtn text={cmd} />
                </div>
              </div>
            ))}

            <div style={{ marginTop: 6, padding: "8px 12px", background: "#020a17", borderRadius: 4, border: `1px solid #1a3060`, fontSize: 10, color: S.dim, lineHeight: 1.7 }}>
              <b style={{ color: "#f59e0b" }}>SAU</b> — descarcă <code style={{ color: "#22d3ee" }}>bot_config.json</code> și pune-l în folderul{" "}
              <code style={{ color: "#22d3ee" }}>Python_bot/</code>. Botul îl citește automat, fără env vars.
            </div>
          </Panel>
        )}

        {/* ── OLLAMA CONFIG ── */}
        <Panel>
          <Label>■ OLLAMA — URL SERVER</Label>
          <div style={{ fontSize: 10, color: S.dim, marginBottom: 10, lineHeight: 1.7 }}>
            Default: <code style={{ color: "#22d3ee" }}>http://localhost:11434</code> — schimbă doar dacă Ollama rulează pe alt PC/port.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input
              type="text"
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              style={{ ...inputStyle(true), width: 280, letterSpacing: "normal" }}
            />
            <button onClick={testOllama} style={{
              padding: "8px 16px", fontSize: 10, letterSpacing: 1,
              border: `1px solid #22d3ee`, background: "rgba(34,211,238,0.08)",
              color: "#22d3ee", borderRadius: 4, cursor: "pointer",
            }}>▶ TESTEAZĂ</button>
            {ollamaStatus === "ok"  && <span style={{ fontSize: 11, color: "#22c55e" }}>✓ Ollama online</span>}
            {ollamaStatus === "err" && <span style={{ fontSize: 11, color: "#ef4444" }}>✗ Offline sau URL greșit</span>}
          </div>
          <div style={{ fontSize: 10, color: S.dim, lineHeight: 1.7 }}>
            Pornire Ollama: <code style={{ color: "#f59e0b" }}>ollama serve</code><br />
            Instalare model: <code style={{ color: "#f59e0b" }}>ollama pull qwen2.5:7b</code>
          </div>
        </Panel>

        {/* ── SECURITATE ── */}
        <Panel style={{ borderColor: "#1a2040" }}>
          <Label>■ NOTĂ SECURITATE</Label>
          <div style={{ fontSize: 10, color: S.dim, lineHeight: 1.8 }}>
            🔒 Cheile sunt stocate <b style={{ color: S.txt }}>local în browser (localStorage)</b> — nu sunt trimise nicăieri.<br />
            ⚠️ Nu folosi chei cu permisiuni de <b style={{ color: "#ef4444" }}>Withdrawal</b> — doar <b style={{ color: "#22c55e" }}>Reading + Spot Trading</b>.<br />
            🛡️ Activează <b style={{ color: S.txt }}>IP restriction</b> în Binance pentru cheia ta (IP-ul tău fix).<br />
            📁 Fișierul <code style={{ color: "#22d3ee" }}>bot_config.json</code> nu trebuie urcat pe GitHub — adaugă-l în <code style={{ color: "#22d3ee" }}>.gitignore</code>.
          </div>
        </Panel>
      </div>
    </div>
  );
}
