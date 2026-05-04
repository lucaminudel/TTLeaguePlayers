import type { ActiveSeason, ManagedClub } from './AuthContextDefinition';

export function parseActiveSeasonsJson(value: string | null | undefined): ActiveSeason[] {
  if (!value || typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.reduce((acc: ActiveSeason[], item: unknown) => {
      if (!item || typeof item !== 'object') return acc;

      const record = item as Record<string, unknown>;
      const isValidBase = typeof record.league === 'string'
        && typeof record.season === 'string'
        && typeof record.team_name === 'string'
        && typeof record.team_division === 'string'
        && typeof record.person_name === 'string'
        && typeof record.role === 'string';

      if (isValidBase) {
        const latestKudos = Array.isArray(record.latest_kudos)
          ? (record.latest_kudos as unknown[]).filter((k): k is number => typeof k === 'number')
          : [];

        acc.push({
          league: record.league as string,
          season: record.season as string,
          team_name: record.team_name as string,
          team_division: record.team_division as string,
          person_name: record.person_name as string,
          role: record.role as string,
          latest_kudos: latestKudos
        });
      }
      return acc;
    }, []);
  } catch {
    return [];
  }
}

export function parseManagedClubsJson(value: string | null | undefined): ManagedClub[] {
  if (!value || typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.reduce((acc: ManagedClub[], item: unknown) => {
      if (!item || typeof item !== 'object') return acc;

      const record = item as Record<string, unknown>;
      const isValid = typeof record.league === 'string'
        && typeof record.season === 'string'
        && typeof record.club_name === 'string'
        && typeof record.club_location === 'string'
        && typeof record.manager_name === 'string';

      if (isValid) {
        acc.push({
          league: record.league as string,
          season: record.season as string,
          club_name: record.club_name as string,
          club_location: record.club_location as string,
          manager_name: record.manager_name as string
        });
      }
      return acc;
    }, []);
  } catch {
    return [];
  }
}
