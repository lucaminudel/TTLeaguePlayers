import { inviteApi } from './inviteApi';
import type {
    TeamRegistrationEntry,
    TeamRegistrationsRequest,
    TeamRegistrationsResponse
} from '../types/invite';
import { invalidateCache, withSWR } from '../utils/CacheUtils';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const CACHE_CONFIG = {
    TEAM_REGISTRATIONS: {
        freshDurationMs: ONE_DAY,
        staleDurationMs: 6 * ONE_DAY,
    }
};

export const INVITE_CACHE_PREFIX = 'invite_cache_';

/**
 * Cached version of getTeamRegistrations.
 */
export async function getCachedTeamRegistrations(
    request: TeamRegistrationsRequest,
    onDataUpdate?: (data: TeamRegistrationsResponse) => void
): Promise<TeamRegistrationsResponse> {
    const cacheKey = `${INVITE_CACHE_PREFIX}registrations_${request.league}_${request.season}_${request.club_location}_${request.club_name}`;

    discardCachedEntryThatCannotAnswer(cacheKey, request);

    const response = await withSWR(
        cacheKey,
        () => inviteApi.getTeamRegistrations(request),
        CACHE_CONFIG.TEAM_REGISTRATIONS,
        undefined,
        onDataUpdate
    );

    return projectOntoRequestedTeams(response, request);
}

function discardCachedEntryThatCannotAnswer(cacheKey: string, request: TeamRegistrationsRequest): void {
    const cachedTeamNames = readCachedTeamNames(cacheKey);
    if (cachedTeamNames === null) {
        return;
    }

    const coversEveryRequestedTeam = request.team_names.every((name) => cachedTeamNames.has(name));

    if (!coversEveryRequestedTeam) {
        invalidateCache(cacheKey);
    }
}

function readCachedTeamNames(cacheKey: string): Set<string> | null {
    const raw = localStorage.getItem(cacheKey);
    if (raw === null) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) {
        return null;
    }
    const data: unknown = (parsed as { data: unknown }).data;

    if (typeof data !== 'object' || data === null || !('teams' in data)) {
        return null;
    }
    const teams: unknown = (data as { teams: unknown }).teams;

    if (!Array.isArray(teams)) {
        return null;
    }

    const names = new Set<string>();
    for (const team of teams as unknown[]) {
        if (typeof team === 'object' && team !== null && 'team_name' in team) {
            const name: unknown = (team as { team_name: unknown }).team_name;
            if (typeof name === 'string') {
                names.add(name);
            }
        }
    }
    return names;
}

function projectOntoRequestedTeams(
    response: TeamRegistrationsResponse,
    request: TeamRegistrationsRequest
): TeamRegistrationsResponse {
    const entriesByTeamName = new Map<string, TeamRegistrationEntry>(
        response.teams.map((entry) => [entry.team_name, entry])
    );

    const teams: TeamRegistrationEntry[] = [];
    for (const teamName of request.team_names) {
        const entry = entriesByTeamName.get(teamName);
        if (entry === undefined) {
            return response;
        }
        teams.push(entry);
    }

    return { ...response, teams };
}
