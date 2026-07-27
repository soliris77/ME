/**
 * CopyTradeSettingsForm — formulaire de réglages de risque pour un trader suivi.
 * Inclut le toggle autoExecute avec avertissement obligatoire (spec §6.3).
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Save, ShieldAlert } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface FormValues {
  autoExecute: boolean;
  maxAmountPerTrade: number | null;
  maxPercentOfCapital: number | null;
  stopLossGlobalPercent: number | null;
}

interface Props {
  initialValues: FormValues;
  onSave: (values: FormValues) => void;
  isSaving: boolean;
  error: string | null;
}

export default function CopyTradeSettingsForm({ initialValues, onSave, isSaving, error }: Props) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [showAutoExecuteWarning, setShowAutoExecuteWarning] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);

  const handleAutoExecuteChange = (checked: boolean) => {
    playSound("toggle");
    if (checked) {
      setShowAutoExecuteWarning(true);
    } else {
      setValues((v) => ({ ...v, autoExecute: false }));
      setWarningAcknowledged(false);
    }
  };

  const confirmAutoExecute = () => {
    if (!warningAcknowledged) return;
    setValues((v) => ({ ...v, autoExecute: true }));
    setShowAutoExecuteWarning(false);
  };

  const cancelAutoExecute = () => {
    setShowAutoExecuteWarning(false);
    setWarningAcknowledged(false);
  };

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 space-y-5">
      {/* Erreur API */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Exécution automatique ── */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Exécution automatique</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Les trades sont copiés automatiquement via CopyFactory sur ton compte MT.
            </p>
          </div>
          {/* Toggle */}
          <button
            role="switch"
            aria-checked={values.autoExecute}
            onClick={() => handleAutoExecuteChange(!values.autoExecute)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              values.autoExecute ? "bg-amber-500" : "bg-sidebar-accent"
            }`}
          >
            <span
              className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md transition-transform ${
                values.autoExecute ? "translate-x-5" : "translate-x-1"
              }`}
              style={{ width: "18px", height: "18px" }}
            />
          </button>
        </div>

        {/* Avertissement obligatoire (spec §6.3) */}
        {showAutoExecuteWarning && (
          <div className="mt-3 bg-amber-400/10 border border-amber-400/30 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300 leading-relaxed">
                En activant l'exécution automatique, les trades des traders que tu suis seront reproduits
                automatiquement sur ton compte MetaTrader (MT4/MT5), dans les limites que tu as définies.
                Le trading comporte un <strong>risque de perte en capital</strong>. Soliris Market
                n'exécute aucun ordre lui-même et ne peut pas garantir les performances passées ou futures
                des traders suivis.
              </p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={warningAcknowledged}
                onChange={(e) => setWarningAcknowledged(e.target.checked)}
                className="mt-0.5 accent-amber-400"
              />
              <span className="text-xs text-muted-foreground">
                J'ai compris les risques et j'active l'exécution automatique.
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={confirmAutoExecute}
                disabled={!warningAcknowledged}
                className="px-3 py-1.5 bg-amber-500 text-black text-xs font-semibold rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Activer
              </button>
              <button
                onClick={cancelAutoExecute}
                className="px-3 py-1.5 bg-sidebar-accent text-muted-foreground text-xs rounded-lg hover:text-foreground transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {values.autoExecute && !showAutoExecuteWarning && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            Exécution automatique activée — les trades sont copiés sans confirmation.
          </div>
        )}
      </div>

      <div className="gold-divider" />

      {/* ── Règles de risque ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Montant max par trade */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Montant max par trade ($)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={values.maxAmountPerTrade ?? ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                maxAmountPerTrade: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            placeholder="Pas de limite"
            className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Montant maximum à copier par trade. Vide = pas de limite.
          </p>
        </div>

        {/* % du capital max */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            % du capital max par trade
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={values.maxPercentOfCapital ?? ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                maxPercentOfCapital: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            placeholder="Pas de limite"
            className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Fraction max du capital à engager sur un seul trade.
          </p>
        </div>

        {/* Stop-loss global */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Stop-loss global (% du capital)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={values.stopLossGlobalPercent ?? ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                stopLossGlobalPercent: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            placeholder="Pas de limite"
            className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Si les pertes totales dépassent ce %, les nouvelles copies sont bloquées pour ce trader.
          </p>
        </div>
      </div>

      {/* Bouton Sauvegarder */}
      <div className="pt-1">
        <button
          onClick={() => onSave(values)}
          disabled={isSaving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder
        </button>
      </div>
    </div>
  );
}
