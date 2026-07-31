import { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, AlertTriangle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import './_group.css';

// ─── Types & Mock Data ────────────────────────────────────────────────────────

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[]; // 7-day mini chart
}

interface Alert {
  id: number;
  symbol: string;
  condition: string;
  target: number;
  status: 'active' | 'triggered' | 'expired';
}

const MOCK_WATCHLIST: Quote[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 178.45, change: 2.34, changePercent: 1.33, sparkline: [175, 176, 174, 177, 178, 179, 178.45] },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 487.23, change: -4.12, changePercent: -0.84, sparkline: [495, 492, 490, 488, 489, 491, 487.23] },
  { symbol: 'SHOP.TO', name: 'Shopify Inc.', price: 94.56, change: 1.87, changePercent: 2.02, sparkline: [92, 92.5, 93, 93.8, 94, 94.2, 94.56] },
  { symbol: 'XEQT.TO', name: 'iShares Core Equity ETF', price: 32.18, change: 0.14, changePercent: 0.44, sparkline: [32, 32.05, 32.1, 32.12, 32.15, 32.16, 32.18] },
  { symbol: 'ENB.TO', name: 'Enbridge Inc.', price: 51.23, change: -0.34, changePercent: -0.66, sparkline: [51.6, 51.5, 51.4, 51.3, 51.25, 51.2, 51.23] },
];

const MOCK_INDICES: Quote[] = [
  { symbol: '^GSPC', name: 'S&P 500', price: 5234.18, change: 12.45, changePercent: 0.24, sparkline: [5220, 5225, 5230, 5228, 5232, 5233, 5234.18] },
  { symbol: '^IXIC', name: 'NASDAQ', price: 16340.87, change: -23.12, changePercent: -0.14, sparkline: [16360, 16355, 16350, 16345, 16342, 16341, 16340.87] },
  { symbol: '^DJI', name: 'Dow Jones', price: 38789.45, change: 87.23, changePercent: 0.23, sparkline: [38700, 38720, 38750, 38770, 38780, 38785, 38789.45] },
];

const MOCK_ALERTS: Alert[] = [
  { id: 1, symbol: 'AAPL', condition: 'Prix ≥', target: 180.00, status: 'active' },
  { id: 2, symbol: 'NVDA', condition: 'Prix ≤', target: 480.00, status: 'triggered' },
  { id: 3, symbol: 'SHOP.TO', condition: 'Prix ≥', target: 100.00, status: 'active' },
];

// ─── Sparkline Component ──────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[], color: 'gain' | 'loss' | 'neutral' }) {
  if (data.length < 2) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 40;
    const y = 16 - ((val - min) / range) * 16;
    return `${x},${y}`;
  }).join(' ');
  
  const colorMap = {
    gain: '#16A34A',
    loss: '#DC2626',
    neutral: 'hsl(var(--muted-foreground))',
  };
  
  return (
    <svg width="40" height="16" className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={colorMap[color]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function formatPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)} %`;
}

function changeColor(pct: number): 'gain' | 'loss' | 'neutral' {
  if (pct > 0) return 'gain';
  if (pct < 0) return 'loss';
  return 'neutral';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Refined() {
  const [circuitBreakerStatus] = useState<'active' | 'warning' | 'halted'>('active');
  const dailyPnL = 347.82;
  const dailyPnLPercent = 1.24;
  const lossLimitProgress = 23; // % of daily loss limit
  
  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E8E9ED] font-sans" style={{ fontFamily: 'var(--app-font-sans)' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        
        {/* ─── COMMAND CENTER HERO STRIP ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* P&L Réalisé du jour */}
          <div className="bg-[#131722] border border-[#232838] rounded-xl p-5">
            <div className="section-rule mb-3">
              <span className="uppercase">P&L RÉALISÉ DU JOUR</span>
            </div>
            <div className="flex items-baseline gap-3">
              <div className={`font-mono text-4xl font-bold tabular-nums ${dailyPnL >= 0 ? 'gain' : 'loss'}`}>
                {dailyPnL >= 0 ? '+' : ''}{formatPrice(dailyPnL)} $
              </div>
              <div className={`font-mono text-lg font-semibold ${dailyPnL >= 0 ? 'gain' : 'loss'}`}>
                {formatPercent(dailyPnLPercent)}
              </div>
            </div>
          </div>
          
          {/* État du coupe-circuit */}
          <div className="bg-[#131722] border border-[#232838] rounded-xl p-5">
            <div className="section-rule mb-3">
              <span className="uppercase">COUPE-CIRCUIT</span>
            </div>
            <div className="flex items-center gap-3">
              {circuitBreakerStatus === 'active' && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold text-sm font-mono">TRADING ACTIF</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 live-dot" />
                </>
              )}
              {circuitBreakerStatus === 'warning' && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400 font-semibold text-sm font-mono">SEUIL APPROCHÉ</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-amber-400 live-dot" />
                </>
              )}
              {circuitBreakerStatus === 'halted' && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-semibold text-sm font-mono">TRADING SUSPENDU</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-red-400 live-dot" />
                </>
              )}
            </div>
            <div className="text-xs text-[#8B92A5] mt-2 font-mono">
              Limite journalière : -500.00 $
            </div>
          </div>
          
          {/* Progression vers limite */}
          <div className="bg-[#131722] border border-[#232838] rounded-xl p-5">
            <div className="section-rule mb-3">
              <span className="uppercase">LIMITE DE PERTE</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-mono text-[#8B92A5]">Progression</span>
                <span className="text-sm font-mono font-semibold">
                  {lossLimitProgress} %
                </span>
              </div>
              <div className="h-2 bg-[#1A1F2E] rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    lossLimitProgress < 50 ? 'bg-emerald-500' :
                    lossLimitProgress < 80 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(lossLimitProgress, 100)}%` }}
                />
              </div>
              <div className="text-xs text-[#8B92A5] font-mono">
                80 % = avertissement · 100 % = arrêt
              </div>
            </div>
          </div>
        </div>
        
        {/* ─── MAIN GRID ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN — Indices & Watchlist */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Indices mondiaux */}
            <div className="bg-[#131722] border border-[#232838] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#232838]">
                <div className="section-rule">
                  <span className="uppercase">INDICES MONDIAUX</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-x divide-[#232838]">
                {MOCK_INDICES.map((q) => {
                  const color = changeColor(q.changePercent);
                  return (
                    <div key={q.symbol} className="p-4 hover:bg-[#1A1F2E] transition-colors cursor-pointer">
                      <div className="text-[10px] text-[#8B92A5] font-mono uppercase tracking-wider mb-2">
                        {q.name}
                      </div>
                      <div className="font-mono text-xl font-bold mb-1">
                        {formatPrice(q.price)}
                      </div>
                      <div className={`flex items-center gap-1 text-xs font-mono font-semibold ${color}`}>
                        {q.changePercent > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {formatPercent(q.changePercent)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Ma Watchlist avec sparklines */}
            <div className="bg-[#131722] border border-[#232838] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#232838] flex items-center justify-between">
                <div className="section-rule">
                  <span className="uppercase">MA WATCHLIST</span>
                </div>
                <span className="text-xs text-[#8B92A5] font-mono">{MOCK_WATCHLIST.length} titres</span>
              </div>
              <div className="divide-y divide-[#232838]">
                {MOCK_WATCHLIST.map((q) => {
                  const color = changeColor(q.changePercent);
                  return (
                    <div key={q.symbol} className="px-5 py-3.5 hover:bg-[#1A1F2E] transition-colors cursor-pointer flex items-center justify-between group">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-mono font-bold text-[#E8E9ED] group-hover:text-[#D4A72C] transition-colors">
                            {q.symbol}
                          </div>
                          <div className="text-[10px] text-[#8B92A5] truncate max-w-[180px]">
                            {q.name}
                          </div>
                        </div>
                        <Sparkline data={q.sparkline} color={color} />
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="font-mono text-sm font-semibold tabular-nums">
                          {formatPrice(q.price)} $
                        </div>
                        <div className={`flex items-center justify-end gap-0.5 text-xs font-mono font-semibold ${color}`}>
                          {q.changePercent > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {formatPercent(q.changePercent)}
                        </div>
                      </div>
                      <div className="ml-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="p-1.5 rounded-md hover:bg-emerald-500/10 transition-colors"
                          title="Acheter"
                        >
                          <TrendingUp className="w-4 h-4" style={{ color: '#16A34A' }} />
                        </button>
                        <button 
                          className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                          title="Vendre"
                        >
                          <TrendingDown className="w-4 h-4" style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-[#232838] text-center">
                <button className="text-xs text-[#D4A72C] hover:text-[#E8B84D] font-mono font-semibold uppercase tracking-wider transition-colors">
                  + Ajouter un titre
                </button>
              </div>
            </div>
          </div>
          
          {/* RIGHT COLUMN — Alerts & Auto-Trader */}
          <div className="space-y-6">
            
            {/* Alertes actives */}
            <div className="bg-[#131722] border border-[#232838] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#232838]">
                <div className="section-rule">
                  <span className="uppercase">ALERTES PRIX</span>
                </div>
              </div>
              <div className="divide-y divide-[#232838]">
                {MOCK_ALERTS.map((alert) => (
                  <div key={alert.id} className="px-5 py-3.5 hover:bg-[#1A1F2E] transition-colors">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="font-mono text-sm font-bold text-[#D4A72C]">
                        {alert.symbol}
                      </div>
                      <div className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                        alert.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' :
                        alert.status === 'triggered' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-[#8B92A5]/15 text-[#8B92A5]'
                      }`}>
                        {alert.status === 'active' ? 'Actif' : alert.status === 'triggered' ? 'Déclenché' : 'Expiré'}
                      </div>
                    </div>
                    <div className="text-xs text-[#8B92A5] font-mono">
                      {alert.condition} {formatPrice(alert.target)} $
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-[#232838] text-center">
                <button className="text-xs text-[#D4A72C] hover:text-[#E8B84D] font-mono font-semibold uppercase tracking-wider transition-colors">
                  + Nouvelle alerte
                </button>
              </div>
            </div>
            
            {/* Auto-Trader Status */}
            <div className="bg-[#131722] border border-[#232838] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#232838]">
                <div className="section-rule">
                  <span className="uppercase">AUTO-TRADER</span>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8B92A5] font-mono uppercase tracking-wider">État</span>
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#1A1F2E]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                    <span className="text-xs font-mono font-semibold text-emerald-400">EN ÉCOUTE</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8B92A5] font-mono uppercase tracking-wider">Règles actives</span>
                  <span className="text-sm font-mono font-bold text-[#E8E9ED]">3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8B92A5] font-mono uppercase tracking-wider">Ordres aujourd'hui</span>
                  <span className="text-sm font-mono font-bold text-[#E8E9ED]">7</span>
                </div>
                <div className="pt-3 border-t border-[#232838]">
                  <div className="flex items-center gap-2 text-xs text-[#8B92A5]">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono">Dernière exécution : Il y a 12 min</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="bg-[#131722] border border-[#232838] rounded-xl p-5">
              <div className="section-rule mb-4">
                <span className="uppercase">ACTIONS RAPIDES</span>
              </div>
              <div className="space-y-2">
                <button className="w-full px-4 py-2.5 bg-[#D4A72C] hover:bg-[#E8B84D] text-[#0B0E14] font-mono font-semibold text-sm rounded-lg transition-colors">
                  Placer un ordre
                </button>
                <button className="w-full px-4 py-2.5 bg-[#1A1F2E] hover:bg-[#232838] text-[#E8E9ED] font-mono font-semibold text-sm rounded-lg border border-[#232838] transition-colors">
                  Voir le journal
                </button>
                <button className="w-full px-4 py-2.5 bg-[#1A1F2E] hover:bg-[#232838] text-[#E8E9ED] font-mono font-semibold text-sm rounded-lg border border-[#232838] transition-colors">
                  Performance
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
