/**
 * Custom React Query hooks for chart notes — bypasses orval and calls
 * /api/notes directly with the same session-cookie auth as all other routes.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ChartNoteItem {
  id: number;
  symbol: string;
  candleDate: string;
  text: string;
  createdAt: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function chartNotesQueryKey(symbol: string) {
  return ["chart-notes", symbol] as const;
}

/** Fetch all notes for a symbol. */
export function useChartNotes(symbol: string) {
  return useQuery({
    queryKey: chartNotesQueryKey(symbol),
    queryFn: () =>
      apiFetch<ChartNoteItem[]>(`/api/notes?symbol=${encodeURIComponent(symbol)}`),
    enabled: !!symbol,
    staleTime: 30_000,
  });
}

/** Add a new note — invalidates the symbol's note list on success. */
export function useAddChartNote(symbol: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { candleDate: string; text: string }) =>
      apiFetch<ChartNoteItem>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ symbol, ...body }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chartNotesQueryKey(symbol) }),
  });
}

/** Delete a note by id — invalidates the symbol's note list on success. */
export function useDeleteChartNote(symbol: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<undefined>(`/api/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chartNotesQueryKey(symbol) }),
  });
}
