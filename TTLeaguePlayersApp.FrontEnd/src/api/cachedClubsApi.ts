import { clubsApi, type ClubWithTournaments } from './clubsApi';
import { withSWR } from '../utils/CacheUtils';
import { BACKEND_API_MEDIUM } from '../utils/CacheWindows';

// Only the public GET /clubs listing is cached; manager editing reads stay uncached.
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
        BACKEND_API_MEDIUM,
        undefined,
        onDataUpdate
    );
}
