import { describe, it, expect } from 'vitest';
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
});
