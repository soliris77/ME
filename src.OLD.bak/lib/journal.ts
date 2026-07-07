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

