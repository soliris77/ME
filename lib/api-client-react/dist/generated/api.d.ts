import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Alert, AlertInput, ChartNote, ChartNoteInput, GetMarketNewsParams, GetNotesParams, GetQuotesParams, HealthStatus, HistoricalPoint, LearnProgress, LearnProgressInput, MarketOverview, NewsItem, Quote, RenameWatchlistList200, RenameWatchlistListBody, ReorderWatchlistListsBody, SearchResult, SearchSymbolsParams, UpdateWatchlistItemBody, WatchlistInput, WatchlistItem, WatchlistList } from './api.schemas';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetQuotesUrl: (params: GetQuotesParams) => string;
/**
 * @summary Get real-time quotes for multiple symbols
 */
export declare const getQuotes: (params: GetQuotesParams, options?: RequestInit) => Promise<Quote[]>;
export declare const getGetQuotesQueryKey: (params?: GetQuotesParams) => readonly ["/api/quotes", ...GetQuotesParams[]];
export declare const getGetQuotesQueryOptions: <TData = Awaited<ReturnType<typeof getQuotes>>, TError = ErrorType<unknown>>(params: GetQuotesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuotes>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuotes>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuotesQueryResult = NonNullable<Awaited<ReturnType<typeof getQuotes>>>;
export type GetQuotesQueryError = ErrorType<unknown>;
/**
 * @summary Get real-time quotes for multiple symbols
 */
export declare function useGetQuotes<TData = Awaited<ReturnType<typeof getQuotes>>, TError = ErrorType<unknown>>(params: GetQuotesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuotes>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetQuoteUrl: (symbol: string) => string;
/**
 * @summary Get real-time quote for a single symbol
 */
export declare const getQuote: (symbol: string, options?: RequestInit) => Promise<Quote>;
export declare const getGetQuoteQueryKey: (symbol: string) => readonly [`/api/quotes/${string}`];
export declare const getGetQuoteQueryOptions: <TData = Awaited<ReturnType<typeof getQuote>>, TError = ErrorType<void>>(symbol: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuote>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuote>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuoteQueryResult = NonNullable<Awaited<ReturnType<typeof getQuote>>>;
export type GetQuoteQueryError = ErrorType<void>;
/**
 * @summary Get real-time quote for a single symbol
 */
export declare function useGetQuote<TData = Awaited<ReturnType<typeof getQuote>>, TError = ErrorType<void>>(symbol: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuote>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetQuoteHistoryUrl: (symbol: string, range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y") => string;
/**
 * @summary Get historical price data for a symbol
 */
export declare const getQuoteHistory: (symbol: string, range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y", options?: RequestInit) => Promise<HistoricalPoint[]>;
export declare const getGetQuoteHistoryQueryKey: (symbol: string, range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y") => readonly [`/api/quotes/${string}/history/1d` | `/api/quotes/${string}/history/5d` | `/api/quotes/${string}/history/1mo` | `/api/quotes/${string}/history/3mo` | `/api/quotes/${string}/history/6mo` | `/api/quotes/${string}/history/1y`];
export declare const getGetQuoteHistoryQueryOptions: <TData = Awaited<ReturnType<typeof getQuoteHistory>>, TError = ErrorType<unknown>>(symbol: string, range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y", options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuoteHistory>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuoteHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuoteHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof getQuoteHistory>>>;
export type GetQuoteHistoryQueryError = ErrorType<unknown>;
/**
 * @summary Get historical price data for a symbol
 */
export declare function useGetQuoteHistory<TData = Awaited<ReturnType<typeof getQuoteHistory>>, TError = ErrorType<unknown>>(symbol: string, range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y', options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuoteHistory>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMarketOverviewUrl: () => string;
/**
 * @summary Get overview of major indices and trending assets
 */
export declare const getMarketOverview: (options?: RequestInit) => Promise<MarketOverview>;
export declare const getGetMarketOverviewQueryKey: () => readonly ["/api/market/overview"];
export declare const getGetMarketOverviewQueryOptions: <TData = Awaited<ReturnType<typeof getMarketOverview>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMarketOverview>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMarketOverview>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMarketOverviewQueryResult = NonNullable<Awaited<ReturnType<typeof getMarketOverview>>>;
export type GetMarketOverviewQueryError = ErrorType<unknown>;
/**
 * @summary Get overview of major indices and trending assets
 */
export declare function useGetMarketOverview<TData = Awaited<ReturnType<typeof getMarketOverview>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMarketOverview>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSearchSymbolsUrl: (params: SearchSymbolsParams) => string;
/**
 * @summary Search for ticker symbols
 */
export declare const searchSymbols: (params: SearchSymbolsParams, options?: RequestInit) => Promise<SearchResult[]>;
export declare const getSearchSymbolsQueryKey: (params?: SearchSymbolsParams) => readonly ["/api/market/search", ...SearchSymbolsParams[]];
export declare const getSearchSymbolsQueryOptions: <TData = Awaited<ReturnType<typeof searchSymbols>>, TError = ErrorType<unknown>>(params: SearchSymbolsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchSymbols>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof searchSymbols>>, TError, TData> & {
    queryKey: QueryKey;
};
export type SearchSymbolsQueryResult = NonNullable<Awaited<ReturnType<typeof searchSymbols>>>;
export type SearchSymbolsQueryError = ErrorType<unknown>;
/**
 * @summary Search for ticker symbols
 */
export declare function useSearchSymbols<TData = Awaited<ReturnType<typeof searchSymbols>>, TError = ErrorType<unknown>>(params: SearchSymbolsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchSymbols>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMarketNewsUrl: (params?: GetMarketNewsParams) => string;
/**
 * @summary Get market-moving news (free — Yahoo Finance + Google News RSS, no API key)
 */
export declare const getMarketNews: (params?: GetMarketNewsParams, options?: RequestInit) => Promise<NewsItem[]>;
export declare const getGetMarketNewsQueryKey: (params?: GetMarketNewsParams) => readonly ["/api/market/news", ...GetMarketNewsParams[]];
export declare const getGetMarketNewsQueryOptions: <TData = Awaited<ReturnType<typeof getMarketNews>>, TError = ErrorType<unknown>>(params?: GetMarketNewsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMarketNews>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMarketNews>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMarketNewsQueryResult = NonNullable<Awaited<ReturnType<typeof getMarketNews>>>;
export type GetMarketNewsQueryError = ErrorType<unknown>;
/**
 * @summary Get market-moving news (free — Yahoo Finance + Google News RSS, no API key)
 */
export declare function useGetMarketNews<TData = Awaited<ReturnType<typeof getMarketNews>>, TError = ErrorType<unknown>>(params?: GetMarketNewsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMarketNews>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetWatchlistUrl: () => string;
/**
 * @summary Get all watchlist items
 */
export declare const getWatchlist: (options?: RequestInit) => Promise<WatchlistItem[]>;
export declare const getGetWatchlistQueryKey: () => readonly ["/api/watchlist"];
export declare const getGetWatchlistQueryOptions: <TData = Awaited<ReturnType<typeof getWatchlist>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWatchlist>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getWatchlist>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetWatchlistQueryResult = NonNullable<Awaited<ReturnType<typeof getWatchlist>>>;
export type GetWatchlistQueryError = ErrorType<unknown>;
/**
 * @summary Get all watchlist items
 */
export declare function useGetWatchlist<TData = Awaited<ReturnType<typeof getWatchlist>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWatchlist>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAddToWatchlistUrl: () => string;
/**
 * @summary Add a symbol to the watchlist
 */
export declare const addToWatchlist: (watchlistInput: WatchlistInput, options?: RequestInit) => Promise<WatchlistItem>;
export declare const getAddToWatchlistMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addToWatchlist>>, TError, {
        data: BodyType<WatchlistInput>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof addToWatchlist>>, TError, {
    data: BodyType<WatchlistInput>;
}, TContext>;
export type AddToWatchlistMutationResult = NonNullable<Awaited<ReturnType<typeof addToWatchlist>>>;
export type AddToWatchlistMutationBody = BodyType<WatchlistInput>;
export type AddToWatchlistMutationError = ErrorType<unknown>;
/**
* @summary Add a symbol to the watchlist
*/
export declare const useAddToWatchlist: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addToWatchlist>>, TError, {
        data: BodyType<WatchlistInput>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof addToWatchlist>>, TError, {
    data: BodyType<WatchlistInput>;
}, TContext>;
export declare const getUpdateWatchlistItemUrl: (id: number) => string;
/**
 * @summary Move a watchlist item to another custom list
 */
export declare const updateWatchlistItem: (id: number, updateWatchlistItemBody: UpdateWatchlistItemBody, options?: RequestInit) => Promise<WatchlistItem>;
export declare const getUpdateWatchlistItemMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateWatchlistItem>>, TError, {
        id: number;
        data: BodyType<UpdateWatchlistItemBody>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateWatchlistItem>>, TError, {
    id: number;
    data: BodyType<UpdateWatchlistItemBody>;
}, TContext>;
export type UpdateWatchlistItemMutationResult = NonNullable<Awaited<ReturnType<typeof updateWatchlistItem>>>;
export type UpdateWatchlistItemMutationBody = BodyType<UpdateWatchlistItemBody>;
export type UpdateWatchlistItemMutationError = ErrorType<unknown>;
/**
* @summary Move a watchlist item to another custom list
*/
export declare const useUpdateWatchlistItem: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateWatchlistItem>>, TError, {
        id: number;
        data: BodyType<UpdateWatchlistItemBody>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateWatchlistItem>>, TError, {
    id: number;
    data: BodyType<UpdateWatchlistItemBody>;
}, TContext>;
export declare const getRemoveFromWatchlistUrl: (id: number) => string;
/**
 * @summary Remove a symbol from the watchlist
 */
export declare const removeFromWatchlist: (id: number, options?: RequestInit) => Promise<void>;
export declare const getRemoveFromWatchlistMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeFromWatchlist>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof removeFromWatchlist>>, TError, {
    id: number;
}, TContext>;
export type RemoveFromWatchlistMutationResult = NonNullable<Awaited<ReturnType<typeof removeFromWatchlist>>>;
export type RemoveFromWatchlistMutationError = ErrorType<unknown>;
/**
* @summary Remove a symbol from the watchlist
*/
export declare const useRemoveFromWatchlist: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeFromWatchlist>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof removeFromWatchlist>>, TError, {
    id: number;
}, TContext>;
export declare const getGetWatchlistListsUrl: () => string;
/**
 * @summary Get all watchlist lists in display order
 */
export declare const getWatchlistLists: (options?: RequestInit) => Promise<WatchlistList[]>;
export declare const getGetWatchlistListsQueryKey: () => readonly ["/api/watchlist/lists"];
export declare const getGetWatchlistListsQueryOptions: <TData = Awaited<ReturnType<typeof getWatchlistLists>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWatchlistLists>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getWatchlistLists>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetWatchlistListsQueryResult = NonNullable<Awaited<ReturnType<typeof getWatchlistLists>>>;
export type GetWatchlistListsQueryError = ErrorType<unknown>;
/**
 * @summary Get all watchlist lists in display order
 */
export declare function useGetWatchlistLists<TData = Awaited<ReturnType<typeof getWatchlistLists>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWatchlistLists>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getReorderWatchlistListsUrl: () => string;
/**
 * @summary Persist the display order of watchlist lists
 */
export declare const reorderWatchlistLists: (reorderWatchlistListsBody: ReorderWatchlistListsBody, options?: RequestInit) => Promise<WatchlistList[]>;
export declare const getReorderWatchlistListsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof reorderWatchlistLists>>, TError, {
        data: BodyType<ReorderWatchlistListsBody>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof reorderWatchlistLists>>, TError, {
    data: BodyType<ReorderWatchlistListsBody>;
}, TContext>;
export type ReorderWatchlistListsMutationResult = NonNullable<Awaited<ReturnType<typeof reorderWatchlistLists>>>;
export type ReorderWatchlistListsMutationBody = BodyType<ReorderWatchlistListsBody>;
export type ReorderWatchlistListsMutationError = ErrorType<unknown>;
/**
* @summary Persist the display order of watchlist lists
*/
export declare const useReorderWatchlistLists: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof reorderWatchlistLists>>, TError, {
        data: BodyType<ReorderWatchlistListsBody>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof reorderWatchlistLists>>, TError, {
    data: BodyType<ReorderWatchlistListsBody>;
}, TContext>;
export declare const getRenameWatchlistListUrl: () => string;
/**
 * @summary Rename a watchlist list for all its items
 */
export declare const renameWatchlistList: (renameWatchlistListBody: RenameWatchlistListBody, options?: RequestInit) => Promise<RenameWatchlistList200>;
export declare const getRenameWatchlistListMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof renameWatchlistList>>, TError, {
        data: BodyType<RenameWatchlistListBody>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof renameWatchlistList>>, TError, {
    data: BodyType<RenameWatchlistListBody>;
}, TContext>;
export type RenameWatchlistListMutationResult = NonNullable<Awaited<ReturnType<typeof renameWatchlistList>>>;
export type RenameWatchlistListMutationBody = BodyType<RenameWatchlistListBody>;
export type RenameWatchlistListMutationError = ErrorType<unknown>;
/**
* @summary Rename a watchlist list for all its items
*/
export declare const useRenameWatchlistList: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof renameWatchlistList>>, TError, {
        data: BodyType<RenameWatchlistListBody>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof renameWatchlistList>>, TError, {
    data: BodyType<RenameWatchlistListBody>;
}, TContext>;
export declare const getDeleteWatchlistListUrl: (name: string) => string;
/**
 * @summary Delete an empty watchlist list
 */
export declare const deleteWatchlistList: (name: string, options?: RequestInit) => Promise<void>;
export declare const getDeleteWatchlistListMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteWatchlistList>>, TError, {
        name: string;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteWatchlistList>>, TError, {
    name: string;
}, TContext>;
export type DeleteWatchlistListMutationResult = NonNullable<Awaited<ReturnType<typeof deleteWatchlistList>>>;
export type DeleteWatchlistListMutationError = ErrorType<void>;
/**
* @summary Delete an empty watchlist list
*/
export declare const useDeleteWatchlistList: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteWatchlistList>>, TError, {
        name: string;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteWatchlistList>>, TError, {
    name: string;
}, TContext>;
export declare const getGetNotesUrl: (params: GetNotesParams) => string;
/**
 * @summary Get chart notes for a symbol
 */
export declare const getNotes: (params: GetNotesParams, options?: RequestInit) => Promise<ChartNote[]>;
export declare const getGetNotesQueryKey: (params?: GetNotesParams) => readonly ["/api/notes", ...GetNotesParams[]];
export declare const getGetNotesQueryOptions: <TData = Awaited<ReturnType<typeof getNotes>>, TError = ErrorType<unknown>>(params: GetNotesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getNotes>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getNotes>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetNotesQueryResult = NonNullable<Awaited<ReturnType<typeof getNotes>>>;
export type GetNotesQueryError = ErrorType<unknown>;
/**
 * @summary Get chart notes for a symbol
 */
export declare function useGetNotes<TData = Awaited<ReturnType<typeof getNotes>>, TError = ErrorType<unknown>>(params: GetNotesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getNotes>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAddNoteUrl: () => string;
/**
 * @summary Add a note to a candle
 */
export declare const addNote: (chartNoteInput: ChartNoteInput, options?: RequestInit) => Promise<ChartNote>;
export declare const getAddNoteMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addNote>>, TError, {
        data: BodyType<ChartNoteInput>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof addNote>>, TError, {
    data: BodyType<ChartNoteInput>;
}, TContext>;
export type AddNoteMutationResult = NonNullable<Awaited<ReturnType<typeof addNote>>>;
export type AddNoteMutationBody = BodyType<ChartNoteInput>;
export type AddNoteMutationError = ErrorType<unknown>;
/**
* @summary Add a note to a candle
*/
export declare const useAddNote: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addNote>>, TError, {
        data: BodyType<ChartNoteInput>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof addNote>>, TError, {
    data: BodyType<ChartNoteInput>;
}, TContext>;
export declare const getDeleteNoteUrl: (id: number) => string;
/**
 * @summary Delete a chart note
 */
export declare const deleteNote: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteNoteMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteNote>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteNote>>, TError, {
    id: number;
}, TContext>;
export type DeleteNoteMutationResult = NonNullable<Awaited<ReturnType<typeof deleteNote>>>;
export type DeleteNoteMutationError = ErrorType<unknown>;
/**
* @summary Delete a chart note
*/
export declare const useDeleteNote: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteNote>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteNote>>, TError, {
    id: number;
}, TContext>;
export declare const getGetLearnProgressUrl: () => string;
/**
 * @summary Get progress for all "Apprendre à trader" sections
 */
export declare const getLearnProgress: (options?: RequestInit) => Promise<LearnProgress[]>;
export declare const getGetLearnProgressQueryKey: () => readonly ["/api/learn-progress"];
export declare const getGetLearnProgressQueryOptions: <TData = Awaited<ReturnType<typeof getLearnProgress>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLearnProgress>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getLearnProgress>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetLearnProgressQueryResult = NonNullable<Awaited<ReturnType<typeof getLearnProgress>>>;
export type GetLearnProgressQueryError = ErrorType<unknown>;
/**
 * @summary Get progress for all "Apprendre à trader" sections
 */
export declare function useGetLearnProgress<TData = Awaited<ReturnType<typeof getLearnProgress>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLearnProgress>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateLearnProgressUrl: (sectionId: string) => string;
/**
 * @summary Mark a "Apprendre à trader" section (and optional quiz result) as completed or not
 */
export declare const updateLearnProgress: (sectionId: string, learnProgressInput: LearnProgressInput, options?: RequestInit) => Promise<LearnProgress>;
export declare const getUpdateLearnProgressMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateLearnProgress>>, TError, {
        sectionId: string;
        data: BodyType<LearnProgressInput>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateLearnProgress>>, TError, {
    sectionId: string;
    data: BodyType<LearnProgressInput>;
}, TContext>;
export type UpdateLearnProgressMutationResult = NonNullable<Awaited<ReturnType<typeof updateLearnProgress>>>;
export type UpdateLearnProgressMutationBody = BodyType<LearnProgressInput>;
export type UpdateLearnProgressMutationError = ErrorType<unknown>;
/**
* @summary Mark a "Apprendre à trader" section (and optional quiz result) as completed or not
*/
export declare const useUpdateLearnProgress: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateLearnProgress>>, TError, {
        sectionId: string;
        data: BodyType<LearnProgressInput>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateLearnProgress>>, TError, {
    sectionId: string;
    data: BodyType<LearnProgressInput>;
}, TContext>;
export declare const getGetAlertsUrl: () => string;
/**
 * @summary Get all price alerts
 */
export declare const getAlerts: (options?: RequestInit) => Promise<Alert[]>;
export declare const getGetAlertsQueryKey: () => readonly ["/api/alerts"];
export declare const getGetAlertsQueryOptions: <TData = Awaited<ReturnType<typeof getAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAlertsQueryResult = NonNullable<Awaited<ReturnType<typeof getAlerts>>>;
export type GetAlertsQueryError = ErrorType<unknown>;
/**
 * @summary Get all price alerts
 */
export declare function useGetAlerts<TData = Awaited<ReturnType<typeof getAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateAlertUrl: () => string;
/**
 * @summary Create a price alert
 */
export declare const createAlert: (alertInput: AlertInput, options?: RequestInit) => Promise<Alert>;
export declare const getCreateAlertMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAlert>>, TError, {
        data: BodyType<AlertInput>;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createAlert>>, TError, {
    data: BodyType<AlertInput>;
}, TContext>;
export type CreateAlertMutationResult = NonNullable<Awaited<ReturnType<typeof createAlert>>>;
export type CreateAlertMutationBody = BodyType<AlertInput>;
export type CreateAlertMutationError = ErrorType<unknown>;
/**
* @summary Create a price alert
*/
export declare const useCreateAlert: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAlert>>, TError, {
        data: BodyType<AlertInput>;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof createAlert>>, TError, {
    data: BodyType<AlertInput>;
}, TContext>;
export declare const getDeleteAlertUrl: (id: number) => string;
/**
 * @summary Delete a price alert
 */
export declare const deleteAlert: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteAlertMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAlert>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteAlert>>, TError, {
    id: number;
}, TContext>;
export type DeleteAlertMutationResult = NonNullable<Awaited<ReturnType<typeof deleteAlert>>>;
export type DeleteAlertMutationError = ErrorType<unknown>;
/**
* @summary Delete a price alert
*/
export declare const useDeleteAlert: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAlert>>, TError, {
        id: number;
    }, TContext>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteAlert>>, TError, {
    id: number;
}, TContext>;
export declare const getGetTriggeredAlertsUrl: (id: number) => string;
/**
 * @summary Get recently triggered alerts
 */
export declare const getTriggeredAlerts: (id: number, options?: RequestInit) => Promise<Alert>;
export declare const getGetTriggeredAlertsQueryKey: (id: number) => readonly [`/api/alerts/${number}/triggered`];
export declare const getGetTriggeredAlertsQueryOptions: <TData = Awaited<ReturnType<typeof getTriggeredAlerts>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTriggeredAlerts>>, TError, TData>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTriggeredAlerts>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTriggeredAlertsQueryResult = NonNullable<Awaited<ReturnType<typeof getTriggeredAlerts>>>;
export type GetTriggeredAlertsQueryError = ErrorType<unknown>;
/**
 * @summary Get recently triggered alerts
 */
export declare function useGetTriggeredAlerts<TData = Awaited<ReturnType<typeof getTriggeredAlerts>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTriggeredAlerts>>, TError, TData>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map