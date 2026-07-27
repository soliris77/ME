/**
 * /copy-trading/parametres/:followedTraderId — Réglages de risque pour un trader suivi
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ArrowLeft, Loader2, AlertCircle, Save, Info } from "lucide-react";
import CopyTradeSettingsForm from "@/components/copyTrading/CopyTradeSettingsForm";
import type { FollowedTrader } from "./CopyTrading";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function CopyTradingSettingsPage() {
  usePageMeta("Paramètres trader — Soliris Market", "Modifiez les règles de risque d'un trader suivi.");

  // Extraire l'ID depuis l'URL (/copy-trading/parametres/:id)
  const [location] = useLocation();
  const id = Number(location.split("/").pop());

  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const traderQ = useQuery<FollowedTrader[]>({
    queryKey: ["followed-traders"],
    queryFn: () => fetch(`${BASE}/api/copy-trading/followed-traders`).then((r) => r.json()),
  });

  const trader = traderQ.data?.find((t) => t.id === id) ?? null;

  const updateMut = useMutation({
    mutationFn: (values: {
      autoExecute?: boolean;
      maxAmountPerTrade?: number | null;
      maxPercentOfCapital?: number | null;
      stopLossGlobalPercent?: number | null;
    }) =>
      fetch(`${BASE}/api/copy-trading/followed-traders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followed-traders"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (traderQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trader) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/copy-trading">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
          </Link>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Trader suivi introuvable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Navigation */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/copy-trading">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-lg font-semibold">
          Paramètres — {trader.traderDisplayName ?? trader.externalStrategyId}
        </h1>
      </div>

      {/* Feedback sauvegarde */}
      {saved && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2.5">
          <Save className="w-4 h-4" />
          Paramètres sauvegardés.
        </div>
      )}

      {/* Formulaire de réglages */}
      <CopyTradeSettingsForm
        initialValues={{
          autoExecute: trader.autoExecute,
          maxAmountPerTrade: trader.maxAmountPerTrade ? Number(trader.maxAmountPerTrade) : null,
          maxPercentOfCapital: trader.maxPercentOfCapital ? Number(trader.maxPercentOfCapital) : null,
          stopLossGlobalPercent: trader.stopLossGlobalPercent ? Number(trader.stopLossGlobalPercent) : null,
        }}
        onSave={(values) => updateMut.mutate(values)}
        isSaving={updateMut.isPending}
        error={updateMut.error ? String(updateMut.error) : null}
      />

      {/* Historique de performance */}
      <PerformanceSection followedTraderId={id} traderName={trader.traderDisplayName ?? trader.externalStrategyId} />
    </div>
  );
}

function PerformanceSection({ followedTraderId, traderName }: { followedTraderId: number; traderName: string }) {
  const perfQ = useQuery<{
    totalTrades: number;
    executed: number;
    notified: number;
    failed: number;
    pending: number;
  }>({
    queryKey: ["copy-trading-performance", followedTraderId],
    queryFn: () =>
      fetch(`${BASE}/api/copy-trading/performance/${followedTraderId}`).then((r) => r.json()),
    staleTime: 30_000,
  });

  if (!perfQ.data) return null;

  const { totalTrades, executed, notified, failed, pending } = perfQ.data;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Historique — {traderName}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total détectés", value: totalTrades, cls: "" },
          { label: "Exécutés", value: executed, cls: "text-emerald-500" },
          { label: "Notifiés", value: notified, cls: "text-amber-400" },
          { label: "Échoués", value: failed, cls: "text-destructive" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className={`text-2xl font-mono font-semibold mt-1 ${cls}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
