import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, stubbedTest, expect } from './helpers/tabletennis365-test-setup';
import { loadManifest, normalizedTarget, OutgoingNetworkAudit, resolveTableTennis365Target, TableTennis365Impersonator } from './helpers/tabletennis365-impersonator';

const calendarUrl = 'https://www.tabletennis365.com/CentralLondon/Fixtures/calendar.ics?d=9761';
const selectorUrl = 'https://www.tabletennis365.com/CentralLondon/Team/Eligibility';
const clubUrl = 'https://www.tabletennis365.com/CentralLondon/Clubs/Morpeth';
const proxyUrl = (target: string) => `https://go.x2u.in/proxy?url=${encodeURIComponent(target)}`;
const manifestPath = fileURLToPath(new URL('./data/tabletennis365-impersonator/manifest.json', import.meta.url));

interface LocalServer { url: string; requests: string[] }

const localTest = test.extend<{ localServer: LocalServer }>({
    localServer: async ({ browserName }, provide) => {
        if (browserName !== 'chromium') throw new Error('The independent network audit requires Chromium');
        const requests: string[] = [];
        const server = createServer((request, response) => {
            requests.push(request.url ?? '/');
            response.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
            response.end('local network response');
        });
        await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Local server did not bind a port');
        try { await provide({ url: `http://127.0.0.1:${String(address.port)}`, requests }); }
        finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
    }
});

const stubbedLocalTest = localTest.extend({ tableTennis365: 'stubbed' as const });

stubbedLocalTest('unrelated application traffic reaches its server unchanged while the stub is enabled', async ({ page, localServer, tableTennis365Stub }) => {
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), localServer.url + '/application-data')).toBe('local network response');
    expect(localServer.requests).toEqual(['/application-data']);
    expect(tableTennis365Stub.outcomes).toEqual([]);
});

stubbedLocalTest('unrelated POST requests still reach their server while the stub is enabled', async ({ page, localServer, tableTennis365Stub }) => {
    const result = await page.evaluate(url => fetch(url, { method: 'POST', body: 'application request' }).then(response => response.text()), localServer.url + '/application-post');
    expect(result).toBe('local network response');
    expect(localServer.requests).toEqual(['/application-post']);
    expect(tableTennis365Stub.outcomes).toEqual([]);
});

test('non-GET direct and proxied F P C requests abort even when the caller catches the error', async ({ context, page }) => {
    const stub = new TableTennis365Impersonator(context, await loadManifest(manifestPath));
    const audit = new OutgoingNetworkAudit(context);
    await audit.attachPage(page);
    await stub.install();
    stub.players.returnRoster({ team: 'Morpeth 10', teamId: 75706, players: ['Scenario Player'] });
    const expectedDiagnostics: string[] = [];
    try {
        const targets = [calendarUrl, selectorUrl, `${selectorUrl}?handler=Players&leagueId=4760&teamId=75706`, clubUrl];
        for (const method of ['POST', 'PUT', 'HEAD']) {
            for (const target of targets) {
                for (const url of [target, proxyUrl(target)]) {
                    const result = await page.evaluate(({ url, method }) => fetch(url, { method }).then(() => 'unexpected success', () => 'aborted'), { url, method });
                    expect(result, `${method} ${target}`).toBe('aborted');
                    expectedDiagnostics.push(`Unsupported TableTennis365 request method ${method}: ${target}`);
                }
            }
        }
        expect(stub.unexpected).toEqual(expectedDiagnostics);
        expect(stub.outcomes).toHaveLength(expectedDiagnostics.length);
        expect(stub.outcomes.every(outcome => outcome.outcome === 'unknown')).toBe(true);
        expect(audit.outgoing).toEqual([]);
    } finally {
        await stub.dispose();
        await audit.dispose();
    }
});

test('request identity preserves all parameters while ignoring their order', () => {
    const first = new URL(`${selectorUrl}?handler=Players&leagueId=4760&teamId=75706`);
    expect(normalizedTarget(first)).toBe(normalizedTarget(new URL(`${selectorUrl}?teamId=75706&handler=Players&leagueId=4760`)));
    for (const changed of ['teamId=75707', 'teamId=75706&extra=1', 'teamId=75706&teamId=75706']) {
        expect(normalizedTarget(new URL(`${selectorUrl}?handler=Players&leagueId=4760&${changed}`))).not.toBe(normalizedTarget(first));
    }
    expect(resolveTableTennis365Target(proxyUrl(first.href))).toEqual(resolveTableTennis365Target(first.href));
});

test('unrelated proxy traffic and lookalike website hosts stay outside the stub', () => {
    for (const url of ['https://example.com', 'https://tabletennis365.com.example.org/a', 'https://go.x2u.in/another-path', 'https://go.x2u.in/proxy', proxyUrl('https://example.com/a'), proxyUrl('not-a-url')]) {
        expect(resolveTableTennis365Target(url)).toEqual({ kind: 'unrelated' });
    }
    expect(resolveTableTennis365Target(`${proxyUrl(calendarUrl)}&url=${encodeURIComponent(clubUrl)}`).kind).toBe('invalid');
});

test('manifest validation rejects duplicate identities escaping body paths and invalid response status', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tt365-manifest-'));
    const path = join(directory, 'manifest.json');
    const entry = { url: calendarUrl, status: 200, contentType: 'text/calendar', bodyFile: 'body.txt', capturedAt: null, provenance: 'controlled local fixture' };
    try {
        await writeFile(join(directory, 'body.txt'), 'calendar body');
        await writeFile(path, JSON.stringify([entry, entry]));
        await expect(loadManifest(path)).rejects.toThrow('Duplicate');
        await writeFile(path, JSON.stringify([{ ...entry, bodyFile: '../outside.txt' }]));
        await expect(loadManifest(path)).rejects.toThrow('within its data directory');
        await writeFile(path, JSON.stringify([{ ...entry, status: 700 }]));
        await expect(loadManifest(path)).rejects.toThrow('manifest entry');
    } finally { await rm(directory, { recursive: true, force: true }); }
});

stubbedTest('direct and proxied F P C requests receive the matching saved response', async ({ page, tableTennis365Stub }) => {
    const results = await page.evaluate(async ({ calendarUrl, selectorUrl, clubUrl }) => {
        const calendar = await fetch(calendarUrl).then(response => response.text());
        const selector = await fetch(`https://go.x2u.in/proxy?url=${encodeURIComponent(selectorUrl)}`).then(response => response.text());
        const selected = new DOMParser().parseFromString(selector, 'text/html').querySelector('option[value="75706"]');
        const roster = await fetch(`${selectorUrl}?teamId=75706&leagueId=4760&handler=Players`).then(response => response.json()) as { teamPlayers: { id: number; name: string }[] };
        const club = await fetch(`https://go.x2u.in/proxy?url=${encodeURIComponent(clubUrl)}`).then(response => response.text());
        return { calendar: calendar.includes('BEGIN:VEVENT'), team: selected?.textContent, players: roster.teamPlayers, rows: new DOMParser().parseFromString(club, 'text/html').querySelectorAll('table.tt-contact-table tbody tr').length };
    }, { calendarUrl, selectorUrl, clubUrl });
    expect(results.calendar).toBe(true);
    expect(results.team).toBe('Morpeth 10');
    expect(results.players.length).toBeGreaterThan(0);
    for (const player of results.players) { expect(player.id).toBeGreaterThan(0); expect(player.name).toMatch(/\S/); }
    expect(results.rows).toBe(12);
    expect(tableTennis365Stub.outcomes.every(outcome => outcome.outcome === 'manifest')).toBe(true);
});

stubbedTest('named roster override keeps selector and JSON consistent and escapes player-independent HTML', async ({ page, tableTennis365Stub }) => {
    tableTennis365Stub.players.returnRoster({ team: 'Team <A> & B', teamId: 73142, players: ['Player One', 'Player Two'] });
    const result = await page.evaluate(async selectorUrl => {
        const html = await fetch(selectorUrl).then(response => response.text());
        const team = new DOMParser().parseFromString(html, 'text/html').querySelector('option[value="73142"]');
        const roster = await fetch(`${selectorUrl}?handler=Players&leagueId=4760&teamId=73142`).then(response => response.json()) as { teamPlayers: { id: number; name: string }[] };
        return { team: team?.textContent, players: roster.teamPlayers };
    }, selectorUrl);
    expect(result.team).toBe('Team <A> & B');
    expect(result.players).toEqual([{ id: 1, name: 'Player One' }, { id: 2, name: 'Player Two' }]);
});

stubbedTest('named fixture and club faults preserve HTTP failure service-unavailable and abort semantics', async ({ page, tableTennis365Stub }) => {
    tableTennis365Stub.fixtures.failWithHttpStatus(500);
    expect(await page.evaluate(url => fetch(url).then(response => response.status), calendarUrl)).toBe(500);
    tableTennis365Stub.fixtures.returnServiceUnavailable();
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), proxyUrl(calendarUrl))).toContain('Service unavailable');
    tableTennis365Stub.fixtures.failWithNetworkError();
    tableTennis365Stub.clubs.failWithNetworkError(clubUrl);
    for (const url of [calendarUrl, proxyUrl(clubUrl)]) {
        expect(await page.evaluate(url => fetch(url).then(() => 'unexpected success', () => 'aborted'), url)).toBe('aborted');
    }
});

stubbedTest('later page overrides take precedence and fallback reaches the shared response', async ({ page }) => {
    await page.route(url => url.hostname === 'www.tabletennis365.com', async route => {
        if (route.request().url() === clubUrl) await route.fulfill({ body: 'scenario club', headers: { 'access-control-allow-origin': '*' } });
        else await route.fallback();
    });
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), clubUrl)).toBe('scenario club');
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toContain('BEGIN:VCALENDAR');
});

test('unknown division team and extra-parameter targets abort even when the caller catches the error', async ({ context, page }) => {
    const stub = new TableTennis365Impersonator(context, await loadManifest(manifestPath));
    await stub.install();
    try {
        for (const url of [calendarUrl.replace('9761', '9999'), `${selectorUrl}?handler=Players&leagueId=4760&teamId=99999`, calendarUrl + '&unexpected=1']) {
            expect(await page.evaluate(url => fetch(url).then(() => 'unexpected success', () => 'caught'), proxyUrl(url))).toBe('caught');
        }
        expect(stub.unexpected).toHaveLength(3);
        expect(stub.outcomes.every(outcome => outcome.outcome === 'unknown')).toBe(true);
    } finally { await stub.dispose(); }
});

localTest('independent network audit detects deliberate continue but ignores fulfill and unrelated dispatch', async ({ context, page, localServer }) => {
    const audit = new OutgoingNetworkAudit(context, url => url.startsWith(localServer.url + '/protected'));
    await audit.attachPage(page);
    try {
        await page.route('**/protected-stub', route => route.fulfill({ body: 'static', headers: { 'access-control-allow-origin': '*' } }));
        await page.route('**/protected-escape', route => route.continue());
        const get = (path: string) => page.evaluate(url => fetch(url).then(response => response.text()), localServer.url + path);
        expect(await get('/protected-stub')).toBe('static');
        expect(audit.outgoing).toEqual([]);
        expect(await get('/unrelated')).toBe('local network response');
        expect(audit.outgoing).toEqual([]);
        expect(await get('/protected-escape')).toBe('local network response');
        await expect.poll(() => audit.outgoing).toEqual([{ target: localServer.url + '/protected-escape' }]);
        expect(localServer.requests).toEqual(['/unrelated', '/protected-escape']);
    } finally { await audit.dispose(); }
});

test('disposing the shared handler restores earlier routes and discards scenario overrides', async ({ context, page }) => {
    await context.route(calendarUrl, route => route.fulfill({ body: 'earlier handler', headers: { 'access-control-allow-origin': '*' } }));
    const stub = new TableTennis365Impersonator(context, await loadManifest(manifestPath));
    await stub.install();
    stub.fixtures.failWithHttpStatus(503);
    expect(await page.evaluate(url => fetch(url).then(response => response.status), calendarUrl)).toBe(503);
    await stub.dispose();
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toBe('earlier handler');
    await stub.install();
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toContain('BEGIN:VCALENDAR');
    await stub.dispose();
});

stubbedTest('additional pages and first popup navigation use the context stub', async ({ context, page, tableTennis365Stub }) => {
    const other = await context.newPage();
    expect(await other.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toContain('BEGIN:VCALENDAR');
    const popupPromise = context.waitForEvent('page');
    await page.evaluate(url => { window.open(url); }, clubUrl);
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    expect(await popup.locator('table.tt-contact-table tbody tr').count()).toBe(12);
    expect(tableTennis365Stub.outcomes.some(outcome => outcome.target === clubUrl)).toBe(true);
});

test.describe('explicit live opt-out', () => {
    test.use({ tableTennis365: 'live' });
    test('leaves existing browser routes untouched and installs no TT365 responses', async ({ page, tableTennis365Stub, tableTennis365NetworkAudit }) => {
        await page.route(calendarUrl, route => route.fulfill({ body: 'live-mode sentinel', headers: { 'access-control-allow-origin': '*' } }));
        expect(await page.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toBe('live-mode sentinel');
        expect(tableTennis365Stub.outcomes).toEqual([]);
        expect(tableTennis365NetworkAudit).toBeUndefined();
    });
});

test('a subsequent default-mode test inherits neither previous routes nor overrides', async ({ page, tableTennis365Stub, tableTennis365NetworkAudit }) => {
    await page.route(calendarUrl, route => route.fulfill({ body: 'new-context sentinel', headers: { 'access-control-allow-origin': '*' } }));
    expect(await page.evaluate(url => fetch(url).then(response => response.text()), calendarUrl)).toBe('new-context sentinel');
    expect(tableTennis365Stub.outcomes).toEqual([]);
    expect(tableTennis365NetworkAudit).toBeUndefined();
});
