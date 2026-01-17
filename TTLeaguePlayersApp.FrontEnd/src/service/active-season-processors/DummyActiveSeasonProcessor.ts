import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './clttl-2025/CLTTLActiveSeason2025PagesParser';

export class DummyActiveSeasonProcessor implements ActiveSeasonProcessor {
    public getTeamFixtures(): Promise<Fixture[]> {
        return Promise.resolve([]);
    }
}
