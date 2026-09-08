import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { RefreshCw, Wallet, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { formatPrice, isUp } from "@/lib/format";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Account {
  id: string;
  number?: string;
  name?: string;
}

interface SnapTradePosition {
  symbol?: {
    symbol?: { symbol?: string };
    description?: string;
    currency?: { name?: string; symbol?: string; id?: string };
  };
  units?: number;
  price?: number;
  open_pnl?: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Requête refusée (${response.status})`);
  return response.json() as Promise<T>;
}

function SectionRule({ title }: { title: string }) {
  return (
    <div className="section-rule mb-3 mt-1">
      <span className="text-primary/60 uppercase">{title}</span>
    </div>
  );
}

function extractSymbol(pos: SnapTradePosition): string {
  return pos.symbol?.symbol?.symbol || "Inconnu";
}

function extractName(pos: SnapTradePosition): string {
  return pos.symbol?.description || "";
}

function extractCurrency(pos: SnapTradePosition): string {
  return pos.symbol?.currency?.name || pos.symbol?.currency?.symbol || "USD";
}

function PositionRow({ pos }: { pos: SnapTradePosition }) {
  const sym = extractSymbol(pos);
  const name = extractName(pos);
  const cur = extractCurrency(pos);
  const units = pos.units || 0;
  const price = pos.price || 0;
  const value = units * price;
  const pnl = pos.open_pnl;

  const up = pnl != null ? isUp(pnl) : null;
  const pnlCls = up === true ? "text-gain" : up === false ? "text-loss" : "text-muted-foreground";

  return (
    <Link href={`/quote/${encodeURIComponent(sym)}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors border-b border-border/20 last:border-0 cursor-pointer group">
        <div className="flex-1 min-w-0 mb-2 sm:mb-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors font-mono">{sym}</span>
            {name && <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{name}</span>}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {units.toLocaleString("fr-CA", { maximumFractionDigits: 4 })} parts
          </div>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Prix</div>
            <div className="text-[12px] font-mono sensitive">{formatPrice(price, cur)}</div>
          </div>
          
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">Valeur</div>
            <div className="text-[12px] font-mono font-medium sensitive">{formatPrice(value, cur)}</div>
          </div>

          <div className="w-16">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-0.5">P&L</div>
            {pnl != null ? (
              <div className={`text-[12px] font-mono sensitive ${pnlCls}`}>
                {up === true ? "+" : ""}{formatPrice(pnl, cur)}
              </div>
            ) : (
              <div className="text-[12px] font-mono text-muted-foreground">—</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function AccountPositions({ account, expandedByDefault }: { account: Account; expandedByDefault: boolean }) {
  const [expanded, setExpanded] = useState(expandedByDefault);

  const { data: positions, isLoading, isError } = useQuery<SnapTradePosition[]>({
    queryKey: ["broker-positions", account.id],
    queryFn: async () => {
      const data = await fetchJson<unknown>(`${BASE}/api/broker/positions/${encodeURIComponent(account.id)}`);
      if (!Array.isArray(data)) throw new Error("Format de positions invalide");
      return data as SnapTradePosition[];
    },
    staleTime: 60_000,
    enabled: expanded, // Only fetch when expanded
  });

  return (
    <div className="surface-glass border border-border/40 rounded-xl overflow-hidden mb-4">
      <button 
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`positions-${account.id}`}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Wallet className="w-4 h-4 text-primary/70" />
          <span className="text-[12px] font-bold tracking-wide uppercase text-foreground/90">
            {account.name || account.number || account.id}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {positions && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-sm">
              {positions.length} position{positions.length > 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div id={`positions-${account.id}`} className="border-t border-border/30 bg-card/40">
          {isLoading && (
            <div className="p-6 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Chargement des positions...</span>
            </div>
          )}
          
          {isError && (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-loss/80 bg-loss/5">
              <AlertTriangle className="w-5 h-5 mb-1" />
              <span className="text-[11px] font-mono">Impossible de charger les positions</span>
            </div>
          )}

          {positions && positions.length === 0 && (
            <div className="p-6 text-center text-[11px] text-muted-foreground font-mono">
              Aucune position dans ce compte.
            </div>
          )}

          {positions && positions.length > 0 && (
            <div className="flex flex-col">
              {positions.map((pos, idx) => (
                <PositionRow key={`${extractSymbol(pos)}-${idx}`} pos={pos} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WealthsimpleAssets() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const statusQ = useQuery({
    queryKey: ["broker-status"],
    queryFn: () => fetchJson<{ status?: string }>(`${BASE}/api/broker/status`),
    refetchInterval: 30_000,
  });

  const isConnected = statusQ.data?.status === "connected";

  const accountsQ = useQuery<Account[]>({
    queryKey: ["broker-accounts"],
    queryFn: async () => {
      const data = await fetchJson<unknown>(`${BASE}/api/broker/accounts`);
      if (!Array.isArray(data)) throw new Error("Format de comptes invalide");
      return data.filter((account): account is Account =>
        typeof account === "object" && account !== null && typeof (account as Account).id === "string"
      );
    },
    enabled: isConnected,
    staleTime: 60_000,
  });

  const handleRefresh = async () => {
    if (!isConnected || refreshing) return;
    setRefreshing(true);
    try {
      await fetchJson(`${BASE}/api/broker/refresh`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["broker-accounts"] });
      await qc.invalidateQueries({ queryKey: ["broker-positions"] });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3 mt-1">
        <div className="section-rule flex-1">
          <span className="text-primary/60 uppercase">Actifs Wealthsimple</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={!isConnected || refreshing || statusQ.isLoading}
          className="ml-4 flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
          title="Rafraîchir les données du courtier"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-primary' : ''}`} />
          {refreshing ? 'Sync...' : 'Sync'}
        </button>
      </div>

      {statusQ.isLoading ? (
        <div className="p-6 bg-card border border-card-border rounded-xl skeleton-shimmer"></div>
      ) : !isConnected ? (
        <div className="bg-card border border-card-border rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center">
          <Wallet className="w-6 h-6 text-muted-foreground/50 mb-1" />
          <span className="text-[12px] text-muted-foreground max-w-md">
            Connectez votre compte Wealthsimple via SnapTrade pour voir vos positions réelles.
          </span>
          <Link href="/courtier">
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary hover:underline cursor-pointer">
              Configurer la connexion
            </span>
          </Link>
        </div>
      ) : accountsQ.isLoading ? (
        <div className="p-6 bg-card border border-card-border rounded-xl skeleton-shimmer"></div>
      ) : accountsQ.isError ? (
        <div className="bg-card border border-card-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-loss/80 bg-loss/5">
          <AlertTriangle className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-mono">Erreur de chargement des comptes</span>
        </div>
      ) : !accountsQ.data || accountsQ.data.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-6 text-center text-[11px] text-muted-foreground font-mono">
          Aucun compte trouvé.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {accountsQ.data.map((account, i) => (
            <AccountPositions 
              key={account.id} 
              account={account} 
              expandedByDefault={accountsQ.data.length === 1 || i === 0} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
