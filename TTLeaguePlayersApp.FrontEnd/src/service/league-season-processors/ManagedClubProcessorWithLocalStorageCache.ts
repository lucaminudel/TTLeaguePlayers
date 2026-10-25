import { TT365_PROCESSOR_MEDIUM } from '../../utils/CacheWindows';
import { withSWR } from '../../utils/CacheUtils';
import type { ManagedClubProcessor } from './ManagedClubProcessor';
import type { ClubTeamWithDivision } from '../../types/clubTeam';

export class ManagedClubProcessorWithLocalStorageCache implements ManagedClubProcessor {
    private realProcessor: ManagedClubProcessor;
    private cacheKey: string;

    constructor(
        realProcessor: ManagedClubProcessor,
        cacheKey: string
    ) {
        this.realProcessor = realProcessor;
        this.cacheKey = cacheKey;
    }

    async getClubTeams(onDataUpdate?: (data: ClubTeamWithDivision[]) => void): Promise<ClubTeamWithDivision[]> {
        return withSWR(
            this.cacheKey,
            () => this.realProcessor.getClubTeams(),
            TT365_PROCESSOR_MEDIUM,
            undefined,
            onDataUpdate
        );
    }
}
