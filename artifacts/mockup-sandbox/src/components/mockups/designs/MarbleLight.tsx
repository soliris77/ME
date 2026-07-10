export function MarbleLight() {
  const indices = [
    { name: "S&P 500", price: "7 575,39", change: "+0,42%", up: true, pct: 0.42 },
    { name: "NASDAQ", price: "26 281,61", change: "+0,29%", up: true, pct: 0.29 },
    { name: "Dow Jones", price: "52 637,01", change: "+0,29%", up: true, pct: 0.29 },
    { name: "Russell 2000", price: "2 977,81", change: "-0,49%", up: false, pct: -0.49 },
  ];
  const rows = [
    { sym: "AAPL", name: "Apple Inc.", price: "315,32", change: "-0,28%", up: false },
    { sym: "NVDA", name: "NVIDIA Corp.", price: "1 102,80", change: "+2,14%", up: true },
    { sym: "MSFT", name: "Microsoft Corp.", price: "498,64", change: "+0,89%", up: true },
    { sym: "TSLA", name: "Tesla Inc.", price: "245,18", change: "+1,32%", up: true },
    { sym: "META", name: "Meta Platforms", price: "622,45", change: "+0,62%", up: true },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#f7f8fa", minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, minHeight: "100vh",
        background: "#ffffff",
        borderRight: "1px solid #e8eaee",
        display: "flex", flexDirection: "column", flexShrink: 0,
        boxShadow: "1px 0 0 #e8eaee"
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #f0f1f5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: "linear-gradient(135deg, #1a2744 0%, #2d4373 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(26,39,68,0.25)"
            }}>
              <span style={{ fontSize: 15, color: "#ffffff", fontWeight: 800, fontFamily: "serif", letterSpacing: "-1px" }}>S</span>
            </div>
            <div>
              <div style={{ fontSize: 14, color: "#1a2744", fontWeight: 700, letterSpacing: "0.08em" }}>SOLIRIS</div>
              <div style={{ fontSize: 9, color: "#8890a4", letterSpacing: "0.3em", marginTop: -1 }}>MARKET</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px" }}>
          {[
            { label: "Tableau de bord", active: true },
            { label: "Rechercher" },
            { label: "Portefeuille" },
            { label: "Alertes" },
            { label: "Journal" },
            { label: "Apprendre" },
          ].map(({ label, active }) => (
            <div key={label} style={{
              padding: "9px 12px", borderRadius: 7, marginBottom: 2,
              cursor: "pointer", fontSize: 13,
              background: active ? "#eef1f9" : "transparent",
              color: active ? "#1a2744" : "#8890a4",
              fontWeight: active ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: active ? "#1a2744" : "#c5cad6", flexShrink: 0
              }} />
              {label}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto" }}>
        {/* Top bar */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e8eaee",
          padding: "0 36px", height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", gap: 28, fontSize: 12, color: "#8890a4" }}>
            {["S&P 500 +0.42%", "NASDAQ +0.29%", "BTC -0.40%", "Or -0.51%"].map(t => (
              <span key={t} style={{ color: t.includes("+") ? "#16a34a" : "#dc2626" }}>{t}</span>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8890a4" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a" }} />
            En direct
          </div>
        </div>

        <div style={{ padding: "32px 36px" }}>
          {/* Header */}
          <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a2744", letterSpacing: "-0.02em", marginBottom: 4 }}>
                Aperçu des marchés
              </h1>
              <p style={{ fontSize: 13, color: "#8890a4" }}>Vendredi 10 juillet 2026 · Données en temps réel</p>
            </div>
            <div style={{
              background: "#1a2744", color: "#fff", borderRadius: 8, padding: "8px 18px",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>
              + Ajouter à la liste
            </div>
          </div>

          {/* Index cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            {indices.map(({ name, price, change, up, pct }) => (
              <div key={name} style={{
                background: "#fff", border: "1px solid #e8eaee",
                borderRadius: 12, padding: "20px", cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                transition: "box-shadow 0.15s"
              }}>
                <div style={{ fontSize: 12, color: "#8890a4", fontWeight: 500, marginBottom: 10 }}>{name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1a2744", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
                  {price}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: up ? "#16a34a" : "#dc2626",
                    background: up ? "#f0fdf4" : "#fef2f2",
                    padding: "2px 7px", borderRadius: 4
                  }}>
                    {up ? "+" : ""}{change}
                  </span>
                </div>
                {/* Mini bar */}
                <div style={{ marginTop: 14, height: 3, background: "#f0f1f5", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${Math.abs(pct) * 50 + 30}%`,
                    background: up ? "#16a34a" : "#dc2626"
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Two columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {/* Crypto */}
            <div style={{ background: "#fff", border: "1px solid #e8eaee", borderRadius: 12, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2744" }}>Cryptomonnaies</div>
                <div style={{ fontSize: 12, color: "#8890a4" }}>Voir tout →</div>
              </div>
              {[
                { sym: "BTC", name: "Bitcoin", price: "77 800,00", change: "-0,40%", up: false },
                { sym: "ETH", name: "Ethereum", price: "3 218,44", change: "+0,78%", up: true },
                { sym: "SOL", name: "Solana", price: "148,21", change: "-0,12%", up: false },
              ].map(({ sym, name, price, change, up }, i) => (
                <div key={sym} style={{
                  display: "flex", alignItems: "center",
                  padding: "11px 0",
                  borderBottom: i < 2 ? "1px solid #f3f4f6" : "none"
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "#f3f4f6", display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 700, fontSize: 10,
                    color: "#1a2744", marginRight: 12, flexShrink: 0
                  }}>{sym}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1a2744" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#8890a4" }}>{sym}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2744", fontVariantNumeric: "tabular-nums" }}>{price}</div>
                    <div style={{ fontSize: 12, color: up ? "#16a34a" : "#dc2626", fontWeight: 500 }}>{change}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Commodities */}
            <div style={{ background: "#fff", border: "1px solid #e8eaee", borderRadius: 12, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2744" }}>Matières premières</div>
                <div style={{ fontSize: 12, color: "#8890a4" }}>Voir tout →</div>
              </div>
              {[
                { sym: "XAU", name: "Or", price: "4 119,50", change: "-0,51%", up: false },
                { sym: "CL", name: "Pétrole WTI", price: "71,53", change: "-0,76%", up: false },
                { sym: "XAG", name: "Argent", price: "60,17", change: "-0,95%", up: false },
              ].map(({ sym, name, price, change, up }, i) => (
                <div key={sym} style={{
                  display: "flex", alignItems: "center",
                  padding: "11px 0",
                  borderBottom: i < 2 ? "1px solid #f3f4f6" : "none"
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "#fefce8", display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 700, fontSize: 10,
                    color: "#854d0e", marginRight: 12, flexShrink: 0
                  }}>{sym}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1a2744" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#8890a4" }}>{sym}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2744", fontVariantNumeric: "tabular-nums" }}>{price}</div>
                    <div style={{ fontSize: 12, color: up ? "#16a34a" : "#dc2626", fontWeight: 500 }}>{change}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: "#fff", border: "1px solid #e8eaee", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2744" }}>Actions populaires</div>
              <div style={{ display: "flex", gap: 4 }}>
                {["Tech US", "Finance US", "Canada"].map((tab, i) => (
                  <div key={tab} style={{
                    fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                    background: i === 0 ? "#1a2744" : "#f3f4f6",
                    color: i === 0 ? "#fff" : "#8890a4"
                  }}>{tab}</div>
                ))}
              </div>
            </div>
            <div style={{ padding: "0 4px" }}>
              <div style={{ display: "flex", padding: "8px 16px", fontSize: 11, color: "#8890a4", fontWeight: 600, letterSpacing: "0.06em" }}>
                <div style={{ width: 60 }}>SYM</div>
                <div style={{ flex: 1 }}>NOM</div>
                <div style={{ width: 110, textAlign: "right" }}>PRIX</div>
                <div style={{ width: 80, textAlign: "right" }}>VARIATION</div>
              </div>
              {rows.map(({ sym, name, price, change, up }, i) => (
                <div key={sym} style={{
                  display: "flex", alignItems: "center", padding: "11px 16px",
                  borderTop: "1px solid #f8f9fb", cursor: "pointer",
                  background: "transparent"
                }}>
                  <div style={{ width: 60, fontWeight: 700, fontSize: 13, color: "#1a2744" }}>{sym}</div>
                  <div style={{ flex: 1, fontSize: 13, color: "#6b7280" }}>{name}</div>
                  <div style={{ width: 110, textAlign: "right", fontSize: 14, fontWeight: 600, color: "#1a2744", fontVariantNumeric: "tabular-nums" }}>
                    US${price}
                  </div>
                  <div style={{ width: 80, textAlign: "right" }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: up ? "#16a34a" : "#dc2626",
                      background: up ? "#f0fdf4" : "#fef2f2",
                      padding: "2px 7px", borderRadius: 4
                    }}>{change}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
