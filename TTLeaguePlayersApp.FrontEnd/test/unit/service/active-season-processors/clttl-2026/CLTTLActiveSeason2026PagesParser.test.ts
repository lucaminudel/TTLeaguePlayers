import { afterEach, describe, it, expect, vi } from 'vitest';
import { CLTTLActiveSeason2026PagesParser } from '../../../../../src/service/league-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser';
import fs from 'fs';
import path from 'path';

function readSnapshot(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, 'data', name), 'utf-8');
}

function calendarWithEvents(...events: string[]): string {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\n');
}

function fixtureEvent(uid: string, ...properties: string[]): string {
    return ['BEGIN:VEVENT', `UID:${uid}`, ...properties, 'END:VEVENT'].join('\n');
}

const validNeighbourEvent = fixtureEvent(
    'valid-neighbour@example.test',
    'DTSTART;TZID=Europe/London:20261009T184500',
    'SUMMARY:Morpeth 11 Jr v Morpeth 10 (Division 4)',
    'LOCATION:Morpeth School',
    'GEO:51.5311;-0.0821',
    'STATUS:CONFIRMED'
);

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('CLTTLActiveSeason2026PagesParser', () => {
    describe('getTeamFixtures', () => {
        it('normalizes CRLF, unfolds lines and parses parameterized four-digit dates', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const calendar = readSnapshot('division_fixtures.ics').replaceAll('\n', '\r\n');

            expect(parser.getTeamFixtures(calendar)).toEqual([
                {
                    startDateTime: new Date('2026-10-09T18:45:00.000Z'),
                    venue: 'Morpeth School',
                    googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=51.5311%2C-0.0821',
                    homeTeam: 'Morpeth 11 Jr',
                    awayTeam: 'Morpeth 10'
                },
                {
                    startDateTime: new Date('2026-12-03T18:45:00.000Z'),
                    venue: 'Bridge Academy',
                    googleMapsUrl: null,
                    homeTeam: 'Morpeth 9',
                    awayTeam: 'Highbury 3'
                }
            ]);
        });

        it('preserves London wall-clock values as UTC labels across BST and GMT dates', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(
                fixtureEvent(
                    'bst@example.test',
                    'DTSTART;TZID=Europe/London:20260924T191500',
                    'SUMMARY:Home One v Away One (Division 4)'
                ),
                fixtureEvent(
                    'gmt@example.test',
                    'DTSTART;TZID=Europe/London:20261203T191500',
                    'SUMMARY:Home Two v Away Two (Division 4)'
                )
            ));

            expect(fixtures.map(({ startDateTime }) => startDateTime)).toEqual([
                new Date('2026-09-24T19:15:00.000Z'),
                new Date('2026-12-03T19:15:00.000Z')
            ]);
        });

        it('decodes escaped team text and retains only the venue name before the first comma', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'escaped-text@example.test',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Team\\, Alpha v Team\\; Beta (Division 4)',
                'LOCATION:Hall\\; North\\\\East\\nRoom\\, Annex'
            )));

            expect(fixtures[0]).toMatchObject({
                homeTeam: 'Team, Alpha',
                awayTeam: 'Team; Beta',
                venue: 'Hall; North\\East\nRoom'
            });
        });

        it('retains only the first plain LOCATION segment as the venue label', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const [fixture] = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'plain-location@example.test',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                'LOCATION:Morpeth School, Morpeth Street, London, E2 0PS'
            )));

            expect(fixture.venue).toBe('Morpeth School');
        });

        it('matches calendar property names case-insensitively', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'case-insensitive@example.test',
                'dtstart;tzid=Europe/London:20261009T184500',
                'summary:Home v Away (Division 4)',
                'location:Venue',
                'geo:51.5311;-0.0821'
            )));

            expect(fixtures[0]).toEqual({
                startDateTime: new Date('2026-10-09T18:45:00.000Z'),
                venue: 'Venue',
                googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=51.5311%2C-0.0821',
                homeTeam: 'Home',
                awayTeam: 'Away'
            });
        });

        it.each([
            ['missing', []],
            ['invalid', ['GEO:not-coordinates']],
            ['a coordinate prefix', ['GEO:prefix51.5311;-0.0821']],
            ['a coordinate suffix', ['GEO:51.5311;-0.0821suffix']],
            ['a trailing decimal point', ['GEO:51.;-0.0821']],
            ['a non-numeric first decimal coordinate', ['GEO:.not-a-number;-0.0821']],
            ['a non-numeric second decimal coordinate', ['GEO:51.5311;.not-a-number']],
            ['a latitude below -90', ['GEO:-90.001;0']],
            ['a latitude above 90', ['GEO:90.001;0']],
            ['a longitude below -180', ['GEO:0;-180.001']],
            ['a longitude above 180', ['GEO:0;180.001']]
        ])('keeps a fixture with %s GEO and returns a null Maps URL', (_caseName, geoProperty) => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'optional-geo@example.test',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                'LOCATION:Venue',
                ...geoProperty
            )));

            expect(fixtures).toHaveLength(1);
            expect(fixtures[0].googleMapsUrl).toBeNull();
        });

        it.each([
            ['.12;-.34', 'https://www.google.com/maps/dir/?api=1&destination=.12%2C-.34'],
            ['1;.12', 'https://www.google.com/maps/dir/?api=1&destination=1%2C.12'],
        ])('accepts valid abbreviated decimal GEO coordinates %s', (geo, expectedUrl) => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const [fixture] = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                `abbreviated-geo-${geo}@example.test`,
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                `GEO:${geo}`
            )));

            expect(fixture.googleMapsUrl).toBe(expectedUrl);
        });

        it('accepts GEO values on all valid coordinate boundaries', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(
                fixtureEvent(
                    'negative-positive-boundary-geo@example.test',
                    'DTSTART;TZID=Europe/London:20261009T184500',
                    'SUMMARY:Home v Away (Division 4)',
                    'GEO:-90;180'
                ),
                fixtureEvent(
                    'positive-negative-boundary-geo@example.test',
                    'DTSTART;TZID=Europe/London:20261009T184500',
                    'SUMMARY:Home v Away (Division 4)',
                    'GEO:90;-180'
                )
            ));

            expect(fixtures.map(({ googleMapsUrl }) => googleMapsUrl)).toEqual([
                'https://www.google.com/maps/dir/?api=1&destination=-90%2C180',
                'https://www.google.com/maps/dir/?api=1&destination=90%2C-180'
            ]);
        });

        it('uses an empty venue when LOCATION is absent', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'missing-location@example.test',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                'GEO:51.5311;-0.0821'
            )));

            expect(fixtures[0].venue).toBe('');
        });

        it('excludes cancelled, postponed and cancelled-postponed events while keeping a rescheduled event', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const fixtures = parser.getTeamFixtures(calendarWithEvents(
                fixtureEvent(
                    'cancelled@example.test',
                    'DTSTART;TZID=Europe/London:20261006T191500',
                    'SUMMARY:Highbury 3 v Apex 4 (Division 4)',
                    'STATUS:CANCELLED'
                ),
                fixtureEvent(
                    'postponed@example.test',
                    'DTSTART;TZID=Europe/London:20261007T191500',
                    'SUMMARY:Postponed: Highbury 3 v Apex 4 (Division 4)',
                    'STATUS:CONFIRMED'
                ),
                fixtureEvent(
                    'both@example.test',
                    'DTSTART;TZID=Europe/London:20261008T191500',
                    'SUMMARY:Postponed: Highbury 3 v Apex 4 (Division 4)',
                    'STATUS:CANCELLED'
                ),
                fixtureEvent(
                    'rescheduled@example.test',
                    'DTSTART;TZID=Europe/London:20261029T191500',
                    'SUMMARY:Highbury 3 v Apex 4 (Division 4)',
                    'STATUS:CONFIRMED'
                )
            ));

            expect(fixtures).toHaveLength(1);
            expect(fixtures[0]).toMatchObject({
                startDateTime: new Date('2026-10-29T19:15:00.000Z'),
                homeTeam: 'Highbury 3',
                awayTeam: 'Apex 4'
            });
        });

        it.each([
            {
                name: 'an incomplete event',
                uid: 'incomplete@example.test',
                invalidEvent: [
                    'BEGIN:VEVENT',
                    'UID:incomplete@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY:Home v Away (Division 4)'
                ].join('\n')
            },
            {
                name: 'an event with no date',
                uid: 'missing-date@example.test',
                invalidEvent: fixtureEvent(
                    'missing-date@example.test',
                    'SUMMARY:Home v Away (Division 4)'
                )
            },
            {
                name: 'an event with an invalid date',
                uid: 'invalid-date@example.test',
                invalidEvent: fixtureEvent(
                    'invalid-date@example.test',
                    'DTSTART;TZID=Europe/London:not-a-date',
                    'SUMMARY:Home v Away (Division 4)'
                )
            },
            ...[
                ['an overflowing month', '20261310T184500'],
                ['an overflowing day', '20261032T184500'],
                ['an overflowing hour', '20261010T244500'],
                ['an overflowing minute', '20261010T186000'],
                ['an overflowing second', '20261010T184560'],
                ['a date with a prefix', 'prefix20261010T184500'],
                ['a date with trailing text', '20261010T184500unexpected']
            ].map(([name, value]) => ({
                name,
                uid: `${value}@example.test`,
                invalidEvent: fixtureEvent(
                    `${value}@example.test`,
                    `DTSTART;TZID=Europe/London:${value}`,
                    'SUMMARY:Home v Away (Division 4)'
                )
            })),
            {
                name: 'an event without two teams',
                uid: 'invalid-summary@example.test',
                invalidEvent: fixtureEvent(
                    'invalid-summary@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY:Morpeth 10 (Division 4)'
                )
            },
            {
                name: 'an event without a home team',
                uid: 'missing-home@example.test',
                invalidEvent: fixtureEvent(
                    'missing-home@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY: v Morpeth 10 (Division 4)'
                )
            },
            {
                name: 'an event without an away team',
                uid: 'missing-away@example.test',
                invalidEvent: fixtureEvent(
                    'missing-away@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY:Morpeth 10 v  (Division 4)'
                )
            }
        ])('logs and skips $name without losing valid neighbours', ({ uid, invalidEvent }) => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2040-01-02T03:04:05.000Z'));
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const parser = new CLTTLActiveSeason2026PagesParser();

            const fixtures = parser.getTeamFixtures(calendarWithEvents(validNeighbourEvent, invalidEvent));

            expect(fixtures).toEqual([{
                startDateTime: new Date('2026-10-09T18:45:00.000Z'),
                venue: 'Morpeth School',
                googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=51.5311%2C-0.0821',
                homeTeam: 'Morpeth 11 Jr',
                awayTeam: 'Morpeth 10'
            }]);
            expect(fixtures.some(({ startDateTime }) => startDateTime.getTime() === Date.now())).toBe(false);
            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(consoleError.mock.calls)).toContain(uid);
        });

        it('includes the unusable-event reason in the observability diagnostic', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const parser = new CLTTLActiveSeason2026PagesParser();

            expect(() => parser.getTeamFixtures(calendarWithEvents(fixtureEvent(
                'invalid-summary-reason@example.test',
                'DTSTART;TZID=Europe/London:20261010T184500',
                'SUMMARY:Morpeth 10 (Division 4)'
            )))).toThrow();

            expect(consoleError).toHaveBeenCalledWith(
                'Skipping unusable CLTTL fixture event "invalid-summary-reason@example.test": invalid SUMMARY.'
            );
        });

        it('does not return a fixture when exactly one team is present in SUMMARY', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const parser = new CLTTLActiveSeason2026PagesParser();
            const calendar = calendarWithEvents(
                fixtureEvent(
                    'missing-home-direct@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY: v Morpeth 10 (Division 4)'
                ),
                fixtureEvent(
                    'missing-away-direct@example.test',
                    'DTSTART;TZID=Europe/London:20261010T184500',
                    'SUMMARY:Morpeth 10 v  (Division 4)'
                )
            );

            expect(() => parser.getTeamFixtures(calendar)).toThrow();
            expect(consoleError).toHaveBeenCalledTimes(2);
        });

        it('exposes exactly the five Fixture fields', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const [fixture] = parser.getTeamFixtures(calendarWithEvents(validNeighbourEvent));

            expect(Object.keys(fixture).sort()).toEqual(['awayTeam', 'googleMapsUrl', 'homeTeam', 'startDateTime', 'venue']);
        });

        it('returns an empty array when the calendar has no events', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();

            expect(parser.getTeamFixtures(calendarWithEvents())).toEqual([]);
        });

        it.each(['BEGIN:VCALENDAR', 'END:VCALENDAR'])('rejects a calendar missing %s', (delimiter) => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(() => parser.getTeamFixtures(calendarWithEvents().replace(delimiter, ''))).toThrow('Invalid fixtures calendar');
        });

        it('rejects an unmatched event ending unless there is a usable event', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(() => parser.getTeamFixtures(calendarWithEvents('END:VEVENT'))).toThrow('No usable fixture events in calendar');
            expect(parser.getTeamFixtures(calendarWithEvents('END:VEVENT', validNeighbourEvent))).toHaveLength(1);
        });

        it('rejects malformed calendars and calendars containing only unusable events', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(() => parser.getTeamFixtures('not a calendar')).toThrow();
            expect(() => parser.getTeamFixtures(calendarWithEvents('BEGIN:VEVENT\nUID:unfinished'))).toThrow();
            expect(parser.getTeamFixtures(calendarWithEvents(fixtureEvent('cancelled', 'STATUS:CANCELLED')))).toEqual([]);
        });

        it('normalizes bare carriage-return line endings', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const calendar = calendarWithEvents(validNeighbourEvent).replaceAll('\n', '\r');

            expect(parser.getTeamFixtures(calendar)).toHaveLength(1);
        });

        it('accepts trailing whitespace on VEVENT delimiters and ignores property lines without a colon', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const calendar = [
                'BEGIN:VCALENDAR',
                'BEGIN:VEVENT ',
                'UID:whitespace-delimiters@example.test',
                'this line has no property delimiter',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                'END:VEVENT ',
                'END:VCALENDAR',
            ].join('\n');

            expect(parser.getTeamFixtures(calendar)).toEqual([expect.objectContaining({
                homeTeam: 'Home',
                awayTeam: 'Away',
            })]);
        });

        it('logs an incomplete outer event while retaining a complete event that follows a nested delimiter', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const parser = new CLTTLActiveSeason2026PagesParser();
            const calendar = [
                'BEGIN:VCALENDAR',
                'BEGIN:VEVENT',
                'UID:outer-incomplete@example.test',
                'BEGIN:VEVENT',
                'UID:complete-inner@example.test',
                'DTSTART;TZID=Europe/London:20261009T184500',
                'SUMMARY:Home v Away (Division 4)',
                'END:VEVENT',
                'END:VCALENDAR',
            ].join('\n');

            expect(parser.getTeamFixtures(calendar)).toHaveLength(1);
            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(consoleError.mock.calls)).toContain('outer-incomplete@example.test');
        });
    });

    describe('getTeamPlayers', () => {
        it('should extract player names from the team checker API response', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const players = parser.getTeamPlayers(JSON.stringify({
                teamPlayers: [
                    { playerName: 'Luca Minudel' },
                    { name: 'Michele de Giovanni' },
                    { fullName: 'Dave Mesfin' }
                ],
                otherPlayers: [{ name: 'Other Eligible Player' }]
            }));

            expect(players).toEqual(['Luca Minudel', 'Michele de Giovanni', 'Dave Mesfin']);
        });

        it('supports a legacy bare array and rejects invalid JSON', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(parser.getTeamPlayers(JSON.stringify(['Luca Minudel', '']))).toEqual(['Luca Minudel']);
            expect(() => parser.getTeamPlayers('<html><body></body></html>')).toThrow();
        });

        it('distinguishes empty valid rosters from unsupported and unusable responses', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(parser.getTeamPlayers('{"teamPlayers":[]}')).toEqual([]);
            expect(() => parser.getTeamPlayers('{}')).toThrow();
            expect(() => parser.getTeamPlayers('{"teamPlayers":[{},null," "]}')).toThrow();
        });

        it('keeps only non-empty player names and trims each supported payload shape', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const players = parser.getTeamPlayers(JSON.stringify({
                teamPlayers: [
                    '  Luca Minudel  ',
                    '   ',
                    null,
                    42,
                    { playerName: '  Ada Lovelace  ' },
                    { name: '   ', fullName: '  Grace Hopper  ' },
                    { name: '  Michele de Giovanni  ' },
                ],
            }));

            expect(players).toEqual(['Luca Minudel', 'Ada Lovelace', 'Grace Hopper', 'Michele de Giovanni']);
        });
    });

    describe('getTeamIds', () => {
        it('should extract team names and IDs from the team checker html', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const teamIds = parser.getTeamIds(readSnapshot('division_all_players.html'));

            // Select order (alphabetical), scoped to the division. The empty "All Teams" option is skipped.
            expect(teamIds.length).toBe(11);
            expect(teamIds).toEqual([
                { team: 'Apex 4', id: 73246 },
                { team: 'Flick TTC 2', id: 73248 },
                { team: 'Fusion 5', id: 73149 },
                { team: 'Fusion 6 Jr', id: 73150 },
                { team: 'Highbury 2', id: 73245 },
                { team: 'Highbury 3', id: 73216 },
                { team: 'Irving 4', id: 73247 },
                { team: 'Morpeth 10', id: 73142 },
                { team: 'Morpeth 9', id: 73141 },
                { team: 'St Katharines Trust 6', id: 73160 },
                { team: 'Walworth Tigers', id: 73249 }
            ]);
        });

        it('should prefer the team checker teamSelect selector', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const teamIds = parser.getTeamIds('<select id="teamSelect"><option value="73142">Morpeth 10</option></select>');

            expect(teamIds).toEqual([{ team: 'Morpeth 10', id: 73142 }]);
        });

        it('rejects a missing team selector', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(() => parser.getTeamIds('<html><body></body></html>')).toThrow();
        });

        it('accepts a selector with only the default option', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            expect(parser.getTeamIds('<select id="teamSelect"><option value="">All Teams</option></select>')).toEqual([]);
        });

        it('ignores options whose value is not entirely numeric', () => {
            const parser = new CLTTLActiveSeason2026PagesParser();
            const teamIds = parser.getTeamIds(`
                <select id="teamSelect">
                    <option value="73142">Morpeth 10</option>
                    <option value="73142abc">Malformed suffix</option>
                    <option value="abc73142">Malformed prefix</option>
                    <option value="">All Teams</option>
                </select>
            `);

            expect(teamIds).toEqual([{ team: 'Morpeth 10', id: 73142 }]);
        });
    });

});
