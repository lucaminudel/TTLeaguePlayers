import { getClockTime } from '../../utils/DateUtils';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export interface CacheEntry {
    timestamp: number;
    data: Fixture[];
}

export class ActiveSeasonProcessorWithLocalStorageCache implements ActiveSeasonProcessor {
    private CACHE_DURATION_MS = 72 * 60 * 60 * 1000; // 72 hours
    private DOUBLE_EXPIRATION_MS = 2 * this.CACHE_DURATION_MS; // 6 days

    private realProcessor: ActiveSeasonProcessor;
    private cacheKey: string;

    constructor(
        realProcessor: ActiveSeasonProcessor,
        cacheKey: string
    ) {
        this.realProcessor = realProcessor;
        this.cacheKey = cacheKey;
    }

    async getTeamFixtures(): Promise<Fixture[]> {
        const cached = localStorage.getItem(this.cacheKey);

        if (cached) {
            try {
                // Safely parse and narrow the type to avoid lint errors
                const parsed = JSON.parse(cached) as unknown;
                if (this.isCacheEntry(parsed)) {
                    const entry = parsed;
                    const age = getClockTime().getTime() - entry.timestamp;

                    // Helper to deserialize dates from JSON
                    const deserializeFixtures = (data: Fixture[]): Fixture[] => {
                        return data.map((f: Fixture) => ({
                            ...f,
                            startDateTime: new Date(f.startDateTime)
                        }));
                    };

                    if (age < this.CACHE_DURATION_MS) {
                        // Case 1: Cache is fresh (< 72h)
                        return deserializeFixtures(entry.data);
                    }

                    if (age < this.DOUBLE_EXPIRATION_MS) {
                        // Case 2: Cache is expired but within the "stale-while-revalidate" window (< 6 days)
                        // Return stale data immediately, but trigger background update
                        void this.refreshCache();
                        return deserializeFixtures(entry.data);
                    }
                }

                // Case 3: Cache is too old (> 6 days), treat as missing
            } catch (e) {
                console.warn('Error parsing cached fixtures:', e);
                localStorage.removeItem(this.cacheKey);
            }
        }

        // Case 4: No cache or very old cache -> Fetch, Cache, Return
        return this.refreshCache();
    }

    private isCacheEntry(obj: unknown): obj is CacheEntry {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'timestamp' in obj &&
            'data' in obj &&
            Array.isArray((obj as CacheEntry).data)
        );
    }

    private async refreshCache(): Promise<Fixture[]> {
        const data = await this.realProcessor.getTeamFixtures();
        localStorage.setItem(this.cacheKey, JSON.stringify({
            timestamp: getClockTime().getTime(),
            data: data
        }));
        return data;
    }
}
