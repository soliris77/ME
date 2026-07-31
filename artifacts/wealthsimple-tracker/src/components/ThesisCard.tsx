import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lightbulb, Pencil, Trash2, Target, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/format";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Thesis {
  symbol: string;
  reason: string;
  targetPrice: string | null;
  invalidationPrice: string | null;
  updatedAt: string;
}

async function fetchThesis(symbol: string): Promise<Thesis | null> {
  const r = await fetch(`${BASE}/api/theses/${encodeURIComponent(symbol)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/**
 * Thèse d'investissement pour un titre : raison d'achat, prix cible et seuil
 * d'invalidation, affichés en permanence avec un verdict automatique
 * (thèse intacte / invalidée) selon le prix courant.
 */
export function ThesisCard({ symbol, currentPrice, currency }: {
  symbol: string;
  currentPrice: number | null | undefined;
  currency?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [invalidation, setInvalidation] = useState("");

  const { data: thesis, isLoading, isError } = useQuery({
    queryKey: ["thesis", symbol],
    queryFn: () => fetchThesis(symbol),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/theses/${encodeURIComponent(symbol)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Chaînes envoyées telles quelles : le serveur valide la syntaxe décimale
        // (évite NaN → null et la perte de précision des flottants).
        body: JSON.stringify({
          reason,
          targetPrice: target.trim() === "" ? null : target.trim(),
          invalidationPrice: invalidation.trim() === "" ? null : invalidation.trim(),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thesis", symbol] });
      setEditing(false);
      toast({ title: "Thèse enregistrée" });
    },
    onError: (e: Error) => toast({ title: e.message || "Erreur d'enregistrement", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/theses/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thesis", symbol] });
      toast({ title: "Thèse supprimée" });
    },
    onError: () => toast({ title: "Erreur de suppression", variant: "destructive" }),
  });

  const startEdit = () => {
    setReason(thesis?.reason ?? "");
    setTarget(thesis?.targetPrice ?? "");
    setInvalidation(thesis?.invalidationPrice ?? "");
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-5 animate-pulse">
        <div className="h-3 bg-muted rounded w-24 mb-4" />
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
    );
  }

  const targetNum = thesis?.targetPrice != null ? Number(thesis.targetPrice) : null;
  const invalidationNum = thesis?.invalidationPrice != null ? Number(thesis.invalidationPrice) : null;
  const price = typeof currentPrice === "number" && currentPrice > 0 ? currentPrice : null;

  const invalidated = price !== null && invalidationNum !== null && price <= invalidationNum;
  const targetReached = price !== null && targetNum !== null && price >= targetNum;
  const pctToTarget = price !== null && targetNum !== null ? ((targetNum - price) / price) * 100 : null;

  return (
    <div className={`bg-card border rounded-2xl p-5 ${invalidated ? "border-red-500/50" : "border-card-border"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Ma thèse</span>
        </div>
        {thesis && !editing && (
          <div className="flex items-center gap-1">
            <button title="Modifier la thèse" onClick={startEdit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button title="Supprimer la thèse" disabled={remove.isPending} onClick={() => remove.mutate()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {isError ? (
        <div className="text-sm text-amber-500">Thèse indisponible pour le moment.</div>
      ) : editing || !thesis ? (
        editing ? (
          <div className="space-y-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pourquoi j'achète / je garde ce titre…"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">Prix cible (optionnel)</span>
                <input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">Seuil d'invalidation (optionnel)</span>
                <input type="number" min="0" step="any" value={invalidation} onChange={(e) => setInvalidation(e.target.value)}
                  className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={save.isPending || reason.trim() === ""}
                onClick={() => save.mutate()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Enregistrer
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p className="mb-3">Aucune thèse pour ce titre. Écris pourquoi tu l'achètes, ton prix cible et le seuil qui invaliderait ton idée — ils resteront affichés ici.</p>
            <button onClick={startEdit} className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
              Écrire ma thèse
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {invalidated && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm font-semibold text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
              <XCircle className="w-4 h-4 shrink-0" />
              Thèse invalidée — le prix est sous ton seuil. À revoir.
            </motion.div>
          )}
          {targetReached && !invalidated && (
            <div className="flex items-center gap-2 text-sm font-semibold gain bg-emerald-500/10 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Prix cible atteint — prendre des profits ?
            </div>
          )}
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{thesis.reason}</p>
          <div className="flex flex-wrap gap-4 pt-1">
            {targetNum !== null && (
              <div className="flex items-center gap-1.5 text-[13px] font-mono">
                <Target className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-muted-foreground">Cible :</span>
                <span className="font-semibold">{formatPrice(targetNum, currency)}</span>
                {pctToTarget !== null && !targetReached && (
                  <span className="text-muted-foreground">({pctToTarget > 0 ? "+" : ""}{pctToTarget.toFixed(1)} %)</span>
                )}
              </div>
            )}
            {invalidationNum !== null && (
              <div className="flex items-center gap-1.5 text-[13px] font-mono">
                <ShieldAlert className={`w-3.5 h-3.5 ${invalidated ? "text-red-500" : "text-amber-500/80"}`} />
                <span className="text-muted-foreground">Invalidation :</span>
                <span className={`font-semibold ${invalidated ? "text-red-500" : ""}`}>{formatPrice(invalidationNum, currency)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
