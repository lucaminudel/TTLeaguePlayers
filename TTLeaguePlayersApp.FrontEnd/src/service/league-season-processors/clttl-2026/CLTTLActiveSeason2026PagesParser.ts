import type { Fixture } from '../ActiveSeasonProcessor';

type CalendarEvent = Map<string, string>;

function decodeCalendarText(value: string): string {
    return value.replace(/\\([\\,;nN])/g, (_escapedSequence, escapedCharacter: string) => {
        if (escapedCharacter.toLowerCase() === 'n') {
            return '\n';
        }
        return escapedCharacter;
    });
}

function parseCalendarDateTime(value: string | undefined): Date | null {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value ?? '');
    if (!match) {
        return null;
    }

    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
        || parsed.getUTCHours() !== hour
        || parsed.getUTCMinutes() !== minute
        || parsed.getUTCSeconds() !== second
    ) {
        return null;
    }

    return parsed;
}

function googleMapsUrlFromGeo(value: string | undefined): string | null {
    const match = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*;\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/.exec(value ?? '');
    if (!match) {
        return null;
    }

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return null;
    }

    const destination = encodeURIComponent(`${match[1]},${match[2]}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function venueNameFromLocation(value: string | undefined): string {
    return decodeCalendarText(value ?? '').split(',', 1)[0].trim();
}

function teamsFromSummary(value: string | undefined): { homeTeam: string; awayTeam: string } | null {
    const summary = decodeCalendarText(value ?? '').replace(/\s*\(Division\s+[^)]+\)\s*$/i, '').trim();
    const separatorIndex = summary.indexOf(' v ');
    if (separatorIndex < 0) {
        return null;
    }

    const homeTeam = summary.slice(0, separatorIndex).trim();
    const awayTeam = summary.slice(separatorIndex + 3).trim();
        return homeTeam && awayTeam ? { homeTeam, awayTeam } : null;
}

export class CLTTLActiveSeason2026PagesParser {
    public getTeamFixtures(fixturesCalendar: string): Fixture[] {
        if (!/^BEGIN:VCALENDAR\s*$/im.test(fixturesCalendar) || !/^END:VCALENDAR\s*$/im.test(fixturesCalendar)) {
            throw new Error('Invalid fixtures calendar');
        }
        const { events, incompleteCount } = this.parseCompleteCalendarEvents(fixturesCalendar);
        let rejectedCount = incompleteCount;
        const fixtures: Fixture[] = [];

        for (const event of events) {
            const summary = decodeCalendarText(event.get('SUMMARY') ?? '');
            if (event.get('STATUS')?.trim().toUpperCase() === 'CANCELLED' || summary.startsWith('Postponed:')) {
                continue;
            }

            const startDateTime = parseCalendarDateTime(event.get('DTSTART'));
            const teams = teamsFromSummary(event.get('SUMMARY'));
            if (!startDateTime || !teams) {
                this.reportUnusableEvent(event, !startDateTime ? 'missing or invalid DTSTART' : 'invalid SUMMARY');
                rejectedCount++;
                continue;
            }

            fixtures.push({
                startDateTime,
                venue: venueNameFromLocation(event.get('LOCATION')),
                googleMapsUrl: googleMapsUrlFromGeo(event.get('GEO')),
                ...teams
            });
        }

        if (fixtures.length === 0 && rejectedCount > 0) {
            throw new Error('No usable fixture events in calendar');
        }
        return fixtures;
    }

    private parseCompleteCalendarEvents(calendar: string): { events: CalendarEvent[]; incompleteCount: number } {
        const unfoldedLines = calendar
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .reduce<string[]>((lines, line) => {
                if (/^[ \t]/.test(line) && lines.length > 0) {
                    lines[lines.length - 1] += line.slice(1);
                } else {
                    lines.push(line);
                }
                return lines;
            }, []);

        const events: CalendarEvent[] = [];
        let eventLines: string[] | null = null;
        let incompleteCount = 0;

        for (const line of unfoldedLines) {
            const normalizedLine = line.trim().toUpperCase();
            if (normalizedLine === 'BEGIN:VEVENT') {
                if (eventLines) {
                    this.reportIncompleteEvent(eventLines);
                    incompleteCount++;
                }
                eventLines = [];
                continue;
            }

            if (normalizedLine === 'END:VEVENT') {
                if (eventLines) {
                    events.push(this.propertiesFromLines(eventLines));
                    eventLines = null;
                } else {
                    incompleteCount++;
                }
                continue;
            }

            if (eventLines) {
                eventLines.push(line);
            }
        }

        if (eventLines) {
            this.reportIncompleteEvent(eventLines);
            incompleteCount++;
        }

        return { events, incompleteCount };
    }

    private propertiesFromLines(lines: string[]): CalendarEvent {
        const properties: CalendarEvent = new Map();
        for (const line of lines) {
            const valueSeparator = line.indexOf(':');
            if (valueSeparator < 0) {
                continue;
            }

            const propertyName = line.slice(0, valueSeparator).split(';', 1)[0].trim().toUpperCase();
            properties.set(propertyName, line.slice(valueSeparator + 1));
        }
        return properties;
    }

    private reportIncompleteEvent(lines: string[]): void {
        this.reportUnusableEvent(this.propertiesFromLines(lines), 'incomplete VEVENT');
    }

    private reportUnusableEvent(event: CalendarEvent, reason: string): void {
        const identifier = [event.get('UID'), event.get('SUMMARY')]
            .find(candidate => candidate?.trim()) ?? 'unknown event';
        // Keep this diagnostic as the capture point when frontend observability is introduced.
        console.error(`Skipping unusable CLTTL fixture event "${identifier}": ${reason}.`);
    }

    /**
     * Extracts player names from the team checker API response.
     * The handler returns an object containing `teamPlayers` and `otherPlayers`; only
     * `teamPlayers` belongs in the team's roster.
     */
    public getTeamPlayers(playersApiResponse: string): string[] {
        let response: unknown;
        try {
            response = JSON.parse(playersApiResponse) as unknown;
        } catch (cause) {
            throw new Error('Invalid player response JSON', { cause });
        }

        const playerEntries = response && typeof response === 'object' && Array.isArray((response as { teamPlayers?: unknown }).teamPlayers)
            ? (response as { teamPlayers: unknown[] }).teamPlayers
            : response && typeof response === 'object' && Array.isArray((response as { players?: unknown }).players)
                ? (response as { players: unknown[] }).players
                : Array.isArray(response)
                    ? response
                    : null;

        if (!playerEntries) {
            throw new Error('Unsupported player response');
        }

        const players = playerEntries.flatMap((entry) => {
            if (typeof entry === 'string') {
                return entry.trim() ? [entry.trim()] : [];
            }
            if (!entry || typeof entry !== 'object') {
                return [];
            }

            const player = entry as { name?: unknown; playerName?: unknown; fullName?: unknown };
            const name = [player.playerName, player.name, player.fullName]
                .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

            return name ? [name.trim()] : [];
        });
        if (playerEntries.length > 0 && players.length === 0) {
            throw new Error('No usable players in response');
        }
        return players;
    }

    /**
     * Extracts the team ids from the team filter of the team checker page. The select lists
     * only that division's teams; the empty "All Teams" option is skipped.
     */
    public getTeamIds(teamCheckerHtmlPage: string): { team: string; id: number }[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(teamCheckerHtmlPage, 'text/html');
        // The team checker calls this control teamSelect. Keep the former averages-page ids as
        // fallbacks for older cached pages and fixtures.
        const teamSelect = doc.querySelector('select#teamSelect, select#teamId, select#filterTeam');

        if (!teamSelect) {
            throw new Error('Team selector missing');
        }

        const teamIds: { team: string; id: number }[] = [];

        const options = teamSelect.querySelectorAll('option');
        let candidateCount = 0;
        options.forEach((option) => {
            const idValue = option.getAttribute('value');
            if (idValue?.trim()) candidateCount++;
            if (idValue && /^\d+$/.test(idValue) && option.textContent.trim()) {
                teamIds.push({
                    team: option.textContent.trim(),
                    id: parseInt(idValue, 10)
                });
            }
        });

        if (candidateCount > 0 && teamIds.length === 0) {
            throw new Error('No usable teams in selector');
        }
        return teamIds;
    }

}
