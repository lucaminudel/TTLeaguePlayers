import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedAllClubsWithTournaments } from '../../../src/api/cachedClubsApi';
import { getCachedTeamRegistrations, getCachedTeamPlayersRegistrations } from '../../../src/api/cachedInviteApi';
import { getCachedPlayerKudos, getCachedTeamKudos, getCachedKudosStandings, getCachedClubKudosStandings } from '../../../src/api/cachedKudosApi';
import { ActiveSeasonProcessorWithLocalStorageCache } from '../../../src/service/league-season-processors/ActiveSeasonProcessorWithLocalStorageCache';
import { ManagedClubProcessorWithLocalStorageCache } from '../../../src/service/league-season-processors/ManagedClubProcessorWithLocalStorageCache';
import type { Fixture } from '../../../src/service/league-season-processors/ActiveSeasonProcessor';
import type { ClubTeamWithDivision } from '../../../src/types/clubTeam';
import { setUnitFixedClockTime } from '../TestClockUtils';

const upstream = vi.hoisted(() => ({
    clubs: vi.fn(), registrations: vi.fn(), playerRegistrations: vi.fn(),
    playerKudos: vi.fn(), teamKudos: vi.fn(), standings: vi.fn(), clubStandings: vi.fn(),
}));
vi.mock('../../../src/api/clubsApi', () => ({ clubsApi: { getAllClubsWithTournaments: upstream.clubs } }));
vi.mock('../../../src/api/inviteApi', () => ({ inviteApi: {
    getTeamRegistrations: upstream.registrations, getTeamPlayersRegistrations: upstream.playerRegistrations,
} }));
vi.mock('../../../src/api/kudosApi', () => ({
    getKudos: upstream.playerKudos, getTeamKudos: upstream.teamKudos,
    getKudosStandings: upstream.standings, getClubKudosStandings: upstream.clubStandings,
}));

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-24T12:00:00Z');
const team = { league: 'L', season: 'S', teamDivision: 'D', teamName: 'T' };
const club = { league: 'L', season: 'S', club_location: 'Loc', club_name: 'C' };
const fixturesFetch = vi.fn<() => Promise<Fixture[]>>();
const playersFetch = vi.fn<() => Promise<string[]>>();
const clubFetch = vi.fn<() => Promise<ClubTeamWithDivision[]>>();
const processor = new ActiveSeasonProcessorWithLocalStorageCache({ getTeamFixtures: fixturesFetch, getTeamPlayers: playersFetch }, 'cache_L_S_D_T');
const clubProcessor = new ManagedClubProcessorWithLocalStorageCache({ getClubTeams: clubFetch }, 'cache_club_L_S_Loc_C');

function resource(name: string, key: string, freshHours: number, expiryDays: number, data: unknown,
    read: (onUpdate: (data: unknown) => void) => Promise<unknown>, fetcher: ReturnType<typeof vi.fn>) {
    return { name, key, freshHours, expiryDays, data, read: (onUpdate: (data: unknown) => void) => read(onUpdate), fetcher };
}
const resources = [
    resource('player kudos', 'kudos_cache_player_L_S_D_T_all', 2, 7, [], (cb) => getCachedPlayerKudos(team, cb), upstream.playerKudos),
    resource('team kudos', 'kudos_cache_team_L_S_D_T', 2, 7, [], (cb) => getCachedTeamKudos(team, cb), upstream.teamKudos),
    resource('division standings', 'kudos_cache_standings_L_S_D', 2, 7,
        { positive_kudos_table: [], neutral_kudos_table: [], negative_kudos_table: [] }, (cb) => getCachedKudosStandings(team, cb), upstream.standings),
    resource('club standings', 'kudos_cache_clubstandings_L_S_Loc_C', 2, 7,
        { ...club, teams: [] }, (cb) => getCachedClubKudosStandings({ ...club, teams: [] }, cb), upstream.clubStandings),
    resource('club registrations', 'invite_cache_registrations_L_S_Loc_C', 4, 10,
        { ...club, teams: [] }, (cb) => getCachedTeamRegistrations({ ...club, team_names: [] }, cb), upstream.registrations),
    resource('player registrations', 'invite_cache_players_L_S_D_T', 4, 10,
        { league: 'L', season: 'S', team_division: 'D', team_name: 'T', players: [] },
        (cb) => getCachedTeamPlayersRegistrations({ league: 'L', season: 'S', team_division: 'D', team_name: 'T', player_names: [] }, cb), upstream.playerRegistrations),
    resource('public listing', 'clubs_cache_all', 4, 10, [], getCachedAllClubsWithTournaments, upstream.clubs),
    resource('roster', 'cache_L_S_D_T_players', 12, 21, [], (cb) => processor.getTeamPlayers(cb), playersFetch),
    resource('fixtures', 'cache_L_S_D_T_fixtures', 24, 42, [{ startDateTime: new Date('2026-11-01T12:00:00Z'), homeTeam: 'Home', awayTeam: 'Away', venue: 'Hall', googleMapsUrl: null }], (cb) => processor.getTeamFixtures(cb), fixturesFetch),
    resource('club teams', 'cache_club_L_S_Loc_C', 24, 42, [], (cb) => clubProcessor.getClubTeams(cb), clubFetch),
];

beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    setUnitFixedClockTime(new Date(NOW).toISOString());
});
afterEach(() => { setUnitFixedClockTime(undefined); });

describe.each(resources)('$name resource window', (resource) => {
    it.each(['before fresh boundary', 'at fresh boundary', 'before expiry', 'at expiry'] as const)('%s', async (point) => {
        const freshAge = resource.freshHours * HOUR;
        const expiryAge = resource.expiryDays * DAY;
        const age = point === 'before fresh boundary' ? freshAge - 1
            : point === 'at fresh boundary' ? freshAge
            : point === 'before expiry' ? expiryAge - 1 : expiryAge;
        localStorage.setItem(resource.key, JSON.stringify({ timestamp: NOW - age, data: resource.data }));
        let resolveFetch!: (data: unknown) => void;
        resource.fetcher.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
        const onUpdate = vi.fn();
        let completed = false;
        const result = resource.read(onUpdate).then((data) => { completed = true; return data; });
        // Flush the wrapper/helper microtasks without resolving the network request.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(resource.fetcher).toHaveBeenCalledTimes(age < freshAge ? 0 : 1);
        expect(completed).toBe(age < expiryAge);
        expect(onUpdate).not.toHaveBeenCalled();
        if (age >= freshAge) resolveFetch(resource.data);
        expect(await result).toEqual(resource.data);
        if (age >= freshAge && age < expiryAge) {
            await vi.waitFor(() => { expect(onUpdate).toHaveBeenCalledWith(resource.data); });
        } else {
            expect(onUpdate).not.toHaveBeenCalled();
        }
    });
});

it.each([
    ['BACKEND_API_SHORT', 2, 7], ['BACKEND_API_MEDIUM', 4, 10], ['BACKEND_API_LONG', 24, 14],
    ['TT365_PROCESSOR_SHORT', 12, 21], ['TT365_PROCESSOR_MEDIUM', 24, 42], ['TT365_PROCESSOR_LONG', 24, 42],
] as const)('defines the requested policy %s', async (name, hours, days) => {
    vi.resetModules();
    const policies = await import('../../../src/utils/CacheWindows');
    expect(policies[name]).toEqual({ freshDurationMs: hours * HOUR, staleDurationMs: days * DAY });
});

it('projects refreshed club registrations onto the requested teams in order', async () => {
    const teams = ['One', 'Two', 'Removed'].map((team_name) => ({ team_name, status: 'NOT_INVITED', accepted_at: null }));
    const data = { ...club, teams };
    const request = { ...club, team_names: ['Two', 'One'] };
    upstream.registrations.mockResolvedValue(data);
    await getCachedTeamRegistrations(request);
    setUnitFixedClockTime(new Date(NOW + 4 * HOUR).toISOString());
    const update = vi.fn();
    await getCachedTeamRegistrations(request, update);
    await vi.waitFor(() => { expect(update).toHaveBeenCalledWith({ ...data, teams: [teams[1], teams[0]] }); });
});

it('projects refreshed club standings onto the requested teams in order', async () => {
    const teams = ['One', 'Two', 'Removed'].map((team_name) => ({ team_name, positive_count: 1, neutral_count: 0, negative_count: 0 }));
    const data = { ...club, teams };
    const request = { ...club, teams: ['Two', 'One'].map((team_name) => ({ team_name, team_division: 'D' })) };
    upstream.clubStandings.mockResolvedValue(data);
    await getCachedClubKudosStandings(request);
    setUnitFixedClockTime(new Date(NOW + 2 * HOUR).toISOString());
    const update = vi.fn();
    await getCachedClubKudosStandings(request, update);
    await vi.waitFor(() => { expect(update).toHaveBeenCalledWith({ ...data, teams: [teams[1], teams[0]] }); });
});

it('projects refreshed player registrations and drops unrequested never-invited players', async () => {
    const players = ['One', 'Two', 'Removed'].map((player_name) => ({ player_name, status: 'NOT_INVITED', accepted_at: null }));
    const data = { league: 'L', season: 'S', team_division: 'D', team_name: 'T', players };
    const request = { league: 'L', season: 'S', team_division: 'D', team_name: 'T', player_names: ['Two', 'One'] };
    upstream.playerRegistrations.mockResolvedValue(data);
    await getCachedTeamPlayersRegistrations(request);
    setUnitFixedClockTime(new Date(NOW + 4 * HOUR).toISOString());
    const update = vi.fn();
    await getCachedTeamPlayersRegistrations(request, update);
    await vi.waitFor(() => { expect(update).toHaveBeenCalledWith({ ...data, players: [players[1], players[0]] }); });
});
