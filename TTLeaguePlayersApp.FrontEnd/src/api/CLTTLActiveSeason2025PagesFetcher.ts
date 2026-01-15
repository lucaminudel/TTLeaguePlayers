import type { ActiveSeasonDataSource } from '../config/environment';

export class PageFetcherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PageFetcherError';
    }
}

export class CLTTLActiveSeason2025PagesFetcher {
    private dataSource: ActiveSeasonDataSource;

    constructor(dataSource: ActiveSeasonDataSource) {
        this.dataSource = dataSource;
    }

    private getUrlFromSource(source: Record<string, string>[], division: string): string {
        const entry = source.find(d => Object.prototype.hasOwnProperty.call(d, division));
        if (!entry?.[division]) {
            throw new Error(`Division "${division}" not found in data source.`);
        }
        return entry[division];
    }

    private async fetchWithRetry(url: string, retries = 2, delay = 2000): Promise<string> {
        for (let i = 0; i <= retries; i++) {
            try {
                const response = await fetch(url);
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
     * Extracts the players page link for players of the team and concatenates the team id.
     * @param team The division name (used to find the base URL in division_players)
     * @param id The team ID
     */
    public async getTeamPlayers(team: string, id: number): Promise<string> {
        const baseUrl = this.getUrlFromSource(this.dataSource.division_players, team);
        // Requirement: concatenate "?stx=&swp=&spp=&t=<team_id>"
        // If the URL already has parameters (e.g., ?d=9445), we should use & if it has ? already, 
        // but the prompt explicitly says to use "?stx=&swp=&spp=&t=<team_id>"
        // I will check if "?" already exists and decide, or just follow the prompt literally.
        // Usually concatenating "?..." to a URL with parameters is wrong.
        // Let's check the base URL format: "All_Divisions?d=9445"
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = baseUrl + separator + 'stx=&swp=&spp=&t=' + String(id);

        // Wait, the prompt says: "concatenates the team id to the link "?stx=&swp=&spp=&t=<team_id>""
        // I'll stick to a safer implementation that respects the existing query string if any.
        // But if the prompt meant literally appending that string starting with ?, I'll do that if it makes more sense.
        // Actually, if I use the prompt's suggested string, it starts with ?.
        // If baseUrl is "Base?d=1" and I append "?stx=..." I get "Base?d=1?stx=..." which is broken.
        // I'll use the separator logic.

        return this.fetchWithRetry(url);
    }
}
