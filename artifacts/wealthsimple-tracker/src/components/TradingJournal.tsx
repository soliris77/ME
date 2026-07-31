import { useEffect, useRef, useState } from "react";
import { NotebookPen, Plus, Trash2, TrendingUp, TrendingDown, Download, Upload } from "lucide-react";
import {
  loadJournal, addJournalEntry, removeJournalEntry, closeJournalEntry, computeJournalPnL,
  exportJournalToCSV, importJournalFromCSV,
} from "@/lib/journal";
import type { JournalEntry, JournalDirection, JournalMode } from "@/lib/journal";

interface Props {
  symbol: string;
  currency: string;
  currentPrice: number;
  suggestedSignal?: string;
}

function NewEntryForm({ symbol, currency, currentPrice, suggestedSignal, onAdded, onCancel }: {
  symbol: string; currency: string; currentPrice: number; suggestedSignal?: string;
  onAdded: () => void; onCancel: () => void;
}) {
  const [mode, setMode] = useState<JournalMode>("simulé");
  const [direction, setDirection] = useState<JournalDirection>("achat");
  const [entryPrice, setEntryPrice] = useState(currentPrice.toString());
  const [note, setNote] = useState("");

  const submit = () => {
    const price = parseFloat(entryPrice);
    if (isNaN(price) || price <= 0) return;
    addJournalEntry({ symbol, currency, mode, direction, entryPrice: price, note, signalAtEntry: suggestedSignal });
    onAdded();
  };

  return (
    <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Type :</span>
        {(["simulé", "réel"] as JournalMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${mode === m ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}>
            {m === "simulé" ? "Simulé (papier)" : "Réel"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Direction :</span>
        {(["achat", "vente"] as JournalDirection[]).map((d) => (
          <button key={d} onClick={() => setDirection(d)}
            className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${direction === d ? (d === "achat" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-red-500/15 text-red-600 border-red-500/30") : "bg-muted text-muted-foreground border-border"}`}>
            {d === "achat" ? "Achat (long)" : "Vente (short)"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0 w-24">Prix d'entrée :</span>
        <input
          type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
          className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 font-mono"
        />
      </div>
      <textarea
        placeholder="Note (pourquoi cette décision ?)" value={note} onChange={(e) => setNote(e.target.value)}
        className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 resize-none" rows={2}
      />
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 bg-primary text-primary-foreground text-xs font-medium rounded-md py-1.5 hover:opacity-90 transition-opacity">
          Enregistrer
        </button>
        <button onClick={onCancel} className="px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md">
          Annuler
        </button>
      </div>
    </div>
  );
}

function EntryRow({ entry, currentPrice, onRemove, onClose }: {
  entry: JournalEntry; currentPrice: number; onRemove: (id: string) => void; onClose: (id: string) => void;
}) {
  const pnl = computeJournalPnL(entry, currentPrice);
  const isBuy = entry.direction === "achat";
  return (
    <div className={`border rounded-xl p-3 ${pnl.isWin ? "bg-emerald-500/6 border-emerald-500/20" : "bg-red-500/6 border-red-500/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isBuy ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
          <span className="text-sm font-semibold">{isBuy ? "Achat" : "Vente"}</span>
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{entry.mode}</span>
          {entry.closed && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Clôturé</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold font-mono ${pnl.isWin ? "text-emerald-500" : "text-red-500"}`}>{pnl.pnlLabel}</span>
          <button onClick={() => onRemove(entry.id)} className="text-muted-foreground hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        Entrée à {entry.currency}{entry.entryPrice.toFixed(2)} le {new Date(entry.entryDate).toLocaleDateString("fr-CA")}
        {entry.closed && entry.exitPrice !== undefined && ` · Sorti à ${entry.currency}${entry.exitPrice.toFixed(2)}`}
      </div>
      {entry.note && <p className="text-xs text-foreground/70 mt-1.5 italic">"{entry.note}"</p>}
      {entry.signalAtEntry && <p className="text-xs text-muted-foreground mt-1">Signal à l'entrée : {entry.signalAtEntry}</p>}
      {!entry.closed && (
        <button onClick={() => onClose(entry.id)} className="text-xs text-primary hover:underline mt-2">
          Clôturer au prix actuel ({entry.currency}{currentPrice.toFixed(2)})
        </button>
      )}
    </div>
  );
}

export default function TradingJournal({ symbol, currency, currentPrice, suggestedSignal }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setEntries(loadJournal(symbol));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const openCount = entries.filter((e) => !e.closed).length;

  const handleExportCSV = () => {
    const csv = exportJournalToCSV();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-soliris-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const count = importJournalFromCSV(text);
      refresh();
      setImportMsg(`${count} entrée${count > 1 ? "s" : ""} importée${count > 1 ? "s" : ""} ✓`);
      setTimeout(() => setImportMsg(null), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <NotebookPen className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Journal de trading &amp; simulateur — {symbol}</span>
        {openCount > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{openCount} position{openCount > 1 ? "s" : ""} ouverte{openCount > 1 ? "s" : ""}</span>}
        <div className="ml-auto flex items-center gap-1">
          {importMsg && <span className="text-xs text-emerald-500">{importMsg}</span>}
          <button
            onClick={handleExportCSV}
            title="Exporter en CSV"
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importer un CSV"
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Note tes décisions (réelles ou simulées) pour suivre ta progression. Tout est stocké seulement dans ton navigateur — aucune donnée envoyée à un serveur.
      </p>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border rounded-xl py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors mb-3"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une entrée {suggestedSignal ? `(signal actuel : ${suggestedSignal})` : ""}
        </button>
      ) : (
        <div className="mb-3">
          <NewEntryForm
            symbol={symbol} currency={currency} currentPrice={currentPrice} suggestedSignal={suggestedSignal}
            onAdded={() => { setShowForm(false); refresh(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Aucune entrée pour {symbol} pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <EntryRow
              key={e.id} entry={e} currentPrice={currentPrice}
              onRemove={(id) => { removeJournalEntry(id); refresh(); }}
              onClose={(id) => { closeJournalEntry(id, currentPrice); refresh(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

