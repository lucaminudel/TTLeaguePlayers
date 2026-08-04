import { withSWR } from '../../utils/CacheUtils';
import type { ManagedClubProcessor } from './ManagedClubProcessor';

export class ManagedClubProcessorWithLocalStorageCache implements ManagedClubProcessor {
    private CACHE_DURATION_MS = 72 * 60 * 60 * 1000; // 72 hours
    private DOUBLE_EXPIRATION_MS = 2 * this.CACHE_DURATION_MS; // 6 days

    private realProcessor: ManagedClubProcessor;
    private cacheKey: string;

    constructor(
        realProcessor: ManagedClubProcessor,
        cacheKey: string
    ) {
        this.realProcessor = realProcessor;
        this.cacheKey = cacheKey;
    }

    async getClubTeams(): Promise<string[]> {
        // No deserialization step: the payload is plain strings, with no dates to rebuild.
        return withSWR(
            this.cacheKey,
            () => this.realProcessor.getClubTeams(),
            {
                freshDurationMs: this.CACHE_DURATION_MS,
                staleDurationMs: this.DOUBLE_EXPIRATION_MS
            }
        );
    }
}
