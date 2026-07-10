import {
  useGetAlerts,
  useCreateAlert,
  useDeleteAlert,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { formatPrice } from "@/lib/format";
import { Bell, BellOff, Plus, Trash2, X, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Alert } from "@workspace/api-client-react";

function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

function CreateAlertModal({ onClose }: { onClose: () => void }) {
  const [alertType, setAlertType] = useState<"price" | "pattern">("price");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  // Champs pour une alerte de prix
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice] = useState("");
  // Champs pour une alerte de pattern/signal
  const [patternSignal, setPatternSignal] = useState<"haussier" | "baissier" | "">("");
  const [minStrength, setMinStrength] = useState<"faible" | "moyen" | "fort" | "">("moyen");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useCreateAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        toast({ title: "Alerte créée avec succès" });
        onClose();
      },
      onError: () => toast({ title: "Erreur lors de la création", variant: "destructive" }),
    },
  });

  const canSubmit =
    !!symbol &&
    (alertType === "price" ? !!price && !isNaN(parseFloat(price)) : true) &&
    !create.isPending;

  const handleCreate = () => {
    if (alertType === "price") {
      create.mutate({
        data: { symbol, name: name || undefined, alertType: "price", condition, targetPrice: parseFloat(price) },
      });
    } else {
      create.mutate({
        data: {
          symbol,
          name: name || undefined,
          alertType: "pattern",
          patternSignal: patternSignal || undefined,
          minStrength: minStrength || undefined,
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Nouvelle alerte</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setAlertType("price")}
            className={`py-2 text-sm font-medium rounded-md border transition-colors flex items-center justify-center gap-1.5 ${
              alertType === "price" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
            }`}
          >
            <Bell className="w-3.5 h-3.5" /> Prix
          </button>
          <button
            onClick={() => setAlertType("pattern")}
            className={`py-2 text-sm font-medium rounded-md border transition-colors flex items-center justify-center gap-1.5 ${
              alertType === "pattern" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Pattern/Signal
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Symbole</label>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono uppercase"
              placeholder="ex: AAPL, BTC-USD"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Étiquette (optionnel)</label>
            <input
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="ex: Apple Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {alertType === "price" ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Condition</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCondition("above")}
                    className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                      condition === "above" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    ↑ Au-dessus
                  </button>
                  <button
                    onClick={() => setCondition("below")}
                    className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                      condition === "below" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    ↓ En dessous
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Prix cible</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Type de signal</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPatternSignal("")}
                    className={`py-2 text-xs font-medium rounded-md border transition-colors ${
                      patternSignal === "" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    Les deux
                  </button>
                  <button
                    onClick={() => setPatternSignal("haussier")}
                    className={`py-2 text-xs font-medium rounded-md border transition-colors flex items-center justify-center gap-1 ${
                      patternSignal === "haussier" ? "bg-emerald-500 border-emerald-500 text-white" : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" /> Haussier
                  </button>
                  <button
                    onClick={() => setPatternSignal("baissier")}
                    className={`py-2 text-xs font-medium rounded-md border transition-colors flex items-center justify-center gap-1 ${
                      patternSignal === "baissier" ? "bg-red-500 border-red-500 text-white" : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    <TrendingDown className="w-3 h-3" /> Baissier
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Force minimale du pattern</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["faible", "moyen", "fort"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setMinStrength(s)}
                      className={`py-2 text-xs font-medium rounded-md border capitalize transition-colors ${
                        minStrength === s ? "bg-primary border-primary text-primary-foreground" : "bg-background border-input hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-md p-2">
                Tu seras notifié dès qu'un pattern de chandelier (marteau, avalement, étoile du matin/soir, etc.)
                correspondant apparaît sur ce titre — la même détection que dans l'analyse technique, gratuite, vérifiée
                automatiquement toutes les 90 secondes.
              </p>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {create.isPending ? "Création..." : "Créer l'alerte"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert, onDelete, muted = false }: { alert: Alert; onDelete: () => void; muted?: boolean }) {
  const isPattern = alert.alertType === "pattern";
  return (
    <div className={`flex items-center gap-4 px-4 py-3 group hover:bg-muted/30 transition-colors ${muted ? "opacity-60" : ""}`}>
      {muted ? (
        <BellOff className="w-4 h-4 shrink-0 text-muted-foreground" />
      ) : isPattern ? (
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
      ) : (
        <Bell className="w-4 h-4 text-primary shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{alert.symbol}</span>
          {alert.name && <span className="text-xs text-muted-foreground truncate">{alert.name}</span>}
          {muted && <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">Déclenchée</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {isPattern ? (
            <>
              Alerte pattern —{" "}
              <span className={
                alert.patternSignal === "haussier" ? "gain font-medium" :
                alert.patternSignal === "baissier" ? "loss font-medium" : "font-medium"
              }>
                {alert.patternSignal === "haussier" ? "signal haussier" : alert.patternSignal === "baissier" ? "signal baissier" : "haussier ou baissier"}
              </span>{" "}
              · force min. {alert.minStrength ?? "faible"}
            </>
          ) : (
            <>
              Alerte si le prix passe{" "}
              <span className={alert.condition === "above" ? "gain font-medium" : "loss font-medium"}>
                {alert.condition === "above" ? "au-dessus" : "en dessous"}
              </span>{" "}
              de <span className="font-mono font-medium text-foreground">{alert.targetPrice !== null && alert.targetPrice !== undefined ? formatPrice(alert.targetPrice) : "—"}</span>
            </>
          )}
          {muted && alert.triggeredAt && ` — ${new Date(alert.triggeredAt).toLocaleDateString("fr-CA")}`}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function Alerts() {
  const [showCreate, setShowCreate] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: alerts = [], isLoading } = useGetAlerts({ query: { refetchInterval: 30_000 } as any });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteAlert({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        toast({ title: "Alerte supprimée" });
      },
    },
  });

  useEffect(() => {
    if ("Notification" in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  const active = alerts.filter((a: Alert) => a.active);
  const triggered = alerts.filter((a: Alert) => !a.active && a.triggeredAt);

  return (
    <div className="p-6 max-w-3xl">
      {showCreate && <CreateAlertModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Alertes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{active.length} alerte{active.length !== 1 ? "s" : ""} active{active.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Nouvelle alerte
        </button>
      </div>

      {notifPerm !== "granted" && (
        <div className="mb-5 flex items-center gap-3 bg-accent border border-accent-border rounded-lg px-4 py-3">
          <Bell className="w-4 h-4 text-accent-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-accent-foreground">Activer les notifications du navigateur</p>
            <p className="text-xs text-muted-foreground">Recevez une notification dès qu'une alerte se déclenche.</p>
          </div>
          <button
            onClick={async () => {
              requestNotificationPermission();
              const perm = await Notification.requestPermission();
              setNotifPerm(perm);
              if (perm === "granted") sendNotification("Notifications activées ✅", "Vous recevrez des alertes.");
            }}
            className="shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            Activer
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-4 py-4 flex justify-between animate-pulse">
              <div><div className="h-4 bg-muted rounded w-20 mb-2" /><div className="h-3 bg-muted rounded w-40" /></div>
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center">
          <Bell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground mb-1">Aucune alerte configurée</p>
          <p className="text-sm text-muted-foreground mb-4">Créez une alerte de prix, ou une alerte intelligente basée sur les patterns de chandeliers.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Créer votre première alerte
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Actives</h2>
              <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
                {active.map((alert: Alert) => (
                  <AlertRow key={alert.id} alert={alert} onDelete={() => del.mutate({ id: alert.id })} />
                ))}
              </div>
            </div>
          )}

          {triggered.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Déclenchées</h2>
              <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
                {triggered.map((alert: Alert) => (
                  <AlertRow key={alert.id} alert={alert} onDelete={() => del.mutate({ id: alert.id })} muted />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
