import { getClockTime } from './DateUtils';

export interface CacheEntry<T> {
    timestamp: number;
    data: T;
}

export interface SWROptions {
    freshDurationMs: number;
    staleDurationMs: number;
}

/**
 * Generic Stale-While-Revalidate cache utility using localStorage.
 */
export async function withSWR<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    options: SWROptions,
    transformer?: (data: T) => T, // Optional transformer for deserialization
    onBackgroundUpdate?: (data: T) => void // Callback for fresh data after a stale hit
): Promise<T> {
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        try {
            const parsed = JSON.parse(cached) as unknown;

            if (isValidCacheEntry(parsed)) {
                const now = getClockTime().getTime();
                const age = now - parsed.timestamp;

                let data = parsed.data as T;
                if (transformer) {
                    data = transformer(data);
                }

                if (age < options.freshDurationMs) {
                    // Case 1: Cache is fresh
                    return data;
                }

                if (age < options.staleDurationMs) {
                    // Case 2: Cache is stale but within revalidation window
                    // Return stale data immediately, trigger background refresh
                    void refreshCache(cacheKey, fetcher, onBackgroundUpdate).catch((err: unknown) => {
                        console.warn(`Background cache refresh failed for ${cacheKey}:`, err);
                    });
                    return data;
                }
            }
        } catch (e: unknown) {
            console.warn(`Error parsing cached data for ${cacheKey}:`, e);
            localStorage.removeItem(cacheKey);
        }
    }

    // Case 3: No cache or expired
    const data = await refreshCache(cacheKey, fetcher, onBackgroundUpdate);
    return transformer ? transformer(data) : data;
}

/**
 * Force clear a cache entry
 */
export function invalidateCache(cacheKey: string): void {
    localStorage.removeItem(cacheKey);
}

/**
 * Clear all cache entries matching a prefix
 */
export function invalidateCacheByPrefix(prefix: string): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => { localStorage.removeItem(key); });
}

async function refreshCache<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    onBackgroundUpdate?: (data: T) => void
): Promise<T> {
    const data = await fetcher();
    const entry: CacheEntry<T> = {
        timestamp: getClockTime().getTime(),
        data,
    };
    localStorage.setItem(cacheKey, JSON.stringify(entry));

    if (onBackgroundUpdate) {
        onBackgroundUpdate(data);
    }

    return data;
}

function isValidCacheEntry(obj: unknown): obj is CacheEntry<unknown> {
    return (
        !!obj &&
        typeof obj === 'object' &&
        'timestamp' in obj &&
        typeof (obj as Record<string, unknown>).timestamp === 'number' &&
        'data' in obj
    );
}
