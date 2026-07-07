import {
  useGetAlerts,
  useCreateAlert,
  useDeleteAlert,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { formatPrice } from "@/lib/format";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
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
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState("");
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">Nouvelle alerte de prix</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
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
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Email de notification (optionnel)</label>
            <input
              type="email"
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="toi@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Laisse vide pour utiliser l'email par défaut configuré.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={() => create.mutate({ data: { symbol, name: name || undefined, condition, targetPrice: parseFloat(price), notifyEmail: email || undefined } })}
            disabled={!symbol || !price || isNaN(parseFloat(price)) || create.isPending}
            className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {create.isPending ? "Création..." : "Créer l'alerte"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [showCreate, setShowCreate] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  const { data: alerts = [], isLoading } = useGetAlerts({ query: { refetchInterval: 30_000 } });
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
          <h1 className="text-xl font-bold">Alertes de prix</h1>
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
            <p className="text-xs text-muted-foreground">Recevez une notification dès qu'un prix cible est atteint.</p>
          </div>
          <button
            onClick={async () => {
              requestNotificationPermission();
              const perm = await Notification.requestPermission();
              setNotifPerm(perm);
              if (perm === "granted") sendNotification("Notifications activées ✅", "Vous recevrez des alertes de prix.");
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
          <p className="text-sm text-muted-foreground mb-4">Créez une alerte pour être notifié quand un actif atteint votre prix cible.</p>
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
                  <div key={alert.id} className="flex items-center gap-4 px-4 py-3 group hover:bg-muted/30 transition-colors">
                    <Bell className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{alert.symbol}</span>
                        {alert.name && <span className="text-xs text-muted-foreground truncate">{alert.name}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Alerte si le prix passe{" "}
                        <span className={alert.condition === "above" ? "gain font-medium" : "loss font-medium"}>
                          {alert.condition === "above" ? "au-dessus" : "en dessous"}
                        </span>{" "}
                        de <span className="font-mono font-medium text-foreground">{formatPrice(alert.targetPrice)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => del.mutate({ id: alert.id })}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {triggered.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Déclenchées</h2>
              <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
                {triggered.map((alert: Alert) => (
                  <div key={alert.id} className="flex items-center gap-4 px-4 py-3 group hover:bg-muted/30 transition-colors opacity-60">
                    <BellOff className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{alert.symbol}</span>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">Déclenchée</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {alert.condition === "above" ? "Au-dessus" : "En dessous"} de {formatPrice(alert.targetPrice)}
                        {alert.triggeredAt && ` — ${new Date(alert.triggeredAt).toLocaleDateString("fr-CA")}`}
                      </div>
                    </div>
                    <button
                      onClick={() => del.mutate({ id: alert.id })}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
