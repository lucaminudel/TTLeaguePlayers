import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLManagedClub2025PagesFetcher } from './clttl-2026/CLTTLManagedClub2025PagesFetcher';
import { CLTTLManagedClub2025PagesParser } from './clttl-2026/CLTTLManagedClub2025PagesParser';
import type { ManagedClubProcessor } from './ManagedClubProcessor';
import type { ClubTeamWithDivision } from '../../types/clubTeam';

export class CLTTLManagedClub2025Processor implements ManagedClubProcessor {
    private fetcher: CLTTLManagedClub2025PagesFetcher;
    private parser: CLTTLManagedClub2025PagesParser;
    private clubName: string;

    constructor(dataSource: ActiveSeasonDataSource, clubName: string, avoidCORS = false) {
        this.fetcher = new CLTTLManagedClub2025PagesFetcher(dataSource, avoidCORS);
        this.parser = new CLTTLManagedClub2025PagesParser();
        this.clubName = clubName;
    }

    /**
     * Fetches and parses the teams of the current club from the club's page, each with its division.
     */
    public async getClubTeams(): Promise<ClubTeamWithDivision[]> {
        const html = await this.fetcher.getClubTeams(this.clubName);
        return this.parser.getClubTeams(html);
    }
}
