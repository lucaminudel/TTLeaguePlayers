import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLActiveSeason2025PagesFetcher } from './clttl-2025/CLTTLActiveSeason2025PagesFetcher';
import { CLTTLActiveSeason2025PagesParser } from './clttl-2025/CLTTLActiveSeason2025PagesParser';
import type { ManagedClubProcessor } from './ManagedClubProcessor';

export class CLTTLManagedClub2025Processor implements ManagedClubProcessor {
    private fetcher: CLTTLActiveSeason2025PagesFetcher;
    private parser: CLTTLActiveSeason2025PagesParser;
    private clubName: string;

    constructor(dataSource: ActiveSeasonDataSource, clubName: string, avoidCORS = false) {
        this.fetcher = new CLTTLActiveSeason2025PagesFetcher(dataSource, avoidCORS);
        this.parser = new CLTTLActiveSeason2025PagesParser();
        this.clubName = clubName;
    }

    /**
     * Fetches and parses the teams of the current club from the club's page.
     */
    public async getClubTeams(): Promise<string[]> {
        const html = await this.fetcher.getClubTeams(this.clubName);
        return this.parser.getClubTeams(html);
    }
}
