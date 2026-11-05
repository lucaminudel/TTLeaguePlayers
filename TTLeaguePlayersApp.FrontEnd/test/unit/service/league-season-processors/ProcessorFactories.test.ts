import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';

const activeConstructor = vi.hoisted(() => vi.fn(function ActiveProcessorMock() {
    return {
        getTeamFixtures: vi.fn().mockResolvedValue([]),
        getTeamPlayers: vi.fn().mockResolvedValue(['Player']),
    };
}));
const managedConstructor = vi.hoisted(() => vi.fn(function ManagedProcessorMock() {
    return { getClubTeams: vi.fn().mockResolvedValue([]) };
}));

vi.mock('../../../../src/service/league-season-processors/CLTTLActiveSeason2026Processor', () => ({
    CLTTLActiveSeason2026Processor: activeConstructor,
}));
vi.mock('../../../../src/service/league-season-processors/CLTTLManagedClub2026Processor', () => ({
    CLTTLManagedClub2026Processor: managedConstructor,
}));

import { createActiveSeasonProcessor } from '../../../../src/service/league-season-processors/ActiveSeasonProcessorFactory';
import { createManagedClubProcessor } from '../../../../src/service/league-season-processors/ManagedClubProcessorFactory';

const source = { league: 'League', season: 'Season' } as ActiveSeasonDataSource;

describe('processor factories', () => {
    beforeEach(() => {
        localStorage.clear();
        activeConstructor.mockClear();
        managedConstructor.mockClear();
    });

    it('constructs the registered active-season processor with default CORS behavior and method-specific cache keys', async () => {
        const processor = createActiveSeasonProcessor('CLTTLActiveSeason2026Processor', source, 'Division', 'Team');
        expect(activeConstructor).toHaveBeenCalledWith(source, 'Division', 'Team', false);

        await processor.getTeamPlayers();
        const cachedPlayers = localStorage.getItem('cache_League_Season_Division_Team_players');
        expect(cachedPlayers).not.toBeNull();
        expect(JSON.parse(cachedPlayers ?? '{}') as { data?: string[] }).toMatchObject({ data: ['Player'] });
        expect(localStorage.getItem('cache_League_Season_Division_Team_fixtures')).toBeNull();
    });

    it('forwards avoidCORS and rejects an unregistered active-season processor', () => {
        createActiveSeasonProcessor('CLTTLActiveSeason2026Processor', source, 'Division', 'Team', true);
        expect(activeConstructor).toHaveBeenCalledWith(source, 'Division', 'Team', true);
        expect(() => createActiveSeasonProcessor('Missing', source, 'Division', 'Team'))
            .toThrow('Active Season Processor "Missing" not present or registered.');
    });

    it('keys managed-club cache by location and club and rejects an unregistered processor', async () => {
        const processor = createManagedClubProcessor('CLTTLManagedClub2026Processor', source, 'Same Club', 'Town');
        expect(managedConstructor).toHaveBeenCalledWith(source, 'Same Club', false);

        await processor.getClubTeams();
        expect(localStorage.getItem('cache_club_League_Season_Town_Same Club')).not.toBeNull();
        expect(() => createManagedClubProcessor('Missing', source, 'Same Club', 'Town'))
            .toThrow('Managed Club Processor "Missing" not present or registered.');
    });
});
