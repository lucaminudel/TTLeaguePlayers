import type { ActiveSeasonDataSource } from '../../../config/environment';
import { CLTTLHttpTransport } from './CLTTLHttpTransport';

export { PageFetcherError } from './PageFetcherError';

export class CLTTLActiveSeason2026PagesFetcher {
    private dataSource: ActiveSeasonDataSource;
    private transport: CLTTLHttpTransport;

    constructor(dataSource: ActiveSeasonDataSource, avoidCORS = false) {
        this.dataSource = dataSource;
        this.transport = new CLTTLHttpTransport(avoidCORS);
    }

    private getUrlFromSource(source: Record<string, string>[], key: string, entity = 'Division'): string {
        const entry = source.find(d => Object.prototype.hasOwnProperty.call(d, key));
        if (!entry?.[key]) {
            throw new Error(`${entity} "${key}" not found in data source.`);
        }
        return entry[key];
    }

    public async getTeamFixtures(division: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.division_fixtures, division);
        return this.transport.fetchText(url);
    }

    /**
     * Downloads the team checker page. Its team selector is the source of team names and IDs.
     */
    public async getTeamIds(division: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.division_players, division);
        return this.transport.fetchText(url);
    }

    /**
     * Downloads the team checker API response for one team.
     * @param division The division name (key into division_players)
     * @param id The team id, as read from the team checker page's `select#teamSelect`
     */
    public async getTeamPlayers(division: string, id: number): Promise<string> {
        const baseUrl = this.getUrlFromSource(this.dataSource.division_players, division);
        const url = baseUrl + '?handler=Players&leagueId=4760&teamId=' + String(id);

        return this.transport.fetchText(url);
    }
}
