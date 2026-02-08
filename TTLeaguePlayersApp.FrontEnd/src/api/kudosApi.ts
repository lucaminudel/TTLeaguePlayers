import { apiFetch } from './api';
import { getConfig } from '../config/environment';

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

    return apiFetch<{ message: string }>(baseUrl, '/kudos', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
