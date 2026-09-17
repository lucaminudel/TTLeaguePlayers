import { withSWR } from '../../utils/CacheUtils';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export class ActiveSeasonProcessorWithLocalStorageCache implements ActiveSeasonProcessor {
    private CACHE_DURATION_MS = 72 * 60 * 60 * 1000; // 72 hours
    private DOUBLE_EXPIRATION_MS = 2 * this.CACHE_DURATION_MS; // 6 days

    private realProcessor: ActiveSeasonProcessor;

    // The factory supplies the identity prefix (cache_<league>_<season>_<division>_<team>); this
    // class appends one suffix per method so that two methods never share a localStorage entry -
    // withSWR stores {timestamp, data} and cannot tell a Fixture[] from a string[].
    private fixturesCacheKey: string;
    private playersCacheKey: string;

    constructor(
        realProcessor: ActiveSeasonProcessor,
        cacheKeyPrefix: string
    ) {
        this.realProcessor = realProcessor;
        this.fixturesCacheKey = `${cacheKeyPrefix}_fixtures`;
        this.playersCacheKey = `${cacheKeyPrefix}_players`;
    }

    async getTeamFixtures(): Promise<Fixture[]> {
        return withSWR(
            this.fixturesCacheKey,
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

    async getTeamPlayers(): Promise<string[]> {
        // No transformer: a string[] round-trips JSON unchanged.
        return withSWR(
            this.playersCacheKey,
            () => this.realProcessor.getTeamPlayers(),
            {
                freshDurationMs: this.CACHE_DURATION_MS,
                staleDurationMs: this.DOUBLE_EXPIRATION_MS
            }
        );
    }
}
