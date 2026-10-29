import { fetchAndParse } from './clttl-2026/TT365Diagnostics';
import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLManagedClub2026PagesFetcher } from './clttl-2026/CLTTLManagedClub2026PagesFetcher';
import { CLTTLManagedClub2026PagesParser } from './clttl-2026/CLTTLManagedClub2026PagesParser';
import type { ManagedClubProcessor } from './ManagedClubProcessor';
import type { ClubTeamWithDivision } from '../../types/clubTeam';

export class CLTTLManagedClub2026Processor implements ManagedClubProcessor {
    private fetcher: CLTTLManagedClub2026PagesFetcher;
    private parser: CLTTLManagedClub2026PagesParser;
    private clubName: string;

    constructor(dataSource: ActiveSeasonDataSource, clubName: string, avoidCORS = false) {
        this.fetcher = new CLTTLManagedClub2026PagesFetcher(dataSource, avoidCORS);
        this.parser = new CLTTLManagedClub2026PagesParser();
        this.clubName = clubName;
    }

    /**
     * Fetches and parses the teams of the current club from the club's page, each with its division.
     */
    public async getClubTeams(): Promise<ClubTeamWithDivision[]> {
        return fetchAndParse('getClubTeams',
            () => this.fetcher.getClubTeams(this.clubName),
            body => this.parser.getClubTeams(body), { club: this.clubName });
    }
}
