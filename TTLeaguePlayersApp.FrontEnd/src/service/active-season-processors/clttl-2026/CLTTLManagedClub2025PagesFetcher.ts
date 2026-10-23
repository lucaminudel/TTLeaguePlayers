import type { ActiveSeasonDataSource } from '../../../config/environment';
import { CLTTLHttpTransport } from './CLTTLHttpTransport';

export class CLTTLManagedClub2025PagesFetcher {
    private dataSource: ActiveSeasonDataSource;
    private transport: CLTTLHttpTransport;

    constructor(dataSource: ActiveSeasonDataSource, avoidCORS = false) {
        this.dataSource = dataSource;
        this.transport = new CLTTLHttpTransport(avoidCORS);
    }

    public async getClubTeams(club: string): Promise<string> {
        const entry = this.dataSource.club_teams.find(source => Object.prototype.hasOwnProperty.call(source, club));
        const url = entry?.[club];
        if (!url) {
            throw new Error(`Club "${club}" not found in data source.`);
        }
        return this.transport.fetchText(url);
    }
}
