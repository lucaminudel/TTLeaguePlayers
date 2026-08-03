import { clubsApi, type ClubWithTournaments } from './clubsApi';
import { withSWR } from '../utils/CacheUtils';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

// The listing is identical for every visitor and carries no per-user data, so a public 24-hour
// fresh window keeps repeat visits instant while still surfacing new tournaments same-day. Club
// managers always see their own change immediately regardless of this window, because their write
// invalidates the cache (see clubsApi.ts).
const CACHE_CONFIG = {
    CLUBS_AND_TOURNAMENTS: {
        freshDurationMs: ONE_DAY,
        staleDurationMs: 6 * ONE_DAY,
    },
};

// Only GET /clubs is cached. getClub, getClubsWithTournamentsByLocation, getTournamentsForClub and
// getTournament stay uncached: they are per-manager working data read while editing, not the
// public listing, so a stale response there would be actively misleading rather than merely late.
export const CLUBS_CACHE_PREFIX = 'clubs_cache_';

/**
 * Cached version of clubsApi.getAllClubsWithTournaments.
 * There are no request parameters and the data is the same for every visitor, so a single fixed
 * cache key is used rather than one scoped per-request as the kudos caches are.
 */
export async function getCachedAllClubsWithTournaments(
    onDataUpdate?: (data: ClubWithTournaments[]) => void
): Promise<ClubWithTournaments[]> {
    const cacheKey = `${CLUBS_CACHE_PREFIX}all`;

    return withSWR(
        cacheKey,
        () => clubsApi.getAllClubsWithTournaments(),
        CACHE_CONFIG.CLUBS_AND_TOURNAMENTS,
        undefined,
        onDataUpdate
    );
}
