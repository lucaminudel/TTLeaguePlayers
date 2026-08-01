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

const MANAGED_CLUB_FIELDS = ['league', 'season', 'club_name', 'club_location', 'manager_name'] as const;

function logManagedClubIntegrityIssue(message: string): void {
  console.error('❌ Page event log processing managed club:', new Error(message));
}

// Integrity issues are only logged, not filtered out: parseManagedClubsJson keeps returning
// every structurally-valid entry as before, so this is purely observability for malformed
// Cognito data (see FrontendActivelyManagedClubsDomainLogic.md for the underlying business rules).
function validateManagedClubsIntegrity(managedClubs: ManagedClub[]): void {
  managedClubs.forEach((club) => {
    MANAGED_CLUB_FIELDS.forEach((field) => {
      if (club[field].trim() === '') {
        logManagedClubIntegrityIssue(
          `Managed club has an empty "${field}" value. league="${club.league}", season="${club.season}", club_name="${club.club_name}", club_location="${club.club_location}".`
        );
      }
    });
  });

  const seenExactEntries = new Set<string>();
  managedClubs.forEach((club) => {
    const exactKey = `${club.league}|${club.season}|${club.club_name}|${club.club_location}`;
    if (seenExactEntries.has(exactKey)) {
      logManagedClubIntegrityIssue(
        `Duplicate managed club entry for league "${club.league}", season "${club.season}", club "${club.club_name}" at "${club.club_location}".`
      );
    } else {
      seenExactEntries.add(exactKey);
    }
  });

  const seenLeagueSeasons = new Set<string>();
  managedClubs.forEach((club) => {
    const leagueSeasonKey = `${club.league}|${club.season}`;
    if (seenLeagueSeasons.has(leagueSeasonKey)) {
      logManagedClubIntegrityIssue(
        `Multiple managed clubs found for the same league "${club.league}" and season "${club.season}".`
      );
    } else {
      seenLeagueSeasons.add(leagueSeasonKey);
    }
  });
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

    const managedClubs = parsed.reduce((acc: ManagedClub[], item: unknown) => {
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

    validateManagedClubsIntegrity(managedClubs);

    return managedClubs;
  } catch {
    return [];
  }
}
