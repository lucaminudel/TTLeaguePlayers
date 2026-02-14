import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { withSWR, invalidateCache, invalidateCacheByPrefix, type CacheEntry } from '../../../src/utils/CacheUtils';
import { setUnitFixedClockTime } from '../TestClockUtils';


describe('CacheUtils', () => {
    const CACHE_KEY = 'test_cache_key';
    const OPTIONS = {
        freshDurationMs: 1000,
        staleDurationMs: 5000,
    };

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Cold start: fetches and caches data', async () => {
        const fetcher = vi.fn().mockResolvedValue({ foo: 'bar' });

        const result = await withSWR(CACHE_KEY, fetcher, OPTIONS);

        expect(result).toEqual({ foo: 'bar' });
        expect(fetcher).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (!cachedRaw) throw new Error('Cache missing');
        const cached = JSON.parse(cachedRaw) as CacheEntry<{ foo: string }>;
        expect(cached.data).toEqual({ foo: 'bar' });
        expect(cached.timestamp).toBeDefined();
    });

    it('Fresh cache: returns data without fetching', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 500ms (still fresh)
        setUnitFixedClockTime('2025-01-01T10:00:00.500Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 1 });
        expect(fetcher2).not.toHaveBeenCalled();
    });

    it('Stale cache: returns stale data and fetches in background', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 2 seconds (stale, but within 5s window)
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 1 });

        // Wait for background refresh
        await vi.waitUntil(() => fetcher2.mock.calls.length > 0);
        expect(fetcher2).toHaveBeenCalledTimes(1);

        // Cache should be updated for next time
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (!cachedRaw) throw new Error('Cache missing');
        const cached = JSON.parse(cachedRaw) as CacheEntry<{ version: number }>;
        expect(cached.data).toEqual({ version: 2 });
    });

    it('Expired cache: fetches new data', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 10 seconds (expired)
        setUnitFixedClockTime('2025-01-01T10:00:10Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

        const result = await withSWR(CACHE_KEY, fetcher2, OPTIONS);

        expect(result).toEqual({ version: 2 });
        expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it('Invalidate individual key', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: 'test' }));
        invalidateCache(CACHE_KEY);
        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('Invalidate by prefix', () => {
        localStorage.setItem('prefix_1', 'val1');
        localStorage.setItem('prefix_2', 'val2');
        localStorage.setItem('other', 'val3');

        invalidateCacheByPrefix('prefix_');

        expect(localStorage.getItem('prefix_1')).toBeNull();
        expect(localStorage.getItem('prefix_2')).toBeNull();
        expect(localStorage.getItem('other')).toBe('val3');
    });

    it('Applies transformer function if provided', async () => {
        const fetcher = vi.fn().mockResolvedValue({ date: '2025-01-01T10:00:00Z' });
        const transformer = (data: { date: string | Date }) => ({ date: new Date(data.date) });

        const result = await withSWR<{ date: Date }>(
            CACHE_KEY,
            fetcher as unknown as () => Promise<{ date: Date }>,
            OPTIONS,
            transformer as unknown as (data: { date: Date }) => { date: Date }
        );

        expect(result.date).toBeInstanceOf(Date);
        expect(result.date.toISOString()).toBe('2025-01-01T10:00:00.000Z');

    });

    it('Stale cache: triggers onBackgroundUpdate callback with fresh data', async () => {
        setUnitFixedClockTime('2025-01-01T10:00:00Z');
        const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
        await withSWR(CACHE_KEY, fetcher1, OPTIONS);

        // Advance time by 2 seconds (stale)
        setUnitFixedClockTime('2025-01-01T10:00:02Z');
        const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });
        const onBackgroundUpdate = vi.fn();

        const result = await withSWR<{ version: number }>(CACHE_KEY, fetcher2, OPTIONS, undefined, onBackgroundUpdate);

        expect(result).toEqual({ version: 1 }); // Stale data returned immediately

        // Wait for background refresh and callback
        await vi.waitUntil(() => onBackgroundUpdate.mock.calls.length > 0);
        expect(onBackgroundUpdate).toHaveBeenCalledTimes(1);
        expect(onBackgroundUpdate).toHaveBeenCalledWith({ version: 2 });
    });
});
