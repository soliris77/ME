import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Alert, AlertInput, GetQuotesParams, HealthStatus, HistoricalPoint, MarketOverview, Quote, SearchResult, SearchSymbolsParams, WatchlistInput, WatchlistItem } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof addToWatchlist>>, TError, {
    data: BodyType<WatchlistInput>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof removeFromWatchlist>>, TError, {
    id: number;
}, TContext>;
export declare const getGetAlertsUrl: () => string;
/**
 * @summary Get all price alerts
 */
export declare const getAlerts: (options?: RequestInit) => Promise<Alert[]>;
export declare const getGetAlertsQueryKey: () => readonly ["/api/alerts"];
export declare const getGetAlertsQueryOptions: <TData = Awaited<ReturnType<typeof getAlerts>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAlerts>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
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
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map