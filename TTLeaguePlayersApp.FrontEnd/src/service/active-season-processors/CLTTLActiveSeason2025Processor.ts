import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLActiveSeason2025PagesFetcher } from './clttl-2025/CLTTLActiveSeason2025PagesFetcher';
import { CLTTLActiveSeason2025PagesParser, type Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export class CLTTLActiveSeason2025Processor {
    private fetcher: CLTTLActiveSeason2025PagesFetcher;
    private parser: CLTTLActiveSeason2025PagesParser;
    private division: string;
    private team: string;

    constructor(dataSource: ActiveSeasonDataSource, division: string, team: string) {
        this.fetcher = new CLTTLActiveSeason2025PagesFetcher(dataSource);
        this.parser = new CLTTLActiveSeason2025PagesParser();
        this.division = division;
        this.team = team;
    }

    /**
     * Fetches and parses the teams list for the current division.
     */
    public async getTeams(): Promise<string[]> {
        const html = await this.fetcher.getTeams(this.division);
        return this.parser.getTeams(html);
    }

    /**
     * Fetches and parses the fixtures for the current division.
     */
    public async getTeamFixtures(): Promise<Fixture[]> {
        const html = await this.fetcher.getTeamFixtures(this.division);
        return this.getTeamFixturesFromHtml(html);
    }

    /**
     * Internal helper to allow testing parser result bubbling.
     */
    private getTeamFixturesFromHtml(html: string): Fixture[] {
        return this.parser.getTeamFixtures(html);
    }

    /**
     * Fetches the players for the current team.
     * Orchestrates multiple calls: gets team IDs first, finds current team ID, then fetches players.
     */
    public async getTeamPlayers(): Promise<string[]> {
        const allPlayersHtml = await this.fetcher.getTeamIds(this.division);
        const teamIds = this.parser.getTeamIds(allPlayersHtml);

        const teamEntry = teamIds.find(t => t.team.toLowerCase() === this.team.toLowerCase());
        if (!teamEntry) {
            throw new Error('Team "' + this.team + '" not found in division "' + this.division + '".');
        }

        const playersHtml = await this.fetcher.getTeamPlayers(this.division, teamEntry.id);
        return this.parser.getTeamPlayers(playersHtml);
    }
}
