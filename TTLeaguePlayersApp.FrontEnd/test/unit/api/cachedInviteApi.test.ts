import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCachedTeamRegistrations, INVITE_CACHE_PREFIX } from '../../../src/api/cachedInviteApi';
import type { TeamRegistrationsRequest, TeamRegistrationsResponse } from '../../../src/types/invite';
import { setUnitFixedClockTime } from '../TestClockUtils';

const inviteApiMocks = vi.hoisted(() => ({
    getTeamRegistrations: vi.fn(),
}));

vi.mock('../../../src/api/inviteApi', async () => {
    const actual = await vi.importActual<typeof import('../../../src/api/inviteApi')>('../../../src/api/inviteApi');
    return {
        ...actual,
        inviteApi: {
            ...actual.inviteApi,
            getTeamRegistrations: inviteApiMocks.getTeamRegistrations,
        },
    };
});

describe('cachedInviteApi', () => {
    const request: TeamRegistrationsRequest = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Morpeth Table Tennis Club',
        club_location: 'London',
        team_names: ['Morpeth 9', 'Morpeth 10'],
    };

    const CACHE_KEY =
        `${INVITE_CACHE_PREFIX}registrations_CLTTL_2025-2026_London_Morpeth Table Tennis Club`;

    const buildResponse = (overrides: Partial<TeamRegistrationsResponse> = {}): TeamRegistrationsResponse => ({
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Morpeth Table Tennis Club',
        club_location: 'London',
        teams: [
            { team_name: 'Morpeth 9', status: 'ACCEPTED', accepted_at: 1786000000, nano_id: 'abcd1234' },
            { team_name: 'Morpeth 10', status: 'NOT_INVITED', accepted_at: null },
        ],
        ...overrides,
    });

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        setUnitFixedClockTime(undefined);
    });

    it('should fetch and cache on a miss', async () => {
        const response = buildResponse();
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(response);

        const result = await getCachedTeamRegistrations(request);

        expect(result).toEqual(response);
        expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
    });

    it('should serve from cache without refetching while fresh', async () => {
        setUnitFixedClockTime('2026-08-07T10:00:00Z');
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

        await getCachedTeamRegistrations(request);

        // 12 hours later — inside the 1 day fresh window.
        setUnitFixedClockTime('2026-08-07T22:00:00Z');
        const result = await getCachedTeamRegistrations(request);

        expect(result.teams).toHaveLength(2);
        expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
    });

    it('should serve stale data and refresh in the background after the fresh window', async () => {
        setUnitFixedClockTime('2026-08-01T10:00:00Z');
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

        await getCachedTeamRegistrations(request);

        // 3 days later — past 1 day fresh, inside 6 days stale.
        setUnitFixedClockTime('2026-08-04T10:00:00Z');
        const refreshed = buildResponse({
            teams: [{ team_name: 'Morpeth 9', status: 'PENDING', accepted_at: null, nano_id: 'zzzz9999' }],
        });
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(refreshed);

        const onDataUpdate = vi.fn();
        const result = await getCachedTeamRegistrations(request, onDataUpdate);

        // The stale value comes back immediately...
        expect(result.teams).toHaveLength(2);
        // ...and a refresh was triggered behind it.
        expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);

        await vi.waitFor(() => {
            expect(onDataUpdate).toHaveBeenCalledWith(refreshed);
        });
    });

    it('should refetch once the stale window has passed', async () => {
        setUnitFixedClockTime('2026-08-01T10:00:00Z');
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

        await getCachedTeamRegistrations(request);

        // 8 days later — beyond the 6 day stale window.
        setUnitFixedClockTime('2026-08-09T10:00:00Z');
        const refreshed = buildResponse({ teams: [] });
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(refreshed);

        const result = await getCachedTeamRegistrations(request);

        expect(result.teams).toEqual([]);
        expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
    });

    describe('cache key', () => {
        it('should be keyed on league, season, club location and club name', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);

            expect(Object.keys(localStorage)).toContain(CACHE_KEY);
        });

        // The team list is NOT part of the key: keying on it would leave a stale entry behind for
        // every variant of the list. There is one entry per club, and it is checked for fitness
        // instead — see the 'cached entry fitness' block below.
        it('should keep a single entry per club whatever the team list', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            await getCachedTeamRegistrations({ ...request, team_names: ['Morpeth 10', 'Morpeth 9'] });
            await getCachedTeamRegistrations({ ...request, team_names: ['Morpeth 9', 'Morpeth 11'] });

            expect(Object.keys(localStorage).filter(k => k.startsWith(INVITE_CACHE_PREFIX))).toHaveLength(1);
        });

        it('should not share a cache entry across seasons', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            await getCachedTeamRegistrations({ ...request, season: '2024-2025' });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
        });

        it('should not share a cache entry across clubs in the same location', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            await getCachedTeamRegistrations({ ...request, club_name: 'Apex Table Tennis Club' });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
        });

        // Two clubs can share a name in different towns, so location has to be part of the key.
        it('should not share a cache entry across locations for the same club name', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            await getCachedTeamRegistrations({ ...request, club_location: 'Brighton' });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
        });
    });

    // withSWR returns whatever it cached without looking at the request, so a cached response
    // computed for a different team list would break the endpoint's contract — one entry per
    // REQUESTED team, in the CALLER's order. The entry is checked for fitness before it is used.
    describe('cached entry fitness', () => {
        it('should reuse the entry when only the order of the team list changed', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            const result = await getCachedTeamRegistrations({
                ...request,
                team_names: ['Morpeth 10', 'Morpeth 9'],
            });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
            // Served from the cache, but re-ordered to match what THIS caller asked for.
            expect(result.teams.map(t => t.team_name)).toEqual(['Morpeth 10', 'Morpeth 9']);
        });

        // A team removed from the club. The cached entry still holds an answer for every team the
        // caller is now asking about, so it is served — without the surplus entry.
        it('should reuse the entry when a team was removed, dropping the surplus', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            const result = await getCachedTeamRegistrations({ ...request, team_names: ['Morpeth 9'] });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
            expect(result.teams.map(t => t.team_name)).toEqual(['Morpeth 9']);
        });

        // A team added to the club. THE point of this block: serving the fresh-but-unfit entry would
        // make the new team silently disappear from the page for up to a day.
        it('should discard the entry and refetch when a team was added', async () => {
            setUnitFixedClockTime('2026-08-07T10:00:00Z');
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);

            const withNewTeam = { ...request, team_names: ['Morpeth 9', 'Morpeth 10', 'Morpeth 11'] };
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse({
                teams: [
                    { team_name: 'Morpeth 9', status: 'ACCEPTED', accepted_at: 1786000000, nano_id: 'abcd1234' },
                    { team_name: 'Morpeth 10', status: 'NOT_INVITED', accepted_at: null },
                    { team_name: 'Morpeth 11', status: 'PENDING', accepted_at: null, nano_id: 'wxyz5678' },
                ],
            }));

            // One minute later — still well inside the 1 day fresh window, so freshness alone would
            // have served the stale entry. Fitness is what decides, not age.
            setUnitFixedClockTime('2026-08-07T10:01:00Z');
            const result = await getCachedTeamRegistrations(withNewTeam);

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
            expect(result.teams.map(t => t.team_name)).toEqual(['Morpeth 9', 'Morpeth 10', 'Morpeth 11']);
            expect(result.teams[2].status).toBe('PENDING');
        });

        // Matching is byte-exact, as it is in the backend, so a re-cased name is a DIFFERENT team and
        // the cached entry cannot answer for it.
        it('should discard the entry when a requested team differs only by case', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            await getCachedTeamRegistrations({ ...request, team_names: ['morpeth 9', 'Morpeth 10'] });

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(2);
        });

        it('should return one entry per requested team, in the requested order, on a cache hit', async () => {
            inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

            await getCachedTeamRegistrations(request);
            const cached = await getCachedTeamRegistrations(request);

            expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
            expect(cached.teams.map(t => t.team_name)).toEqual(request.team_names);
        });
    });

    it('should round-trip team names containing spaces and apostrophes', async () => {
        // Real configured names. They go through localStorage AND through the fitness check, which
        // compares them byte for byte — an apostrophe mangled either way would show up as a refetch.
        const awkwardlyNamedTeams = { ...request, team_names: ["St Katharine's Trust 2", 'AA Academy SJoA 1'] };
        const response = buildResponse({
            teams: [
                { team_name: "St Katharine's Trust 2", status: 'PENDING', accepted_at: null, nano_id: 'abcd1234' },
                { team_name: 'AA Academy SJoA 1', status: 'NOT_INVITED', accepted_at: null },
            ],
        });
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(response);

        await getCachedTeamRegistrations(awkwardlyNamedTeams);
        // Second call is served from the cache, i.e. from JSON that has been through localStorage.
        const cached = await getCachedTeamRegistrations(awkwardlyNamedTeams);

        expect(inviteApiMocks.getTeamRegistrations).toHaveBeenCalledTimes(1);
        expect(cached.teams[0].team_name).toBe("St Katharine's Trust 2");
        expect(cached.teams[1].team_name).toBe('AA Academy SJoA 1');
    });

    // accepted_at is always present on the wire and explicitly null when not accepted. JSON keeps a
    // null; it would drop an undefined, so this pins that the distinction survives the cache.
    it('should preserve a null accepted_at through the cache', async () => {
        inviteApiMocks.getTeamRegistrations.mockResolvedValue(buildResponse());

        await getCachedTeamRegistrations(request);
        const cached = await getCachedTeamRegistrations(request);

        expect(cached.teams[1].status).toBe('NOT_INVITED');
        expect(cached.teams[1].accepted_at).toBeNull();
        expect('accepted_at' in cached.teams[1]).toBe(true);
    });
});
