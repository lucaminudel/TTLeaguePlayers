import { withSWR } from '../../utils/CacheUtils';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

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
        return withSWR(
            this.cacheKey,
            () => this.realProcessor.getTeamFixtures(),
            {
                freshDurationMs: this.CACHE_DURATION_MS,
                staleDurationMs: this.DOUBLE_EXPIRATION_MS
            },
            (data: Fixture[]) => {
                // Deserialize dates from JSON
                return data.map((f: Fixture) => ({
                    ...f,
                    startDateTime: new Date(f.startDateTime)
                }));
            }
        );
    }
}
