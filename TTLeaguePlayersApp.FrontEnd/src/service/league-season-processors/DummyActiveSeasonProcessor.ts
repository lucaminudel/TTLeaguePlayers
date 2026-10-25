import type { ActiveSeasonProcessor } from './ActiveSeasonProcessor';
import type { Fixture } from './ActiveSeasonProcessor';

export class DummyActiveSeasonProcessor implements ActiveSeasonProcessor {
    public getTeamFixtures(): Promise<Fixture[]> {
        return Promise.resolve([]);
    }

    public getTeamPlayers(): Promise<string[]> {
        return Promise.resolve([]);
    }
}
