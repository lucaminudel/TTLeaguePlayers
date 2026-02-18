import { apiFetch } from './api';
import { getConfig } from '../config/environment';
import { invalidateCacheByPrefix } from '../utils/CacheUtils';
import { KUDOS_CACHE_PREFIX } from './cachedKudosApi';

export interface KudosRequest {
    league: string;
    season: string;
    teamDivision: string;
    teamName: string;
    personName: string;
    giverPersonSub: string;
    opponentTeam: string;
    matchDateTime: string;
    isHome: boolean;
    venue: string;
    kudosValue: number; // 1 (Positive), 0 (Neutral), -1 (Negative)
}

/**
 * Award kudos to an opponent team for a specific match.
 */
export async function awardKudos(request: KudosRequest): Promise<{ message: string }> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    const body = {
        league: request.league,
        season: request.season,
        division: request.teamDivision,
        giver_team: request.teamName,
        giver_person_name: request.personName,
        giver_person_sub: request.giverPersonSub,
        receiving_team: request.opponentTeam,
        match_date_time: Math.floor(new Date(request.matchDateTime).getTime() / 1000),
        home_team: request.isHome ? request.teamName : request.opponentTeam,
        away_team: request.isHome ? request.opponentTeam : request.teamName,
        venue: request.venue,
        kudos_value: request.kudosValue,
    };

    const response = await apiFetch<{ message: string }>(baseUrl, '/kudos', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    // Invalidate local cache on success
    invalidateCacheByPrefix(KUDOS_CACHE_PREFIX);

    return response;
}

export interface GetKudosRequest {
    league: string;
    season: string;
    teamDivision: string;
    teamName: string;
    giver_person_name?: string; // Added for log display purposes (readable version of the sub), not used by the API
    giverPersonSub?: string;
}

export interface KudosResponse {
    league: string;
    season: string;
    division: string; 
    receiving_team: string;
    home_team: string;
    away_team: string;
    match_date_time: number;
    giver_team: string;
    giver_person_name: string;
    giver_person_sub: string;
    kudos_value: number;
}

export interface KudosSummaryResponse {
    league: string;
    season: string;
    division: string;
    home_team: string;
    away_team: string;
    receiving_team: string;
    match_date_time: number;
    positive_kudos_count: number;
    neutral_kudos_count: number;
    negative_kudos_count: number;
    item_type: string;
}

export interface KudosStandingsEntry {
    team_name: string;
    count: number;
}

export interface KudosStandingsResponse {
    positive_kudos_table: KudosStandingsEntry[];
    neutral_kudos_table: KudosStandingsEntry[];
    negative_kudos_table: KudosStandingsEntry[];
}

export interface GetTeamKudosRequest {
    league: string;
    season: string;
    teamDivision: string;
    teamName: string;
}

export async function getKudos(request: GetKudosRequest): Promise<KudosResponse[]> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    const params = new URLSearchParams();
    if (request.giverPersonSub) {
        params.append('given_by', request.giverPersonSub);
    }
    if (request.giver_person_name) {
        params.append('giver_person_name', request.giver_person_name);
    }

    params.append('league', request.league);
    params.append('season', request.season);
    params.append('team_division', request.teamDivision);
    params.append('team_name', request.teamName);

    return apiFetch<KudosResponse[]>(baseUrl, `/kudos?${params.toString()}`, {
        method: 'GET',
    });
}

export async function getTeamKudos(request: GetTeamKudosRequest): Promise<KudosSummaryResponse[]> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    const params = new URLSearchParams();
    params.append('league', request.league);
    params.append('season', request.season);
    params.append('team_division', request.teamDivision);
    params.append('team_name', request.teamName);

    return apiFetch<KudosSummaryResponse[]>(baseUrl, `/kudos?${params.toString()}`, {
        method: 'GET',
    });
}

export interface GetKudosStandingsRequest {
    league: string;
    season: string;
    teamDivision: string;
}

export async function getKudosStandings(request: GetKudosStandingsRequest): Promise<KudosStandingsResponse> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    const params = new URLSearchParams();
    params.append('league', request.league);
    params.append('season', request.season);
    params.append('team_division', request.teamDivision);

    return apiFetch<KudosStandingsResponse>(baseUrl, `/kudos/standings?${params.toString()}`, {
        method: 'GET',
    });
}
