import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from './clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from './clttl-2026/CLTTLActiveSeason2026PagesParser';
import type { ManagedClubProcessor } from './ManagedClubProcessor';
import type { ClubTeamWithDivision } from '../../types/clubTeam';

export class CLTTLManagedClub2025Processor implements ManagedClubProcessor {
    private fetcher: CLTTLActiveSeason2026PagesFetcher;
    private parser: CLTTLActiveSeason2026PagesParser;
    private clubName: string;

    constructor(dataSource: ActiveSeasonDataSource, clubName: string, avoidCORS = false) {
        this.fetcher = new CLTTLActiveSeason2026PagesFetcher(dataSource, avoidCORS);
        this.parser = new CLTTLActiveSeason2026PagesParser();
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
