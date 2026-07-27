/**
 * TradeModal — Passer un ordre en un clic depuis l'analyse technique
 * ─────────────────────────────────────────────────────────────────────
 * Design system Soliris Market :
 *   - Valeur totale = hero (IBM Plex Mono 36px) — le vrai risque visible d'abord
 *   - Couleurs : #16A34A (achat), #DC2626 (vente), #D4A72C (accent/bandeau)
 *   - Vert/rouge UNIQUEMENT pour le sens financier — jamais décoratif
 *   - Focus clavier visible via ring accent sur tous les éléments interactifs
 *   - Transition d'ouverture : scale + fade, 160ms
 */
import { useState, useEffect, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Loader2, CheckCircle2,
  TrendingUp, TrendingDown, Building2, ChevronDown, ShieldAlert, LinkIcon, ExternalLink,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────── */

interface BrokerStatus {
  mode: "paper" | "live";
  hasCredentials: boolean;
  connected: boolean;
  status: string;
  userId?: string;
  maxOrderValue?: number;
  largeOrderFrictionPct?: number;
}

interface Account {
  id?: string;
  name?: string;
  number?: string;
  type?: string;
  institution_name?: string;
  brokerage?: { name?: string };
  balance?: { total?: { amount?: number; currency?: string } } | number | null;
  currency?: string;
  meta?: { type?: string; currency?: string; unifiedAccountType?: string };
}

function fmtAccountBalance(acc: Account): string {
  const b = acc.balance;
  if (b == null) return "";
  if (typeof b === "number") {
    const cur = acc.currency ?? acc.meta?.currency ?? "";
    return ` — ${cur} ${b.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (typeof b === "object" && b.total != null) {
    const { amount = 0, currency = "" } = b.total;
    return ` — ${currency} ${amount.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return "";
}

interface TradeResult {
  id: number;
  signalId: string;
  symbol: string;
  side: string;
  quantity: string;
  mode: string;
  status: string;
  expectedPrice: string | null;
  snaptradeOrderId: string | null;
  errorMessage: string | null;
}

interface Props {
  open: boolean;
  side: "BUY" | "SELL";
  symbol: string;
  currentPrice: number;
  currency: string;
  /** Description libre de l'origine du signal (ex : "FORT ACHAT", "Etoile filante") */
  source?: string;
  onClose: () => void;
}

/* ── Hooks ─────────────────────────────────────────────── */

function useBrokerStatus() {
  return useQuery<BrokerStatus>({
    queryKey: ["broker-status"],
    queryFn: () => fetch(`${BASE}/api/broker/status`).then((r) => r.json()),
    staleTime: 30_000,
  });
}

function useAccounts(enabled: boolean) {
  return useQuery<Account[]>({
    queryKey: ["broker-accounts"],
    queryFn: () => fetch(`${BASE}/api/broker/accounts`).then((r) => r.json()),
    enabled,
    staleTime: 60_000,
  });
}


/* ── Design tokens (inline — garantit l'indépendance du dark/light) ─── */
const GAIN   = "#16A34A";
const LOSS   = "#DC2626";
const ACCENT = "#D4A72C";
const MUTED  = "#8B92A5";
const SURFACE  = "#131722";
const BASE_BG  = "#0B0E14";
const BORDER_C = "#232838";
const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontVariantNumeric: "tabular-nums",
};

/* ── Composant ─────────────────────────────────────────── */

export default function TradeModal({
  open, side, symbol, currentPrice, currency, source, onClose,
}: Props) {
  const uid = useId();
  const qc  = useQueryClient();

  const statusQ   = useBrokerStatus();
  const status    = statusQ.data;
  const isLive    = status?.mode === "live";
  const isConnected = status?.connected ?? false;
  const brokerStatus = status?.status ?? "not_setup";

  const setupMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/setup`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-status"] }),
  });

  const connectMut = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/broker/connect-url`).then((r) => r.json()),
    onSuccess: (data: { redirectURI?: string }) => {
      if (data.redirectURI) window.open(data.redirectURI, "_blank", "noopener,noreferrer");
      qc.invalidateQueries({ queryKey: ["broker-status"] });
    },
  });

  const accountsQ = useAccounts(open && isConnected);
  const accounts: Account[] = Array.isArray(accountsQ.data) ? accountsQ.data : [];

  const [qty,       setQty]       = useState<string>("1");
  const [accountId, setAccountId] = useState<string>("");
  const [result,    setResult]    = useState<TradeResult | null>(null);
  const [rejection, setRejection] = useState<{ message: string; reason: string } | null>(null);
  const [signalId]  = useState(() => crypto.randomUUID());

  /* Confirmation renforcée — ordres dépassant 50% de MAX_ORDER_VALUE. Un délai
     obligatoire de 3s doit s'écouler avant que le bouton devienne cliquable.
     Ajoute de la friction exactement là où une erreur coûterait le plus cher,
     sans ralentir les ordres routiniers. */
  const FRICTION_SECONDS = 3;
  const [frictionLeft, setFrictionLeft] = useState(0);

  /* Présélectionner le premier compte */
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0]?.id ?? "");
    }
  }, [accounts, accountId]);

  /* Reset à l'ouverture */
  useEffect(() => {
    if (open) {
      setQty("1");
      setResult(null);
      setRejection(null);
    }
  }, [open]);

  const orderMut = useMutation({
    mutationFn: async () => {
      setRejection(null);
      const body = {
        signalId, symbol, side,
        quantity: parseFloat(qty) || 0,
        accountId: accountId || undefined,
        expectedPrice: currentPrice,
        source: source ?? "manual",
      };
      const res = await fetch(`${BASE}/api/broker/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Erreur serveur" }));
        if (res.status === 422 && payload.rejected) {
          setRejection({ message: payload.error ?? "Ordre refusé", reason: payload.reason ?? "unknown" });
          return null as unknown as TradeResult;
        }
        throw new Error(payload.error ?? "Erreur inconnue");
      }
      return res.json() as Promise<TradeResult>;
    },
    onSuccess: (data) => {
      if (data) {
        setResult(data);
        qc.invalidateQueries({ queryKey: ["broker-orders"] });
      }
    },
  });

  const qtyNum      = parseFloat(qty) || 0;
  const totalValue  = qtyNum * currentPrice;
  const maxOrderValue = status?.maxOrderValue;
  const frictionPct = typeof status?.largeOrderFrictionPct === "number" ? status.largeOrderFrictionPct : 0.5;
  const isLargeOrder  = typeof maxOrderValue === "number" && maxOrderValue > 0 && totalValue > maxOrderValue * frictionPct;

  /* Redémarre le compte à rebours à chaque fois que l'ordre redevient "gros"
     ou que sa quantité change pendant qu'il l'est déjà — empêche de saisir un
     petit montant, laisser le délai s'écouler, puis l'augmenter au dernier
     moment sans nouvelle friction. */
  useEffect(() => {
    if (!open || !isLargeOrder) {
      setFrictionLeft(0);
      return;
    }
    setFrictionLeft(FRICTION_SECONDS);
    const interval = setInterval(() => {
      setFrictionLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLargeOrder, qtyNum]);

  if (!open) return null;

  const isBuy       = side === "BUY";
  const sideColor   = isBuy ? GAIN : LOSS;
  const fmtTotal    = totalValue.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtUnit     = currentPrice.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden"
        style={{
          background: SURFACE,
          border: `1px solid ${BORDER_C}`,
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(212,167,44,0.07)",
          animation: "modalEnter 160ms cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* ── En-tête ── */}
        <div
          className="flex items-start justify-between px-6 pt-6 pb-5"
          style={{ borderBottom: `1px solid ${BORDER_C}` }}
        >
          <div>
            <div className="flex items-center gap-2.5">
              {isBuy
                ? <TrendingUp  className="w-5 h-5 shrink-0" style={{ color: GAIN }} />
                : <TrendingDown className="w-5 h-5 shrink-0" style={{ color: LOSS }} />}
              <h2 className="text-[15px] font-bold tracking-[0.04em] uppercase" style={{ color: sideColor }}>
                {isBuy ? "Acheter" : "Vendre"}
                <span style={{ color: MUTED, fontWeight: 300, margin: "0 7px" }}>·</span>
                <span style={{ ...MONO, color: "#E8E9ED" }}>{symbol}</span>
              </h2>
            </div>
            {source && (
              <p className="text-[12px] mt-1" style={{ color: MUTED }}>Signal : {source}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A72C]"
            style={{ color: MUTED }}
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Corps ── */}
        <div className="px-6 pt-5 pb-3 space-y-5">

          {/* Hero — valeur totale : le chiffre le plus important = le vrai risque */}
          <div>
            <div style={{ ...MONO, fontSize: 36, fontWeight: 600, color: sideColor, lineHeight: 1 }}>
              {fmtTotal}{" "}
              <span style={{ fontSize: 18, fontWeight: 400, color: MUTED }}>{currency}</span>
            </div>
            <div className="mt-2" style={{ ...MONO, fontSize: 13, color: MUTED }}>
              {qtyNum > 0 ? qtyNum : "—"} action{qtyNum !== 1 ? "s" : ""} × {fmtUnit} $
            </div>
          </div>

          {/* Quantité */}
          <div>
            <label
              htmlFor={`${uid}-qty`}
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] mb-2"
              style={{ color: MUTED }}
            >
              Quantité
            </label>
            <input
              id={`${uid}-qty`}
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => {
                // Forcer les entiers — Wealthsimple ne supporte pas les fractions
                const v = e.target.value;
                setQty(v.includes(".") ? String(Math.floor(Number(v))) : v);
              }}
              className="w-full rounded-lg px-4 py-3 text-[14px] focus:outline-none"
              style={{ ...MONO, background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED", transition: "border-color 0.15s" }}
              onFocus={(e)  => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={(e)   => (e.currentTarget.style.borderColor = BORDER_C)}
              placeholder="1"
            />
          </div>

          {/* Compte courtier */}
          {isConnected && accounts.length > 0 && (
            <div>
              <label
                htmlFor={`${uid}-account`}
                className="block text-[11px] font-semibold uppercase tracking-[0.14em] mb-2"
                style={{ color: MUTED }}
              >
                Compte
              </label>
              <div className="relative">
                <Building2
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: MUTED }}
                />
                <select
                  id={`${uid}-account`}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full appearance-none rounded-lg pl-9 pr-8 py-3 text-[13px] focus:outline-none"
                  style={{ ...MONO, background: BASE_BG, border: `1px solid ${BORDER_C}`, color: "#E8E9ED", transition: "border-color 0.15s" }}
                  onFocus={(e)  => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={(e)   => (e.currentTarget.style.borderColor = BORDER_C)}
                >
                  {accounts.map((acc, i) => (
                    <option key={acc.id ?? i} value={acc.id ?? ""}>
                      {acc.name ?? acc.number ?? "Compte"}
                      {acc.meta?.unifiedAccountType ? ` (${acc.meta.unifiedAccountType})` : acc.type ? ` (${acc.type})` : ""}
                      {fmtAccountBalance(acc)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                  style={{ color: MUTED }}
                />
              </div>
            </div>
          )}

          {/* Compte courtier non connecté en mode live */}
          {!isConnected && isLive && (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: "rgba(201,160,64,0.05)", border: "1px solid rgba(201,160,64,0.18)" }}
            >
              <div className="text-[12px] font-medium" style={{ color: ACCENT }}>
                Aucun compte Wealthsimple connecté
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
                Pour soumettre des ordres réels, lie ton compte Wealthsimple via SnapTrade.
              </p>
              <div className="flex gap-2">
                {brokerStatus === "not_setup" && (
                  <button
                    onClick={() => setupMut.mutate()}
                    disabled={setupMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors disabled:opacity-50"
                    style={{ background: "rgba(201,160,64,0.15)", color: ACCENT, border: "1px solid rgba(201,160,64,0.3)" }}
                  >
                    {setupMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
                    Initialiser
                  </button>
                )}
                {brokerStatus === "pending" && (
                  <button
                    onClick={() => connectMut.mutate()}
                    disabled={connectMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors disabled:opacity-50"
                    style={{ background: "rgba(201,160,64,0.15)", color: ACCENT, border: "1px solid rgba(201,160,64,0.3)" }}
                  >
                    {connectMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    Lier Wealthsimple
                  </button>
                )}
                <a
                  href="/courtier"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors"
                  style={{ color: MUTED, border: `1px solid ${BORDER_C}` }}
                >
                  Voir la page Courtier →
                </a>
              </div>
            </div>
          )}

          {/* Confirmation renforcée — ordre dépassant 50% de MAX_ORDER_VALUE */}
          {isLargeOrder && !result && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-medium"
              style={{ background: "rgba(212,167,44,0.08)", border: "1px solid rgba(212,167,44,0.28)", color: ACCENT }}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                Ordre important ({fmtTotal} {currency}) — un délai de confirmation s'applique.
              </span>
            </div>
          )}

          {/* Bandeau mode — sobre, sans couleur alarme */}
          {status && (
            <div
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[11px]"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER_C}`, color: MUTED }}
            >
              {isLive ? (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: ACCENT }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: ACCENT }} />
                </span>
              ) : (
                <span className="inline-flex h-1.5 w-1.5 rounded-full shrink-0" style={{ background: MUTED, opacity: 0.4 }} />
              )}
              <span style={{ color: isLive ? ACCENT : MUTED }}>
                {isLive
                  ? "Live · Cet ordre sera soumis à Wealthsimple"
                  : "Paper · Simulation uniquement, aucun ordre réel"}
              </span>
            </div>
          )}

          {/* Résultat de l'ordre */}
          {result && (
            <div
              className="rounded-xl px-4 py-3 space-y-1.5"
              style={{
                background: result.status === "error" ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.08)",
                border: `1px solid ${result.status === "error" ? "rgba(220,38,38,0.28)" : "rgba(22,163,74,0.28)"}`,
              }}
            >
              <div
                className="flex items-center gap-2 font-semibold text-[13px]"
                style={{ color: result.status === "error" ? LOSS : GAIN }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {result.mode === "paper"
                  ? (isBuy ? "Achat simulé enregistré" : "Vente simulée enregistrée")
                  : (isBuy ? "Achat soumis au courtier" : "Vente soumise au courtier")}
              </div>
              <div className="space-y-0.5 text-[12px]" style={{ ...MONO, color: MUTED }}>
                <div>Réf. : {result.signalId.split("-").slice(-2).join("-")}</div>
                <div>Statut : <strong style={{ color: "#E8E9ED" }}>{result.status}</strong></div>
                {result.snaptradeOrderId && (
                  <div>ID SnapTrade : {result.snaptradeOrderId}</div>
                )}
                {result.errorMessage && (
                  <div className="mt-1.5 leading-relaxed" style={{ color: LOSS, fontFamily: "inherit", fontSize: 12 }}>
                    {(() => {
                      // Extraire le message lisible depuis l'erreur SnapTrade brute
                      try {
                        const m = result.errorMessage.match(/"detail"\s*:\s*"([^"]+)"/);
                        if (m) return m[1];
                      } catch { /* ignore */ }
                      return result.errorMessage;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rejet par les garde-fous (422) — distinct des erreurs techniques */}
          {rejection && (
            <div
              className="rounded-xl px-4 py-3 space-y-1.5"
              style={{ background: "rgba(212,167,44,0.08)", border: "1px solid rgba(212,167,44,0.28)" }}
            >
              <div className="flex items-center gap-2 font-semibold text-[13px]" style={{ color: ACCENT }}>
                <ShieldAlert className="w-4 h-4 shrink-0" />
                Ordre bloqué par les garde-fous de risque
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: MUTED }}>{rejection.message}</p>
            </div>
          )}

          {/* Erreur technique (500 / réseau) */}
          {orderMut.error && (
            <div
              className="rounded-lg px-3 py-2.5 text-[12px]"
              style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: LOSS }}
            >
              Erreur technique : {String(orderMut.error)}
            </div>
          )}
        </div>

        {/* ── Pied de page ── */}
        <div className="px-6 pb-6 pt-2">
          {result ? (
            <button
              onClick={onClose}
              className="w-full rounded-lg px-4 py-3.5 text-[13px] font-semibold tracking-[0.06em] transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A72C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131722]"
              style={{ border: `1px solid ${BORDER_C}`, color: "#E8E9ED" }}
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={() => orderMut.mutate()}
                disabled={orderMut.isPending || !qty || qtyNum <= 0 || frictionLeft > 0 || (isLive && !isConnected)}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-[14px] font-bold tracking-[0.06em] text-white transition-opacity disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A72C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131722]"
                style={{ background: sideColor }}
              >
                {orderMut.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Envoi…</>
                  : frictionLeft > 0
                  ? <>Confirmation dans {frictionLeft}s…</>
                  : (isBuy ? "Confirmer l'achat" : "Confirmer la vente")}
              </button>
              <button
                onClick={onClose}
                className="w-full mt-3 py-1 text-[12px] text-center focus:outline-none focus-visible:underline"
                style={{ color: MUTED, transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#E8E9ED")}
                onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}
              >
                Annuler
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
