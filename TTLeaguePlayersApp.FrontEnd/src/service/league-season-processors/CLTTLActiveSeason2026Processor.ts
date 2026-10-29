import { fetchAndParse } from './clttl-2026/TT365Diagnostics';
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
        const allFixtures = await fetchAndParse('getTeamFixtures',
            () => this.fetcher.getTeamFixtures(this.division),
            body => this.parser.getTeamFixtures(body), { division: this.division, team: this.team });

        return allFixtures
            .filter(f => f.homeTeam === this.team || f.awayTeam === this.team)
            .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
    }
    /**
     * Fetches the players for the current team.
     * Orchestrates multiple calls: gets team IDs first, finds current team ID, then fetches players.
     */
    public async getTeamPlayers(): Promise<string[]> {
        const teamIds = await fetchAndParse('getTeamIds',
            () => this.fetcher.getTeamIds(this.division),
            body => this.parser.getTeamIds(body), { division: this.division, team: this.team });

        const teamEntry = teamIds.find(t => t.team.toLowerCase() === this.team.toLowerCase());
        if (!teamEntry) {
            throw new Error('Team "' + this.team + '" not found in division "' + this.division + '".');
        }

        return fetchAndParse('getTeamPlayers',
            () => this.fetcher.getTeamPlayers(this.division, teamEntry.id),
            body => this.parser.getTeamPlayers(body), { division: this.division, team: this.team, teamId: teamEntry.id });
    }
}
