import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseActiveSeasonsJson, parseManagedClubsJson } from '../../../src/contexts/AuthContextParsers';

describe('parseActiveSeasonsJson', () => {
  it('returns empty array for null', () => {
    expect(parseActiveSeasonsJson(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseActiveSeasonsJson(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseActiveSeasonsJson('')).toEqual([]);
  });

  it('returns empty array for non-JSON string', () => {
    expect(parseActiveSeasonsJson('not json')).toEqual([]);
  });

  it('returns empty array for JSON object (not array)', () => {
    expect(parseActiveSeasonsJson('{"league":"A"}')).toEqual([]);
  });

  it('returns empty array for JSON number', () => {
    expect(parseActiveSeasonsJson('42')).toEqual([]);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseActiveSeasonsJson('[]')).toEqual([]);
  });

  it('parses a valid active season entry', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      team_name: 'Eagles',
      team_division: 'Division 1',
      person_name: 'Alice',
      role: 'player',
      latest_kudos: [10, 20]
    }]);

    expect(parseActiveSeasonsJson(input)).toEqual([{
      league: 'CLTTL',
      season: '2025-2026',
      team_name: 'Eagles',
      team_division: 'Division 1',
      person_name: 'Alice',
      role: 'player',
      latest_kudos: [10, 20]
    }]);
  });

  it('parses multiple valid entries', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Eagles',
        team_division: 'Division 1',
        person_name: 'Alice',
        role: 'player',
        latest_kudos: []
      },
      {
        league: 'BLTTL',
        season: '2024-2025',
        team_name: 'Hawks',
        team_division: 'Division 2',
        person_name: 'Bob',
        role: 'captain',
        latest_kudos: [5]
      }
    ]);

    const result = parseActiveSeasonsJson(input);
    expect(result).toHaveLength(2);
    expect(result[0].league).toBe('CLTTL');
    expect(result[1].league).toBe('BLTTL');
  });

  it('defaults latest_kudos to empty array when missing', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      team_name: 'Eagles',
      team_division: 'Division 1',
      person_name: 'Alice',
      role: 'player'
    }]);

    const result = parseActiveSeasonsJson(input);
    expect(result).toHaveLength(1);
    expect(result[0].latest_kudos).toEqual([]);
  });

  it('filters non-number values from latest_kudos', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      team_name: 'Eagles',
      team_division: 'Division 1',
      person_name: 'Alice',
      role: 'player',
      latest_kudos: [10, 'bad', null, 30]
    }]);

    const result = parseActiveSeasonsJson(input);
    expect(result[0].latest_kudos).toEqual([10, 30]);
  });

  it('skips entries missing required string fields', () => {
    const input = JSON.stringify([
      { league: 'CLTTL', season: '2025-2026', team_name: 'Eagles' },
      {
        league: 'BLTTL',
        season: '2024-2025',
        team_name: 'Hawks',
        team_division: 'Division 2',
        person_name: 'Bob',
        role: 'captain'
      }
    ]);

    const result = parseActiveSeasonsJson(input);
    expect(result).toHaveLength(1);
    expect(result[0].league).toBe('BLTTL');
  });

  it('skips null and non-object items in the array', () => {
    const input = JSON.stringify([
      null,
      42,
      'string',
      {
        league: 'CLTTL',
        season: '2025-2026',
        team_name: 'Eagles',
        team_division: 'Division 1',
        person_name: 'Alice',
        role: 'player'
      }
    ]);

    const result = parseActiveSeasonsJson(input);
    expect(result).toHaveLength(1);
  });
});

describe('parseManagedClubsJson', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('returns empty array for null', () => {
    expect(parseManagedClubsJson(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseManagedClubsJson(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseManagedClubsJson('')).toEqual([]);
  });

  it('returns empty array for non-JSON string', () => {
    expect(parseManagedClubsJson('not json')).toEqual([]);
  });

  it('returns empty array for JSON object (not array)', () => {
    expect(parseManagedClubsJson('{"club_name":"A"}')).toEqual([]);
  });

  it('returns empty array for JSON number', () => {
    expect(parseManagedClubsJson('42')).toEqual([]);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseManagedClubsJson('[]')).toEqual([]);
  });

  it('parses a valid managed club entry', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith'
    }]);

    expect(parseManagedClubsJson(input)).toEqual([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith'
    }]);
  });

  it('parses multiple valid entries', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      },
      {
        league: 'BLTTL',
        season: '2024-2025',
        club_name: 'Brighton TTC',
        club_location: 'Brighton',
        manager_name: 'Bob Jones'
      }
    ]);

    const result = parseManagedClubsJson(input);
    expect(result).toHaveLength(2);
    expect(result[0].club_name).toBe('London TTC');
    expect(result[1].club_name).toBe('Brighton TTC');
  });

  it('skips entries missing required string fields', () => {
    const input = JSON.stringify([
      { league: 'CLTTL', season: '2025-2026', club_name: 'London TTC' },
      {
        league: 'BLTTL',
        season: '2024-2025',
        club_name: 'Brighton TTC',
        club_location: 'Brighton',
        manager_name: 'Bob Jones'
      }
    ]);

    const result = parseManagedClubsJson(input);
    expect(result).toHaveLength(1);
    expect(result[0].club_name).toBe('Brighton TTC');
  });

  it('skips entries where a required field has a non-string type', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 123,
      club_location: 'London',
      manager_name: 'Alice Smith'
    }]);

    expect(parseManagedClubsJson(input)).toEqual([]);
  });

  it('skips null and non-object items in the array', () => {
    const input = JSON.stringify([
      null,
      42,
      'string',
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      }
    ]);

    const result = parseManagedClubsJson(input);
    expect(result).toHaveLength(1);
    expect(result[0].club_name).toBe('London TTC');
  });

  it('preserves extra fields without including them in the output', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith',
      extra_field: 'should be ignored'
    }]);

    const result = parseManagedClubsJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith'
    });
    expect(Object.keys(result[0])).toEqual(['league', 'season', 'club_name', 'club_location', 'manager_name']);
  });

  it('does not log an integrity issue for well-formed, non-conflicting entries', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      },
      {
        league: 'BLTTL',
        season: '2024-2025',
        club_name: 'Brighton TTC',
        club_location: 'Brighton',
        manager_name: 'Bob Jones'
      }
    ]);

    parseManagedClubsJson(input);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('logs an integrity issue for an empty required field but still includes the entry', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: '',
      club_location: 'London',
      manager_name: 'Alice Smith'
    }]);

    const result = parseManagedClubsJson(input);

    expect(result).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('empty "club_name"') as string })
    );
  });

  it('logs an integrity issue for a whitespace-only required field', () => {
    const input = JSON.stringify([{
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: '   '
    }]);

    parseManagedClubsJson(input);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('empty "manager_name"') as string })
    );
  });

  it('logs one integrity issue per empty field when multiple fields are empty', () => {
    const input = JSON.stringify([{
      league: '',
      season: '',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith'
    }]);

    parseManagedClubsJson(input);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('empty "league"') as string })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('empty "season"') as string })
    );
  });

  it('logs an integrity issue for an exact duplicate entry but still includes both entries', () => {
    const club = {
      league: 'CLTTL',
      season: '2025-2026',
      club_name: 'London TTC',
      club_location: 'London',
      manager_name: 'Alice Smith'
    };
    const input = JSON.stringify([club, club]);

    const result = parseManagedClubsJson(input);

    expect(result).toHaveLength(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('Duplicate managed club entry') as string })
    );
  });

  it('treats league+season+club_name+club_location matches as a duplicate entry even when manager_name differs', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      },
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Carol White'
      }
    ]);

    parseManagedClubsJson(input);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('Duplicate managed club entry') as string })
    );
  });

  it('logs an integrity issue when two different clubs share the same league and season', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      },
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Manchester TTC',
        club_location: 'Manchester',
        manager_name: 'Alice Smith'
      }
    ]);

    const result = parseManagedClubsJson(input);

    expect(result).toHaveLength(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ Page event log processing managed club:',
      expect.objectContaining({ message: expect.stringContaining('Multiple managed clubs found for the same league "CLTTL" and season "2025-2026"') as string })
    );
  });

  it('does not log a same-league-season issue when leagues differ', () => {
    const input = JSON.stringify([
      {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'London TTC',
        club_location: 'London',
        manager_name: 'Alice Smith'
      },
      {
        league: 'BLTTL',
        season: '2025-2026',
        club_name: 'Brighton TTC',
        club_location: 'Brighton',
        manager_name: 'Bob Jones'
      }
    ]);

    parseManagedClubsJson(input);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
