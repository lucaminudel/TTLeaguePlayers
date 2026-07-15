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
};
