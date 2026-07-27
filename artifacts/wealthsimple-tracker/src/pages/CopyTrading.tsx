/**
 * /copy-trading — Page principale du Copy Trading
 * Liste des traders suivis + résumé des derniers trades copiés.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Copy, Plus, Settings2, Trash2, Loader2, AlertCircle, TrendingUp } from "lucide-react";
import BrokerConnectionBanner from "@/components/copyTrading/BrokerConnectionBanner";
import TraderCard from "@/components/copyTrading/TraderCard";
import CopiedTradesTable from "@/components/copyTrading/CopiedTradesTable";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface FollowedTrader {
  id: number;
  mtConnectionId: number;
  externalStrategyId: string;
  traderDisplayName: string | null;
  autoExecute: boolean;
  maxAmountPerTrade: string | null;
  maxPercentOfCapital: string | null;
  stopLossGlobalPercent: string | null;
  createdAt: string;
}

export interface MtStatus {
  connected: boolean;
  hasApiToken: boolean;
  hasEncryptionKey: boolean;
  brokerServer?: string;
  connectedAt?: string;
  lastSyncAt?: string | null;
  metaApiAccountId?: string;
}

export default function CopyTradingPage() {
  usePageMeta("Copy Trading — Soliris Market", "Suivez et copiez les meilleurs traders.");
  const qc = useQueryClient();

  const mtStatusQ = useQuery<MtStatus>({
    queryKey: ["mt-status"],
    queryFn: () => fetch(`${BASE}/api/integrations/metatrader/status`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const tradersQ = useQuery<FollowedTrader[]>({
    queryKey: ["followed-traders"],
    queryFn: () => fetch(`${BASE}/api/copy-trading/followed-traders`).then((r) => r.json()),
    enabled: mtStatusQ.data?.connected ?? false,
  });

  const unfollowMut = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/copy-trading/followed-traders/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followed-traders"] });
      qc.invalidateQueries({ queryKey: ["copied-trades"] });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const isLoading = mtStatusQ.isLoading;
  const connected = mtStatusQ.data?.connected ?? false;
  const traders = tradersQ.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Copy className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Copy Trading</h1>
            <p className="text-sm text-muted-foreground">
              Suivez les trades des meilleurs traders et répliquez-les sur votre compte MT.
            </p>
          </div>
        </div>
        {connected && (
          <Link href="/copy-trading/decouvrir">
            <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" />
              Suivre un trader
            </button>
          </Link>
        )}
      </div>

      {/* Bannière de connexion */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <BrokerConnectionBanner status={mtStatusQ.data ?? null} />

          {connected && (
            <>
              {/* Statut MetaApi */}
              <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Compte MT connecté ({mtStatusQ.data?.brokerServer})
                </span>
                {mtStatusQ.data?.lastSyncAt && (
                  <span>
                    Dernière sync : {new Date(mtStatusQ.data.lastSyncAt).toLocaleString("fr-CA")}
                  </span>
                )}
              </div>

              {/* Liste des traders suivis */}
              <section className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">
                    Traders suivis
                  </h2>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({traders.length})
                  </span>
                </div>

                {tradersQ.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement…
                  </div>
                ) : traders.length === 0 ? (
                  <div className="bg-card border border-card-border rounded-xl p-8 text-center">
                    <Copy className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Tu ne suis encore aucun trader.
                    </p>
                    <Link href="/copy-trading/decouvrir">
                      <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                        Découvrir des traders
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {traders.map((trader) => (
                      <div key={trader.id} className="relative group">
                        <TraderCard
                          strategyId={trader.externalStrategyId}
                          displayName={trader.traderDisplayName ?? trader.externalStrategyId}
                          autoExecute={trader.autoExecute}
                          maxAmountPerTrade={trader.maxAmountPerTrade}
                          compact
                        />
                        {/* Actions */}
                        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/copy-trading/parametres/${trader.id}`}>
                            <button
                              className="p-1.5 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors"
                              title="Modifier les paramètres"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </Link>
                          {confirmDelete === trader.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  unfollowMut.mutate(trader.id);
                                  setConfirmDelete(null);
                                }}
                                className="px-2 py-1 text-[11px] bg-destructive text-destructive-foreground rounded-lg font-medium"
                              >
                                Confirmer
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-1 text-[11px] bg-sidebar-accent text-muted-foreground rounded-lg"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(trader.id)}
                              className="p-1.5 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors"
                              title="Ne plus suivre"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Historique des trades copiés */}
              <section>
                <CopiedTradesTable />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
