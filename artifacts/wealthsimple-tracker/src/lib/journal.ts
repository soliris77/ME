// Journal de trading + mode simulateur — 100% local (localStorage), aucun appel API,
// aucun coût. Les entrées sont stockées uniquement dans le navigateur de l'utilisateur.

export type JournalDirection = "achat" | "vente";
export type JournalMode = "réel" | "simulé";

export interface JournalEntry {
  id: string;
  symbol: string;
  currency: string;
  mode: JournalMode;
  direction: JournalDirection;
  entryPrice: number;
  entryDate: string; // ISO
  note: string;
  signalAtEntry?: string;
  closed: boolean;
  exitPrice?: number;
  exitDate?: string;
}

const STORAGE_KEY = "wmm_trading_journal_v1";

function readAll(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: JournalEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // stockage plein ou indisponible — on ignore silencieusement
  }
}

export function loadJournal(symbol?: string): JournalEntry[] {
  const all = readAll().sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());
  return symbol ? all.filter((e) => e.symbol === symbol) : all;
}

export function addJournalEntry(entry: Omit<JournalEntry, "id" | "entryDate" | "closed">): JournalEntry {
  const newEntry: JournalEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entryDate: new Date().toISOString(),
    closed: false,
  };
  const all = readAll();
  all.push(newEntry);
  writeAll(all);
  return newEntry;
}

export function closeJournalEntry(id: string, exitPrice: number): void {
  const all = readAll();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], closed: true, exitPrice, exitDate: new Date().toISOString() };
  writeAll(all);
}

export function removeJournalEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

export interface JournalPnL {
  pnlPct: number;
  pnlLabel: string;
  isWin: boolean;
}

// ─── CSV Export / Import ──────────────────────────────────────────────────────

/** Parse une ligne CSV en tenant compte des guillemets. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

/** Exporte toutes les entrées du journal en CSV (UTF-8 BOM pour Excel). */
export function exportJournalToCSV(): string {
  const all = readAll();
  const headers = [
    "id","symbol","currency","mode","direction",
    "entryPrice","entryDate","exitPrice","exitDate",
    "closed","note","signalAtEntry",
  ];
  const escape = (v: string | number | boolean | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  const rows = all.map((e) =>
    [
      escape(e.id), escape(e.symbol), escape(e.currency),
      escape(e.mode), escape(e.direction),
      e.entryPrice, escape(e.entryDate),
      e.exitPrice ?? "", escape(e.exitDate),
      e.closed ? "oui" : "non",
      escape(e.note), escape(e.signalAtEntry),
    ].join(",")
  );
  // BOM UTF-8 pour compatibilité Excel
  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

/**
 * Importe des entrées depuis un CSV (format exportJournalToCSV).
 * Les entrées dont l'id existe déjà sont ignorées (pas de doublons).
 * Retourne le nombre d'entrées importées.
 */
export function importJournalFromCSV(csv: string): number {
  // Enlever le BOM si présent
  const clean = csv.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("id,"));
  const existing = readAll();
  const existingIds = new Set(existing.map((e) => e.id));
  let imported = 0;

  for (const line of lines) {
    try {
      const cols = parseCSVLine(line);
      if (cols.length < 10) continue;
      const entry: JournalEntry = {
        id:           cols[0] || `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        symbol:       cols[1].toUpperCase(),
        currency:     cols[2] || "CAD",
        mode:         (cols[3] as JournalMode) || "simulé",
        direction:    (cols[4] as JournalDirection) || "achat",
        entryPrice:   parseFloat(cols[5]) || 0,
        entryDate:    cols[6] || new Date().toISOString(),
        exitPrice:    cols[7] ? parseFloat(cols[7]) : undefined,
        exitDate:     cols[8] || undefined,
        closed:       cols[9] === "oui" || cols[9] === "true",
        note:         cols[10] || "",
        signalAtEntry: cols[11] || undefined,
      };
      if (!existingIds.has(entry.id) && entry.symbol && entry.entryPrice > 0) {
        existing.push(entry);
        existingIds.add(entry.id);
        imported++;
      }
    } catch { /* ignore lignes invalides */ }
  }

  writeAll(existing);
  return imported;
}

/** Calcule le profit/perte (réalisé si fermé, latent sinon) par rapport au prix courant. */
export function computeJournalPnL(entry: JournalEntry, currentPrice: number): JournalPnL {
  const refPrice = entry.closed && entry.exitPrice !== undefined ? entry.exitPrice : currentPrice;
  const raw = entry.direction === "achat"
    ? ((refPrice - entry.entryPrice) / entry.entryPrice) * 100
    : ((entry.entryPrice - refPrice) / entry.entryPrice) * 100;
  const pnlPct = Math.round(raw * 100) / 100;
  return {
    pnlPct,
    pnlLabel: `${pnlPct > 0 ? "+" : ""}${pnlPct}%`,
    isWin: pnlPct > 0,
  };
}

