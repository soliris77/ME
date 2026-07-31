import './fonts.css';
import React, { useState, useEffect } from 'react';
import { 
  Search, Settings, User, Bell, ChevronDown, 
  Plus, Minus, ArrowUpRight, ArrowDownRight, 
  Activity, Clock, DollarSign, Briefcase,
  TrendingUp, TrendingDown,
  LineChart as LineChartIcon
} from 'lucide-react';

// Data Models
const ASSETS = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', price: 173.50, change: 1.24, changePct: 0.72, volume: '54.2M', marketCap: '2.7T', pe: '27.4', high52: 198.23, low52: 124.17 },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corp.', price: 338.11, change: -2.15, changePct: -0.63, volume: '22.1M', marketCap: '2.5T', pe: '32.1', high52: 366.78, low52: 213.43 },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', price: 214.65, change: 8.42, changePct: 4.08, volume: '112.4M', marketCap: '680B', pe: '65.2', high52: 314.67, low52: 101.81 },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 460.18, change: 12.30, changePct: 2.75, volume: '45.8M', marketCap: '1.1T', pe: '110.5', high52: 502.66, low52: 108.13 },
  BTC: { symbol: 'BTC', name: 'Bitcoin', price: 34120.50, change: -1250.20, changePct: -3.54, volume: '18.5B', marketCap: '665B', pe: 'N/A', high52: 48000.00, low52: 15400.00 },
  ETH: { symbol: 'ETH', name: 'Ethereum', price: 1780.25, change: 15.40, changePct: 0.87, volume: '8.2B', marketCap: '214B', pe: 'N/A', high52: 2140.00, low52: 1080.00 },
  SOL: { symbol: 'SOL', name: 'Solana', price: 32.45, change: 1.12, changePct: 3.57, volume: '1.1B', marketCap: '13.5B', pe: 'N/A', high52: 38.50, low52: 8.00 },
};

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

const HOLDINGS = [
  { symbol: 'AAPL', qty: 50, avgCost: 150.25 },
  { symbol: 'MSFT', qty: 20, avgCost: 310.50 },
  { symbol: 'BTC', qty: 0.5, avgCost: 28000.00 },
];

export default function Ticker() {
  const [activeAsset, setActiveAsset] = useState<keyof typeof ASSETS>('AAPL');
  const [timeframe, setTimeframe] = useState('1M');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [orderQty, setOrderQty] = useState<number>(1);
  const [currentTab, setCurrentTab] = useState<'trade' | 'portfolio'>('trade');
  
  const asset = ASSETS[activeAsset];
  
  // Fake chart data generator based on timeframe and asset
  const [chartData, setChartData] = useState<number[]>([]);
  
  useEffect(() => {
    // Generate new chart data when asset or timeframe changes
    const points = timeframe === '1D' ? 24 : timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : 60;
    const basePrice = asset.price;
    const volatility = asset.symbol === 'BTC' || asset.symbol === 'SOL' ? 0.05 : 0.015;
    
    let currentPrice = basePrice * (1 - (Math.random() * volatility * 2 - volatility));
    const newChartData = [currentPrice];
    
    for (let i = 1; i < points; i++) {
      const change = currentPrice * (Math.random() * volatility * 2 - volatility);
      currentPrice += change;
      newChartData.push(currentPrice);
    }
    // Make sure it ends near current price
    newChartData.push(basePrice);
    setChartData(newChartData);
  }, [activeAsset, timeframe, asset.price, asset.symbol]);

  const minChart = Math.min(...chartData) * 0.99;
  const maxChart = Math.max(...chartData) * 1.01;

  return (
    <div className="w-full h-full bg-[#0A0A0A] text-[#EDEDED] font-['Space_Grotesk',sans-serif] overflow-hidden flex flex-col relative select-none">
      <style dangerouslySetInnerHTML={{__html: `
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        
        .chart-line {
          stroke-dasharray: 2000;
          stroke-dashoffset: 2000;
          animation: drawLine 1.5s ease-out forwards;
        }
        
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #0A0A0A; 
        }
        ::-webkit-scrollbar-thumb {
          background: #333; 
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #444; 
        }
      `}} />

      {/* Top Nav */}
      <header className="h-[60px] border-b border-[#222] flex items-center justify-between px-6 bg-[#0F0F0F] shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
            <Activity className="w-5 h-5 text-[#3b82f6]" />
            <span>TERMINAL</span>
          </div>
          <nav className="flex items-center gap-1">
            <button 
              onClick={() => setCurrentTab('trade')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${currentTab === 'trade' ? 'bg-[#222] text-white' : 'text-[#888] hover:text-[#DDD]'}`}
            >
              Trade
            </button>
            <button 
              onClick={() => setCurrentTab('portfolio')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${currentTab === 'portfolio' ? 'bg-[#222] text-white' : 'text-[#888] hover:text-[#DDD]'}`}
            >
              Portfolio
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search symbols..." 
              className="bg-[#1A1A1A] border border-[#333] text-sm text-white rounded-md pl-9 pr-4 py-1.5 focus:outline-none focus:border-[#3b82f6] w-[200px] transition-colors"
            />
          </div>
          <div className="h-6 w-px bg-[#333] mx-2"></div>
          <button className="text-[#888] hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <button className="text-[#888] hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-[#222] p-1 pr-2 rounded-md transition-colors">
            <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center">
              <User className="w-4 h-4 text-[#AAA]" />
            </div>
            <ChevronDown className="w-4 h-4 text-[#888]" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Watchlist */}
        <div className="w-[320px] border-r border-[#222] bg-[#0A0A0A] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#222] flex justify-between items-center">
            <h2 className="text-sm font-bold tracking-wider text-[#888] uppercase">Watchlist</h2>
            <button className="text-[#888] hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {Object.values(ASSETS).map((item) => (
              <button
                key={item.symbol}
                onClick={() => { setActiveAsset(item.symbol as keyof typeof ASSETS); setCurrentTab('trade'); }}
                className={`w-full p-4 flex items-center justify-between border-b border-[#1A1A1A] hover:bg-[#111] transition-colors ${activeAsset === item.symbol ? 'bg-[#1A1A1A] border-l-2 border-l-[#3b82f6]' : 'border-l-2 border-l-transparent'}`}
              >
                <div className="flex flex-col items-start">
                  <span className="font-bold text-white">{item.symbol}</span>
                  <span className="text-xs text-[#666]">{item.name}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="mono text-sm text-white">${item.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  <span className={`mono text-xs flex items-center ${item.change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {item.change >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Center - Chart & Portfolio */}
        <div className="flex-1 flex flex-col bg-[#0F0F0F] relative">
          
          {currentTab === 'trade' ? (
            <>
              {/* Chart Header */}
              <div className="p-6 pb-0 flex justify-between items-start shrink-0">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl font-bold text-white">{asset.symbol}</h1>
                    <span className="text-lg text-[#888]">{asset.name}</span>
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="mono text-4xl font-light tracking-tight text-white">
                      ${asset.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                    <div className={`flex items-center gap-1 mb-1 font-medium ${asset.change >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                      {asset.change >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      <span className="mono text-lg">{Math.abs(asset.change).toFixed(2)}</span>
                      <span className="mono">({Math.abs(asset.changePct).toFixed(2)}%)</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex bg-[#1A1A1A] p-1 rounded-md border border-[#222]">
                  {TIMEFRAMES.map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded ${timeframe === tf ? 'bg-[#333] text-white' : 'text-[#888] hover:text-[#CCC]'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Area */}
              <div className="flex-1 relative p-6 mt-4 flex items-end">
                {/* Y-axis labels */}
                <div className="absolute right-6 top-6 bottom-6 flex flex-col justify-between text-[#555] mono text-xs pointer-events-none select-none">
                  <span>${maxChart.toFixed(2)}</span>
                  <span>${((maxChart + minChart) / 2).toFixed(2)}</span>
                  <span>${minChart.toFixed(2)}</span>
                </div>
                
                {/* SVG Chart */}
                <div className="w-full h-full relative">
                  {/* Grid lines */}
                  <div className="absolute inset-0 border-t border-b border-[#222] pointer-events-none" />
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-50">
                    <div className="w-full border-b border-dashed border-[#222] h-1/4"></div>
                    <div className="w-full border-b border-dashed border-[#222] h-1/4"></div>
                    <div className="w-full border-b border-dashed border-[#222] h-1/4"></div>
                  </div>

                  <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={asset.change >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={asset.change >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path 
                      d={`M0,400 ${chartData.map((val, i) => `L${(i / (chartData.length - 1)) * 1000},${400 - ((val - minChart) / (maxChart - minChart)) * 400}`).join(' ')} L1000,400 Z`}
                      fill="url(#lineGrad)"
                    />
                    <path 
                      d={`${chartData.map((val, i) => `${i === 0 ? 'M' : 'L'}${(i / (chartData.length - 1)) * 1000},${400 - ((val - minChart) / (maxChart - minChart)) * 400}`).join(' ')}`}
                      fill="none"
                      stroke={asset.change >= 0 ? '#10b981' : '#ef4444'}
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      className="chart-line"
                    />
                  </svg>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="h-[80px] border-t border-[#222] flex items-center px-6 shrink-0 bg-[#0A0A0A]">
                <div className="grid grid-cols-5 gap-8 w-full">
                  <div className="flex flex-col gap-1">
                    <span className="text-[#666] text-xs uppercase tracking-wider font-semibold">Volume (24h)</span>
                    <span className="text-white mono text-sm">{asset.volume}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#666] text-xs uppercase tracking-wider font-semibold">Market Cap</span>
                    <span className="text-white mono text-sm">{asset.marketCap}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#666] text-xs uppercase tracking-wider font-semibold">P/E Ratio</span>
                    <span className="text-white mono text-sm">{asset.pe}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#666] text-xs uppercase tracking-wider font-semibold">52W High</span>
                    <span className="text-white mono text-sm">${asset.high52.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#666] text-xs uppercase tracking-wider font-semibold">52W Low</span>
                    <span className="text-white mono text-sm">${asset.low52.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Portfolio Tab
            <div className="flex flex-col h-full p-8">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">Portfolio Overview</h1>
                  <div className="flex items-center gap-4">
                    <span className="mono text-4xl font-light text-white">$142,845.50</span>
                    <span className="text-[#10b981] bg-[#10b981]/10 px-2 py-1 rounded text-sm font-semibold flex items-center">
                      <ArrowUpRight className="w-4 h-4 mr-1" /> +$4,250.00 (3.06%)
                    </span>
                  </div>
                </div>
                <button className="bg-[#1A1A1A] hover:bg-[#222] border border-[#333] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Download Report
                </button>
              </div>

              <div className="border border-[#222] rounded-lg bg-[#0A0A0A] overflow-hidden flex-1 flex flex-col">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#222] bg-[#111]">
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider">Asset</th>
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider text-right">Balance</th>
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider text-right">Price</th>
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider text-right">Value</th>
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider text-right">Return</th>
                      <th className="p-4 text-[#888] text-xs font-bold uppercase tracking-wider text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HOLDINGS.map((h, i) => {
                      const curAsset = ASSETS[h.symbol as keyof typeof ASSETS] || { name: 'Unknown', price: 0 };
                      const value = h.qty * curAsset.price;
                      const returnVal = value - (h.qty * h.avgCost);
                      const returnPct = (returnVal / (h.qty * h.avgCost)) * 100;
                      return (
                        <tr key={i} className="border-b border-[#1A1A1A] hover:bg-[#111] transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#222] flex items-center justify-center text-xs font-bold text-white">
                                {h.symbol.substring(0,2)}
                              </div>
                              <div>
                                <div className="font-bold text-white">{h.symbol}</div>
                                <div className="text-xs text-[#666]">{curAsset.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-right mono text-white">{h.qty}</td>
                          <td className="p-4 text-right mono text-white">${curAsset.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="p-4 text-right mono text-white font-medium">${value.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="p-4 text-right mono">
                            <div className={`flex flex-col items-end ${returnVal >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                              <span>{returnVal >= 0 ? '+' : ''}${returnVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                              <span className="text-xs opacity-80">{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => { setActiveAsset(h.symbol as keyof typeof ASSETS); setCurrentTab('trade'); }}
                              className="text-[#3b82f6] hover:text-[#60a5fa] text-sm font-medium transition-colors"
                            >
                              Trade
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {HOLDINGS.length === 0 && (
                  <div className="flex-1 flex items-center justify-center flex-col text-[#666]">
                    <Briefcase className="w-12 h-12 mb-4 opacity-20" />
                    <p>No assets in portfolio</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Sidebar - Order Ticket */}
        <div className="w-[340px] border-l border-[#222] bg-[#0A0A0A] shrink-0 flex flex-col">
          <div className="p-4 border-b border-[#222]">
            <h2 className="text-sm font-bold tracking-wider text-[#888] uppercase mb-4">Order Ticket</h2>
            
            {/* Asset header */}
            <div className="flex justify-between items-center bg-[#111] p-3 rounded-md border border-[#222] mb-6">
              <div className="font-bold text-white">{asset.symbol}</div>
              <div className="mono text-white">${asset.price.toFixed(2)}</div>
            </div>

            {/* Buy / Sell Tabs */}
            <div className="flex bg-[#111] rounded-md p-1 border border-[#222] mb-6">
              <button 
                onClick={() => setOrderSide('buy')}
                className={`flex-1 py-2 text-sm font-bold rounded transition-colors ${orderSide === 'buy' ? 'bg-[#10b981] text-white' : 'text-[#888] hover:text-white'}`}
              >
                Buy
              </button>
              <button 
                onClick={() => setOrderSide('sell')}
                className={`flex-1 py-2 text-sm font-bold rounded transition-colors ${orderSide === 'sell' ? 'bg-[#ef4444] text-white' : 'text-[#888] hover:text-white'}`}
              >
                Sell
              </button>
            </div>

            {/* Order Type */}
            <div className="flex gap-4 mb-6">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${orderType === 'market' ? 'border-[#3b82f6]' : 'border-[#444] group-hover:border-[#666]'}`}>
                  {orderType === 'market' && <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />}
                </div>
                <input type="radio" className="hidden" checked={orderType === 'market'} onChange={() => setOrderType('market')} />
                <span className={`text-sm ${orderType === 'market' ? 'text-white' : 'text-[#888] group-hover:text-[#AAA]'}`}>Market</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${orderType === 'limit' ? 'border-[#3b82f6]' : 'border-[#444] group-hover:border-[#666]'}`}>
                  {orderType === 'limit' && <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />}
                </div>
                <input type="radio" className="hidden" checked={orderType === 'limit'} onChange={() => setOrderType('limit')} />
                <span className={`text-sm ${orderType === 'limit' ? 'text-white' : 'text-[#888] group-hover:text-[#AAA]'}`}>Limit</span>
              </label>
            </div>

            {/* Inputs */}
            <div className="space-y-4 mb-6">
              {orderType === 'limit' && (
                <div>
                  <div className="flex justify-between text-xs text-[#888] mb-1.5 font-medium uppercase tracking-wider">
                    <label>Limit Price</label>
                    <span>USD</span>
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
                    <input 
                      type="number" 
                      defaultValue={asset.price} 
                      className="w-full bg-[#111] border border-[#333] text-white rounded-md py-2.5 pl-9 pr-4 focus:outline-none focus:border-[#3b82f6] transition-colors mono text-sm"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <div className="flex justify-between text-xs text-[#888] mb-1.5 font-medium uppercase tracking-wider">
                  <label>Amount</label>
                  <span>{asset.symbol}</span>
                </div>
                <div className="flex items-center bg-[#111] border border-[#333] rounded-md overflow-hidden focus-within:border-[#3b82f6] transition-colors">
                  <button 
                    onClick={() => setOrderQty(Math.max(1, orderQty - 1))}
                    className="p-3 text-[#888] hover:text-white hover:bg-[#222] transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input 
                    type="number" 
                    value={orderQty} 
                    onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-transparent text-center text-white focus:outline-none mono text-sm w-16"
                  />
                  <button 
                    onClick={() => setOrderQty(orderQty + 1)}
                    className="p-3 text-[#888] hover:text-white hover:bg-[#222] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-[#111] rounded-md p-4 border border-[#222] mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#888]">Available Balance</span>
                <span className="text-white mono">$45,210.00</span>
              </div>
              <div className="flex justify-between text-sm mb-3">
                <span className="text-[#888]">Estimated Fee</span>
                <span className="text-white mono">${((orderQty * asset.price) * 0.001).toFixed(2)}</span>
              </div>
              <div className="h-px w-full bg-[#333] mb-3"></div>
              <div className="flex justify-between items-end">
                <span className="text-[#888] text-sm">Total {orderSide === 'buy' ? 'Cost' : 'Value'}</span>
                <span className="text-white mono text-xl font-bold">${(orderQty * asset.price * (orderSide === 'buy' ? 1.001 : 0.999)).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            {/* Submit Button */}
            <button 
              className={`w-full py-3.5 rounded-md font-bold text-white text-base transition-colors ${
                orderSide === 'buy' 
                  ? 'bg-[#10b981] hover:bg-[#059669]' 
                  : 'bg-[#ef4444] hover:bg-[#dc2626]'
              }`}
            >
              {orderSide === 'buy' ? 'Buy' : 'Sell'} {asset.symbol}
            </button>
          </div>
          
          {/* Recent Orders - Just decorative to fill space */}
          <div className="flex-1 overflow-y-auto p-4 opacity-50">
            <h3 className="text-xs font-bold tracking-wider text-[#888] uppercase mb-4">Recent Orders</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <div>
                  <div className="text-[#10b981] font-medium">Buy MSFT</div>
                  <div className="text-[#666] text-xs">Today, 09:41 AM</div>
                </div>
                <div className="text-right mono">
                  <div className="text-white">10 @ $338.11</div>
                  <div className="text-[#666] text-xs">Filled</div>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div>
                  <div className="text-[#ef4444] font-medium">Sell TSLA</div>
                  <div className="text-[#666] text-xs">Yesterday, 14:22 PM</div>
                </div>
                <div className="text-right mono">
                  <div className="text-white">25 @ $212.50</div>
                  <div className="text-[#666] text-xs">Filled</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
