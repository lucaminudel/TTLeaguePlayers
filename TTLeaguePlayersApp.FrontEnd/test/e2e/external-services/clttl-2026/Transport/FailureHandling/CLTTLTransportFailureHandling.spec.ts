import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { ActiveSeasonDataSource } from '../../../../../../src/config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from '../../../../../../src/service/league-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLManagedClub2026PagesFetcher } from '../../../../../../src/service/league-season-processors/clttl-2026/CLTTLManagedClub2026PagesFetcher';
import { PageFetcherError } from '../../../../../../src/service/league-season-processors/clttl-2026/PageFetcherError';

type ResponseFault = 'http-error' | 'service-unavailable' | 'connection-abort';
type EndpointKind = 'fixtures' | 'club';

interface FailureContract {
    name: string;
    endpoint: EndpointKind;
    path: string;
    fault: ResponseFault;
    details: string;
}

const CALENDAR_PATH = '/CentralLondon/Fixtures/calendar.ics?d=9761';
const CLUB_PATH = '/CentralLondon/Clubs/Highbury';
const FAILURE_CONTRACTS: FailureContract[] = [
    {
        name: 'F calendar HTTP 500 text/plain becomes PageFetcherError preserving status 500',
        endpoint: 'fixtures', path: CALENDAR_PATH, fault: 'http-error',
        details: 'Details: HTTP error! status: 500'
    },
    {
        name: 'F calendar HTTP 200 HTML Service unavailable becomes PageFetcherError',
        endpoint: 'fixtures', path: CALENDAR_PATH, fault: 'service-unavailable',
        details: 'Details: Service unavailable'
    },
    {
        name: 'F calendar connection abort becomes PageFetcherError preserving fetch failure',
        endpoint: 'fixtures', path: CALENDAR_PATH, fault: 'connection-abort',
        details: 'Details: fetch failed'
    },
    {
        name: 'C club HTML connection abort becomes PageFetcherError preserving fetch failure',
        endpoint: 'club', path: CLUB_PATH, fault: 'connection-abort',
        details: 'Details: fetch failed'
    }
];

function dataSourceAt(baseUrl: string): ActiveSeasonDataSource {
    return {
        league: 'CLTTL',
        season: '2026-2027',
        custom_processor: 'CLTTLActiveSeason2026Processor',
        custom_club_processor: 'CLTTLManagedClub2026Processor',
        registrations_start_date: 1788220800,
        ratings_end_date: 1814400000,
        division_fixtures: [{ 'Division 4': `${baseUrl}${CALENDAR_PATH}` }],
        division_players: [],
        club_teams: [{ 'Highbury Table Tennis Club': `${baseUrl}${CLUB_PATH}` }]
    };
}

// Local HTTP faults exercise the real fetchers and Node transport; live availability is covered separately.
test.describe('CLTTL external transport failure contracts', () => {
    for (const contract of FAILURE_CONTRACTS) {
        test(contract.name, async () => {
            const observedRequests: { method: string | undefined; path: string | undefined }[] = [];
            const server = createServer((request, response) => {
                observedRequests.push({ method: request.method, path: request.url });
                if (contract.fault === 'connection-abort') {
                    request.socket.destroy();
                    return;
                }
                if (contract.fault === 'http-error') {
                    response.writeHead(500, { 'Content-Type': 'text/plain' });
                    response.end('Internal server error');
                    return;
                }
                response.writeHead(200, { 'Content-Type': 'text/html' });
                response.end('<!DOCTYPE html><html><body>Service unavailable</body></html>');
            });

            try {
                await new Promise<void>((resolve, reject) => {
                    server.once('error', reject);
                    server.listen(0, '127.0.0.1', resolve);
                });
                const address = server.address();
                if (!address || typeof address === 'string') throw new Error('Expected local HTTP server TCP address');
                const baseUrl = `http://127.0.0.1:${String(address.port)}`;
                const dataSource = dataSourceAt(baseUrl);
                const request = contract.endpoint === 'fixtures'
                    ? new CLTTLActiveSeason2026PagesFetcher(dataSource).getTeamFixtures('Division 4')
                    : new CLTTLManagedClub2026PagesFetcher(dataSource).getClubTeams('Highbury Table Tennis Club');
                let failure: unknown;
                try {
                    await request;
                } catch (error) {
                    failure = error;
                }

                expect(failure).toBeInstanceOf(PageFetcherError);
                expect((failure as PageFetcherError).message).toContain('not available after 3 attempts');
                expect((failure as PageFetcherError).message).toContain(`${baseUrl}${contract.path}`);
                expect((failure as PageFetcherError).message).toContain(contract.details);
                expect(observedRequests).toEqual(Array.from({ length: 3 }, () => ({ method: 'GET', path: contract.path })));
            } finally {
                await new Promise<void>((resolve, reject) => {
                    server.close(error => { if (error) reject(error); else resolve(); });
                    server.closeAllConnections();
                });
            }
        });
    }
});
