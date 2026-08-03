import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCachedAllClubsWithTournaments, CLUBS_CACHE_PREFIX } from '../../../src/api/cachedClubsApi';
import type { ClubWithTournaments } from '../../../src/api/clubsApi';
import { setUnitFixedClockTime } from '../TestClockUtils';

const clubsApiMocks = vi.hoisted(() => ({
    getAllClubsWithTournaments: vi.fn(),
}));

vi.mock('../../../src/api/clubsApi', async () => {
    const actual = await vi.importActual<typeof import('../../../src/api/clubsApi')>('../../../src/api/clubsApi');
    return {
        ...actual,
        clubsApi: {
            ...actual.clubsApi,
            getAllClubsWithTournaments: clubsApiMocks.getAllClubsWithTournaments,
        },
    };
});

describe('cachedClubsApi', () => {
    const CACHE_KEY = `${CLUBS_CACHE_PREFIX}all`;

    const buildClub = (overrides: Partial<ClubWithTournaments> = {}): ClubWithTournaments => ({
        location: 'London',
        club_name: 'Battersea TTC',
        homepage: 'https://battersea.example.com',
        tournaments: [],
        ...overrides,
    });

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        setUnitFixedClockTime(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('cold start: fetches and caches the listing under a single fixed key', async () => {
        const listing = [buildClub()];
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue(listing);

        const result = await getCachedAllClubsWithTournaments();

        expect(result).toEqual(listing);
        expect(clubsApiMocks.getAllClubsWithTournaments).toHaveBeenCalledTimes(1);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        expect(cachedRaw).not.toBeNull();
        const cached = JSON.parse(cachedRaw ?? '{}') as { data: ClubWithTournaments[] };
        expect(cached.data).toEqual(listing);
    });

    it('within the 24-hour fresh window: returns cached data without calling the API again', async () => {
        setUnitFixedClockTime('2026-01-01T10:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 1' })]);
        await getCachedAllClubsWithTournaments();

        // 23 hours later — still within the 24h fresh window
        setUnitFixedClockTime('2026-01-02T09:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 2' })]);

        const result = await getCachedAllClubsWithTournaments();

        expect(result).toEqual([buildClub({ club_name: 'Version 1' })]);
        expect(clubsApiMocks.getAllClubsWithTournaments).toHaveBeenCalledTimes(1);
    });

    it('between 24 hours and 6 days: returns stale data immediately and refreshes in the background', async () => {
        setUnitFixedClockTime('2026-01-01T10:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 1' })]);
        await getCachedAllClubsWithTournaments();

        // 3 days later — stale, but within the 6-day revalidation window
        setUnitFixedClockTime('2026-01-04T10:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 2' })]);
        const onDataUpdate = vi.fn();

        const result = await getCachedAllClubsWithTournaments(onDataUpdate);

        expect(result).toEqual([buildClub({ club_name: 'Version 1' })]);

        await vi.waitUntil(() => onDataUpdate.mock.calls.length > 0);
        expect(onDataUpdate).toHaveBeenCalledWith([buildClub({ club_name: 'Version 2' })]);
        expect(clubsApiMocks.getAllClubsWithTournaments).toHaveBeenCalledTimes(2);

        const cachedRaw = localStorage.getItem(CACHE_KEY);
        const cached = JSON.parse(cachedRaw ?? '{}') as { data: ClubWithTournaments[] };
        expect(cached.data).toEqual([buildClub({ club_name: 'Version 2' })]);
    });

    it('past the 6-day stale window: awaits a fresh fetch rather than returning the expired entry', async () => {
        setUnitFixedClockTime('2026-01-01T10:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 1' })]);
        await getCachedAllClubsWithTournaments();

        // 7 days later — past the 6-day stale window entirely
        setUnitFixedClockTime('2026-01-08T10:00:00Z');
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub({ club_name: 'Version 2' })]);

        const result = await getCachedAllClubsWithTournaments();

        expect(result).toEqual([buildClub({ club_name: 'Version 2' })]);
        expect(clubsApiMocks.getAllClubsWithTournaments).toHaveBeenCalledTimes(2);
    });

    it('writes under the clubs_cache_ prefix, so prefix invalidation reaches it', async () => {
        clubsApiMocks.getAllClubsWithTournaments.mockResolvedValue([buildClub()]);

        await getCachedAllClubsWithTournaments();

        expect(CACHE_KEY.startsWith(CLUBS_CACHE_PREFIX)).toBe(true);
        expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
    });
});
