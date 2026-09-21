import type { ActiveSeasonDataSource } from '../../../config/environment';

export class PageFetcherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PageFetcherError';
    }
}

export class CLTTLActiveSeason2025PagesFetcher {
    private dataSource: ActiveSeasonDataSource;
    private corsAnyWherePrefix: string;

    constructor(dataSource: ActiveSeasonDataSource, avoidCORS = false) {
        this.dataSource = dataSource;
        this.corsAnyWherePrefix = avoidCORS ? "https://go.x2u.in/proxy?email=contact_us@ttleagueplayers.uk&apiKey=307a1c8f&url=" : "";
    }

    private getUrlFromSource(source: Record<string, string>[], key: string, entity = 'Division'): string {
        const entry = source.find(d => Object.prototype.hasOwnProperty.call(d, key));
        if (!entry?.[key]) {
            throw new Error(`${entity} "${key}" not found in data source.`);
        }
        return entry[key];
    }

    private async fetchWithRetry(url: string, retries = 2, delay = 2000): Promise<string> {
        // The proxy takes the target as its own url= query parameter, so the target must be encoded:
        // sent raw, its first "&" ends that parameter and every later one (divisionName, vm, t) is lost.
        const target = this.corsAnyWherePrefix ? this.corsAnyWherePrefix + encodeURIComponent(url) : url;
        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(target);
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + String(response.status));
                }
                const text = await response.text();
                if (text.toLowerCase().includes("service unavailable")) {
                    throw new Error("Service unavailable");
                }
                return text;
            } catch (error) {
                if (i === retries) {
                    throw new PageFetcherError('The page or website is not available after ' + String(retries + 1) + ' attempts: ' + url + '. Details: ' + (error as Error).message);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new PageFetcherError("Unreachable fetch state");
    }

    /**
     * Extracts the link of the table page for that division and downloads the HTML.
     */
    public async getTeams(division: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.division_tables, division);
        return this.fetchWithRetry(url);
    }

    /**
     * Extracts the fixtures page link for that division and downloads the HTML.
     */
    public async getTeamFixtures(division: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.division_fixtures, division);
        return this.fetchWithRetry(url);
    }

    /**
     * Extracts the players average page link for the division and downloads the HTML.
     */
    public async getTeamIds(division: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.division_players, division);
        return this.fetchWithRetry(url);
    }

    /**
     * Extracts the link of the page for that club and downloads the HTML.
     */
    public async getClubTeams(club: string): Promise<string> {
        const url = this.getUrlFromSource(this.dataSource.club_teams, club, 'Club');
        return this.fetchWithRetry(url);
    }

    /**
     * Downloads the division's players average page filtered to one team.
     * @param division The division name (key into division_players)
     * @param id The team id, as read from the division page's `select#filterTeam` by the parser's getTeamIds
     */
    public async getTeamPlayers(division: string, id: number): Promise<string> {
        const baseUrl = this.getUrlFromSource(this.dataSource.division_players, division);
        // The configured URL normally already carries a query string ("Averages?leagueName=...&divisionName=...")
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = baseUrl + separator + 't=' + String(id);

        return this.fetchWithRetry(url);
    }
}
