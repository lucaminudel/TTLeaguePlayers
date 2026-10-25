import { TT365_PROCESSOR_SHORT, TT365_PROCESSOR_MEDIUM } from '../../utils/CacheWindows';
import { withSWR } from '../../utils/CacheUtils';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './ActiveSeasonProcessor';

export class ActiveSeasonProcessorWithLocalStorageCache implements ActiveSeasonProcessor {
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

    async getTeamFixtures(onDataUpdate?: (data: Fixture[]) => void): Promise<Fixture[]> {
        return withSWR(
            this.fixturesCacheKey,
            () => this.realProcessor.getTeamFixtures(),
            TT365_PROCESSOR_MEDIUM,
            (data: Fixture[]) => {
                // Deserialize dates from JSON
                return data.map((f: Fixture) => ({
                    ...f,
                    startDateTime: new Date(f.startDateTime)
                }));
            },
            onDataUpdate
        );
    }

    async getTeamPlayers(onDataUpdate?: (data: string[]) => void): Promise<string[]> {
        // No transformer: a string[] round-trips JSON unchanged.
        return withSWR(
            this.playersCacheKey,
            () => this.realProcessor.getTeamPlayers(),
            TT365_PROCESSOR_SHORT,
            undefined,
            onDataUpdate
        );
    }
}
