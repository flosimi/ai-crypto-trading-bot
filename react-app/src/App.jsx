import { useState, useEffect } from 'react'
import TradingBot from './TradingBot.jsx'
import StrategyLab from './StrategyLab.jsx'
import Settings from './Settings.jsx'

export default function App() {
  const [page, setPage] = useState('lab')
  const [activeModel, setActiveModel] = useState(
    () => localStorage.getItem('pb_ollama_model') || localStorage.getItem('sl_ollama_model') || 'qwen2.5:7b'
  )

  // Ascultă schimbările din localStorage (TradingBot/StrategyLab schimbă modelul)
  useEffect(() => {
    const onStorage = () => {
      const m = localStorage.getItem('pb_ollama_model') || localStorage.getItem('sl_ollama_model') || 'qwen2.5:7b'
      setActiveModel(m)
    }
    window.addEventListener('storage', onStorage)
    // Verifică și la schimbarea paginii (același tab nu emite 'storage')
    const iv = setInterval(() => {
      const m = localStorage.getItem('pb_ollama_model') || localStorage.getItem('sl_ollama_model') || 'qwen2.5:7b'
      setActiveModel(prev => prev !== m ? m : prev)
    }, 2000)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(iv) }
  }, [])

  const navStyle = (active) => ({
    padding: '8px 24px',
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    letterSpacing: 2,
    border: `1px solid ${active ? '#22d3ee' : '#0d1f3c'}`,
    background: active ? 'rgba(34,211,238,0.12)' : 'transparent',
    color: active ? '#22d3ee' : '#4b5563',
    borderRadius: 4,
    cursor: 'pointer',
  })

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", background: '#030712', minHeight: '100vh' }}>
      {/* Nav */}
      <div style={{ background: '#04091a', borderBottom: '1px solid #0d1f3c', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, color: '#22d3ee', letterSpacing: 4, marginRight: 16 }}>
          AI TRADER
        </div>
        <button style={navStyle(page === 'lab')} onClick={() => setPage('lab')}>
          🔬 STRATEGY LAB
        </button>
        <button style={navStyle(page === 'bot')} onClick={() => setPage('bot')}>
          🤖 PAPER BOT
        </button>
        <button style={navStyle(page === 'settings')} onClick={() => setPage('settings')}>
          ⚙️ SETTINGS
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#065f46', fontFamily: 'monospace', letterSpacing: 1 }}>
          AI: {activeModel} (local)
        </div>
      </div>

      {/* Content */}
      {page === 'lab'      && <StrategyLab />}
      {page === 'bot'      && <TradingBot />}
      {page === 'settings' && <Settings />}
    </div>
  )
}
