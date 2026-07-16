import { apiFetch, GeneralApiError } from './api';
import { getConfig } from '../config/environment';

export interface ClubInfo {
  location: string;
  club_name: string;
  homepage: string;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tournaments: unknown[];
}

export interface ClubInfoRequest {
  homepage: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
}

export interface TournamentInfo {
  tournament_name: string;
  tournament_info: string;
  instagram?: string | null;
  facebook?: string | null;
  start_date: number;
  end_date: number;
}

export interface TournamentRequest {
  tournament_info: string;
  instagram?: string;
  facebook?: string;
  start_date: number;
  end_date: number;
}

export interface ClubWithTournaments {
  location: string;
  club_name: string;
  homepage: string;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tournaments: TournamentInfo[];
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const clubsApi = {
  async getClub(location: string, clubName: string): Promise<ClubInfo | null> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;
    try {
      return await apiFetch<ClubInfo>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}`, {
        method: 'GET',
      });
    } catch (err) {
      if (err instanceof GeneralApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  async upsertClub(location: string, clubName: string, request: ClubInfoRequest): Promise<ClubInfo> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;
    const payload: Record<string, string> = {
      homepage: request.homepage,
    };

    if (request.instagram) {
      payload.instagram = request.instagram;
    }
    if (request.facebook) {
      payload.facebook = request.facebook;
    }
    if (request.youtube) {
      payload.youtube = request.youtube;
    }

    return await apiFetch<ClubInfo>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteClub(location: string, clubName: string): Promise<void> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    await apiFetch<unknown>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}`, {
      method: 'DELETE',
    });
  },

  async getAllClubsWithTournaments(): Promise<ClubWithTournaments[]> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    return await apiFetch<ClubWithTournaments[]>(baseUrl, '/clubs', {
      method: 'GET',
    });
  },

  async getClubsWithTournamentsByLocation(location: string): Promise<ClubWithTournaments[]> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    return await apiFetch<ClubWithTournaments[]>(baseUrl, `/clubs/${encodePathSegment(location)}`, {
      method: 'GET',
    });
  },

  async getTournament(location: string, clubName: string, tournamentName: string): Promise<TournamentInfo | null> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;
    try {
      return await apiFetch<TournamentInfo>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}/tournaments/${encodePathSegment(tournamentName)}`, {
        method: 'GET',
      });
    } catch (err) {
      if (err instanceof GeneralApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  async upsertTournament(location: string, clubName: string, tournamentName: string, request: TournamentRequest): Promise<TournamentInfo> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;
    const payload: Record<string, string | number> = {
      tournament_info: request.tournament_info,
      start_date: request.start_date,
      end_date: request.end_date,
    };

    if (request.instagram) {
      payload.instagram = request.instagram;
    }
    if (request.facebook) {
      payload.facebook = request.facebook;
    }

    return await apiFetch<TournamentInfo>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}/tournaments/${encodePathSegment(tournamentName)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteTournament(location: string, clubName: string, tournamentName: string): Promise<void> {
    const config = getConfig();
    const baseUrl = config.ApiGateWay.ApiBaseUrl;

    await apiFetch<unknown>(baseUrl, `/clubs/${encodePathSegment(location)}/${encodePathSegment(clubName)}/tournaments/${encodePathSegment(tournamentName)}`, {
      method: 'DELETE',
    });
  },
};
