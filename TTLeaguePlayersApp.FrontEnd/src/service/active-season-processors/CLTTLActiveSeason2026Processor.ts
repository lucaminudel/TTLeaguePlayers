import type { ActiveSeasonDataSource } from '../../config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from './clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from './clttl-2026/CLTTLActiveSeason2026PagesParser';
import type { Fixture } from './ActiveSeasonProcessor';
import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';

export class CLTTLActiveSeason2026Processor implements ActiveSeasonProcessor {
    private fetcher: CLTTLActiveSeason2026PagesFetcher;
    private parser: CLTTLActiveSeason2026PagesParser;
    private division: string;
    private team: string;
    constructor(dataSource: ActiveSeasonDataSource, division: string, team: string, avoidCORS = false) {
        this.fetcher = new CLTTLActiveSeason2026PagesFetcher(dataSource, avoidCORS);
        this.parser = new CLTTLActiveSeason2026PagesParser();
        this.division = division;
        this.team = team;
    }


    /**
     * Fetches and parses the fixtures for the current division.
     */
    public async getTeamFixtures(): Promise<Fixture[]> {
        const html = await this.fetcher.getTeamFixtures(this.division);
        const allFixtures = this.parser.getTeamFixtures(html);

        return allFixtures
            .filter(f => f.homeTeam === this.team || f.awayTeam === this.team)
            .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
    }

    /**
     * Fetches and parses the teams list for the current division from the CLTTL league division's table page 
     * Currently, this method is not used in the application, but it can be useful for future features.
     */
    public async getTeams(): Promise<string[]> {
        const html = await this.fetcher.getTeams(this.division);
        return this.parser.getTeams(html);
    }

    /**
     * Fetches the players for the current team.
     * Orchestrates multiple calls: gets team IDs first, finds current team ID, then fetches players.
     */
    public async getTeamPlayers(): Promise<string[]> {
        const teamCheckerHtml = await this.fetcher.getTeamIds(this.division);
        const teamIds = this.parser.getTeamIds(teamCheckerHtml);

        const teamEntry = teamIds.find(t => t.team.toLowerCase() === this.team.toLowerCase());
        if (!teamEntry) {
            throw new Error('Team "' + this.team + '" not found in division "' + this.division + '".');
        }

        const playersApiResponse = await this.fetcher.getTeamPlayers(this.division, teamEntry.id);
        return this.parser.getTeamPlayers(playersApiResponse);
    }
}
