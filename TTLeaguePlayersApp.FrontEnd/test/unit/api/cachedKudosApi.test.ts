import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClubKudosStandings, type ClubKudosStandingsRequest, type ClubKudosStandingsResponse } from '../../../src/api/kudosApi';
import { getCachedClubKudosStandings } from '../../../src/api/cachedKudosApi';
import { setUnitFixedClockTime } from '../TestClockUtils';

vi.mock('../../../src/api/kudosApi', () => ({
    getKudos: vi.fn(),
    getTeamKudos: vi.fn(),
    getKudosStandings: vi.fn(),
    getClubKudosStandings: vi.fn(),
}));

describe('cached club Kudos standings', () => {
    const KUDOS_CACHE_PREFIX = 'kudos_cache_';
    const request: ClubKudosStandingsRequest = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Walworth Table Tennis Club',
        club_location: 'London',
        teams: [
            { team_name: 'Walworth Tigers', team_division: 'Division 4' },
            { team_name: 'Walworth Lions', team_division: 'Division 2' },
        ],
    };
    const standings = (teamNames: string[]): ClubKudosStandingsResponse => ({
        league: request.league,
        season: request.season,
        club_name: request.club_name,
        club_location: request.club_location,
        teams: teamNames.map((team_name, index) => ({
            team_name,
            positive_count: index + 1,
            neutral_count: 2,
            negative_count: 0,
        })),
    });
    const cacheKey = `${KUDOS_CACHE_PREFIX}clubstandings_${request.league}_${request.season}_${request.club_location}_${request.club_name}`;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        setUnitFixedClockTime('2026-01-15T12:00:00Z');
    });

    it('projects a fresh club cache hit onto the requested teams in caller order', async () => {
        const cached = standings(['Walworth Tigers', 'Walworth Lions', 'Walworth Juniors']);
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: cached }));

        const result = await getCachedClubKudosStandings({
            ...request,
            teams: [...request.teams].reverse(),
        });

        expect(getClubKudosStandings).not.toHaveBeenCalled();
        expect(result.teams.map(({ team_name }) => team_name)).toEqual(['Walworth Lions', 'Walworth Tigers']);
    });

    it('refetches when a newly requested team is absent from the cached club standings', async () => {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: standings(['Walworth Tigers']) }));
        const expandedRequest = {
            ...request,
            teams: [...request.teams, { team_name: 'Walworth Juniors', team_division: 'Division 5' }],
        };
        const refreshed = standings(['Walworth Tigers', 'Walworth Lions', 'Walworth Juniors']);
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        const result = await getCachedClubKudosStandings(expandedRequest);

        expect(getClubKudosStandings).toHaveBeenCalledWith(expandedRequest);
        expect(result.teams.map(({ team_name }) => team_name)).toEqual([
            'Walworth Tigers', 'Walworth Lions', 'Walworth Juniors',
        ]);
    });

    it('keeps the backend response visible when it omits a requested team', async () => {
        const incompleteResponse = standings(['Walworth Tigers']);
        vi.mocked(getClubKudosStandings).mockResolvedValue(incompleteResponse);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(incompleteResponse);
    });

    it('evicts a cache entry with a malformed team list and refetches the club standings', async () => {
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: { league: request.league, season: request.season, club_name: request.club_name, club_location: request.club_location, teams: {} },
        }));
        const refreshed = standings(request.teams.map(({ team_name }) => team_name));
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(refreshed);

        expect(getClubKudosStandings).toHaveBeenCalledWith(request);
    });

    it('evicts an array cache containing a malformed team row before projection', async () => {
        const validTeams = standings(request.teams.map(({ team_name }) => team_name)).teams;
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: { ...standings(request.teams.map(({ team_name }) => team_name)), teams: [...validTeams, null] },
        }));
        const refreshed = standings(request.teams.map(({ team_name }) => team_name));
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(refreshed);

        expect(getClubKudosStandings).toHaveBeenCalledWith(request);
    });

    it.each(['positive_count', 'neutral_count', 'negative_count'])(
        'evicts a cached team row with an invalid %s before projection', async (countField) => {
        const cached = standings(request.teams.map(({ team_name }) => team_name));
        const malformedTeams = [
            { ...cached.teams[0], [countField]: 'invalid-count' },
            cached.teams[1],
        ];
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: { ...cached, teams: malformedTeams },
        }));
        const refreshed = standings(request.teams.map(({ team_name }) => team_name));
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(refreshed);

        expect(getClubKudosStandings).toHaveBeenCalledWith(request);
    });

    it.each([
        ['primitive row', 'invalid'],
        ['non-string team name', { team_name: 42, positive_count: 1, neutral_count: 2, negative_count: 0 }],
    ])('evicts a cached team list with a %s and refetches', async (_shape, malformedTeam) => {
        const cached = standings(request.teams.map(({ team_name }) => team_name));
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: { ...cached, teams: [...cached.teams, malformedTeam] },
        }));
        const refreshed = standings(request.teams.map(({ team_name }) => team_name));
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(refreshed);
        expect(getClubKudosStandings).toHaveBeenCalledWith(request);
    });

    it.each([
        ['invalid JSON', '{'],
        ['null envelope', 'null'],
        ['primitive envelope', '"not an envelope"'],
        ['array envelope', '[]'],
        ['missing data', JSON.stringify({ timestamp: Date.now() })],
        ['null data', JSON.stringify({ timestamp: Date.now(), data: null })],
        ['primitive data', JSON.stringify({ timestamp: Date.now(), data: 'not an object' })],
        ['null team list', JSON.stringify({ timestamp: Date.now(), data: { teams: null } })],
    ])('evicts a fresh cache entry with %s and refetches', async (_shape, raw) => {
        localStorage.setItem(cacheKey, raw);
        const refreshed = standings(request.teams.map(({ team_name }) => team_name));
        vi.mocked(getClubKudosStandings).mockResolvedValue(refreshed);

        await expect(getCachedClubKudosStandings(request)).resolves.toEqual(refreshed);

        expect(getClubKudosStandings).toHaveBeenCalledWith(request);
    });
});
