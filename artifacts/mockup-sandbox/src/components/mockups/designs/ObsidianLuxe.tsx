export function ObsidianLuxe() {
  const indices = [
    { name: "S&P 500", price: "7 575,39", change: "+0,42%", up: true },
    { name: "NASDAQ", price: "26 281,61", change: "+0,29%", up: true },
    { name: "Dow Jones", price: "52 637,01", change: "+0,29%", up: true },
    { name: "Russell 2000", price: "2 977,81", change: "-0,49%", up: false },
  ];
  const crypto = [
    { name: "Bitcoin", sym: "BTC", price: "77 800,00", change: "-0,40%", up: false },
    { name: "Ethereum", sym: "ETH", price: "3 218,44", change: "+0,78%", up: true },
    { name: "Solana", sym: "SOL", price: "148,21", change: "-0,12%", up: false },
  ];
  const commodities = [
    { name: "Or", sym: "XAU", price: "4 119,50", change: "-0,51%", up: false },
    { name: "Pétrole WTI", sym: "CL", price: "71,53", change: "-0,76%", up: false },
    { name: "Argent", sym: "XAG", price: "60,17", change: "-0,95%", up: false },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#07080f", minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, minHeight: "100vh", background: "#05060d",
        borderRight: "1px solid rgba(198,165,90,0.18)",
        display: "flex", flexDirection: "column", flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: "28px 22px 20px", borderBottom: "1px solid rgba(198,165,90,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg, #c6a55a 0%, #e8d5a3 50%, #b8922a 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 20px rgba(198,165,90,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
              flexShrink: 0
            }}>
              <span style={{ fontSize: 15, color: "#1a1200", fontWeight: 900, letterSpacing: "-0.5px" }}>S</span>
            </div>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", color: "#e8d5a3", fontSize: 13, letterSpacing: "0.2em", fontWeight: 600 }}>SOLIRIS</div>
              <div style={{ color: "rgba(198,165,90,0.55)", fontSize: 8.5, letterSpacing: "0.38em", marginTop: -1 }}>MARKET</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 10px" }}>
          {[
            { label: "Tableau de bord", active: true },
            { label: "Rechercher" },
            { label: "Portefeuille" },
            { label: "Alertes" },
            { label: "Journal" },
            { label: "Apprendre" },
          ].map(({ label, active }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
              borderRadius: 6, marginBottom: 1, cursor: "pointer",
              background: active ? "rgba(198,165,90,0.14)" : "transparent",
              color: active ? "#e8d5a3" : "rgba(198,165,90,0.45)",
              fontSize: 13, fontWeight: active ? 500 : 400,
              borderLeft: active ? "2px solid #c6a55a" : "2px solid transparent",
              transition: "all 0.15s"
            }}>
              <div style={{ width: 14, height: 14, borderRadius: 2, background: active ? "#c6a55a" : "rgba(198,165,90,0.25)", flexShrink: 0 }} />
              {label}
            </div>
          ))}
        </nav>
        <div style={{ padding: "14px 10px", borderTop: "1px solid rgba(198,165,90,0.1)" }}>
          <div style={{ padding: "8px 12px", color: "rgba(198,165,90,0.35)", fontSize: 12, cursor: "pointer" }}>Mode sombre</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: "32px 36px", overflowY: "auto" }}>
        {/* Ticker */}
        <div style={{
          marginBottom: 28, padding: "8px 0", borderBottom: "1px solid rgba(198,165,90,0.1)",
          display: "flex", gap: 32, fontSize: 12, color: "rgba(198,165,90,0.55)", letterSpacing: "0.04em"
        }}>
          {["S&P 500 · 7 575 ▲", "NASDAQ · 26 281 ▲", "Dow Jones · 52 637 ▲", "FTSE 100 · 10 497 ▲", "BTC · 77 800 ▼"].map(t => (
            <span key={t} style={{ color: t.includes("▼") ? "#ef4444" : "#22c55e" }}>{t}</span>
          ))}
        </div>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, color: "#f0e8d8", letterSpacing: "0.06em", fontFamily: "serif", marginBottom: 4 }}>
            Aperçu des marchés
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(198,165,90,0.45)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
            En direct — mis à jour il y a moins de 10s
          </div>
        </div>

        {/* Indices */}
        <section style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(198,165,90,0.4)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 1, background: "rgba(198,165,90,0.3)" }} />
            AMÉRIQUE DU NORD
            <div style={{ flex: 1, height: 1, background: "rgba(198,165,90,0.1)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {indices.map(({ name, price, change, up }) => (
              <div key={name} style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                border: "1px solid rgba(198,165,90,0.14)",
                borderRadius: 10, padding: "18px 18px",
                cursor: "pointer",
                transition: "border-color 0.2s",
                backdropFilter: "blur(10px)"
              }}>
                <div style={{ fontSize: 11, color: "rgba(198,165,90,0.5)", marginBottom: 10, letterSpacing: "0.04em" }}>{name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: "#f0e8d8", marginBottom: 6 }}>
                  US${price}
                </div>
                <div style={{ fontSize: 12, color: up ? "#22c55e" : "#ef4444", display: "flex", alignItems: "center", gap: 3 }}>
                  {up ? "▲" : "▼"} {change}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Crypto + Commodities */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
          {/* Crypto */}
          <section>
            <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(198,165,90,0.4)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 1, background: "rgba(198,165,90,0.3)" }} />
              CRYPTOMONNAIES
              <div style={{ flex: 1, height: 1, background: "rgba(198,165,90,0.1)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {crypto.map(({ name, sym, price, change, up }) => (
                <div key={sym} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(198,165,90,0.1)",
                  borderRadius: 8, padding: "13px 16px", display: "flex", alignItems: "center", cursor: "pointer"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#d4c49a", fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 10, color: "rgba(198,165,90,0.35)", letterSpacing: "0.08em" }}>{sym}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#f0e8d8" }}>US${price}</div>
                    <div style={{ fontSize: 12, color: up ? "#22c55e" : "#ef4444" }}>{change}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Commodities */}
          <section>
            <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(198,165,90,0.4)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 1, background: "rgba(198,165,90,0.3)" }} />
              MATIÈRES PREMIÈRES
              <div style={{ flex: 1, height: 1, background: "rgba(198,165,90,0.1)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commodities.map(({ name, sym, price, change, up }) => (
                <div key={sym} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(198,165,90,0.1)",
                  borderRadius: 8, padding: "13px 16px", display: "flex", alignItems: "center", cursor: "pointer"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#d4c49a", fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 10, color: "rgba(198,165,90,0.35)", letterSpacing: "0.08em" }}>{sym}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#f0e8d8" }}>US${price}</div>
                    <div style={{ fontSize: 12, color: up ? "#22c55e" : "#ef4444" }}>{change}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Popular Stocks */}
        <section>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "rgba(198,165,90,0.4)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 1, background: "rgba(198,165,90,0.3)" }} />
            ACTIONS POPULAIRES — Tech US
            <div style={{ flex: 1, height: 1, background: "rgba(198,165,90,0.1)" }} />
          </div>
          <div style={{ border: "1px solid rgba(198,165,90,0.12)", borderRadius: 10, overflow: "hidden" }}>
            {[
              { sym: "AAPL", name: "Apple Inc.", price: "315,32", change: "-0,28%", up: false },
              { sym: "NVDA", name: "NVIDIA Corp.", price: "1 102,80", change: "+2,14%", up: true },
              { sym: "MSFT", name: "Microsoft Corp.", price: "498,64", change: "+0,89%", up: true },
              { sym: "TSLA", name: "Tesla Inc.", price: "245,18", change: "+1,32%", up: true },
            ].map(({ sym, name, price, change, up }, i) => (
              <div key={sym} style={{
                display: "flex", alignItems: "center", padding: "12px 18px",
                background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                borderBottom: i < 3 ? "1px solid rgba(198,165,90,0.07)" : "none",
                cursor: "pointer"
              }}>
                <div style={{ width: 44, fontFamily: "monospace", fontSize: 13, color: "#c6a55a", fontWeight: 600 }}>{sym}</div>
                <div style={{ flex: 1, fontSize: 13, color: "rgba(198,165,90,0.55)" }}>{name}</div>
                <div style={{ fontFamily: "monospace", fontSize: 14, color: "#f0e8d8", marginRight: 16 }}>US${price}</div>
                <div style={{ fontSize: 12, color: up ? "#22c55e" : "#ef4444", width: 60, textAlign: "right" }}>{up ? "▲" : "▼"} {change}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
