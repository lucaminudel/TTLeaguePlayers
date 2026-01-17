import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export interface ActiveSeasonProcessor {
    getTeamFixtures(): Promise<Fixture[]>;
}
