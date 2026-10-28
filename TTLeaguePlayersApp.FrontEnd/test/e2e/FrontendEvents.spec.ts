import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { test, expect } from './helpers/tabletennis365-test-setup';
import { User } from './page-objects/User';

const execFileAsync = promisify(execFile);
const stagingUrl = process.env.STAGING_URL;
if (stagingUrl && new URL(stagingUrl).origin !== 'https://staging.ttleagueplayers.uk') {
    throw new Error('Frontend events staging checks require the known staging host');
}
const staging = stagingUrl !== undefined;
const environment = staging ? 'staging' : process.env.PORT === '4173' ? 'test' : 'dev';
const config = JSON.parse(readFileSync(new URL(`../../../config/${environment}.env.json`, import.meta.url), 'utf8')) as { ApiGateWay: { ApiBaseUrl: string } };
const endpoint = `${config.ApiGateWay.ApiBaseUrl}/frontend-events`;
const group = process.env.FRONTEND_EVENTS_LOG_GROUP ?? '/aws/lambda/ttleague-players-staging-ApiGatewayFunction-F81bzCOsgPQO';

function diagnostic(type: string, marker: string, body = '<raw>response</raw>') {
    return {
        event_id: marker, timestamp: '2026-10-27T12:00:00Z', event_category: type,
        client_api_type: 'TT365', operation: 'getTeamFixtures', event_name: 'synthetic failure',
        source: { file: 'fetch.ts', function: 'fetchPage', line: 12 },
        exception: { name: 'TypeError', message: marker, stackTrace: 'original stack' },
        request: { method: 'POST', url: 'https://example.test', headers: { 'X-Test': 'request' }, body: 'request body', body_original_length: 12, body_truncated: false },
        response: { status: 503, status_text: 'Unavailable', headers: { 'X-Test': 'response' }, body, body_original_length: Buffer.byteLength(body), body_truncated: false },
        user_claims: { sub: 'client-reported', extra: { roles: ['captain'], active: true } },
    };
}

test.describe('Frontend events endpoint', () => {
    test('real route supports CORS, valid diagnostics and validation', async ({ page, request }) => {
        test.skip(staging, 'Staging requires authentication and is covered below');
        const preflight = await request.fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
        expect(preflight.status()).toBe(200);
        expect(preflight.headers()['access-control-allow-methods']).toContain('POST');
        await page.goto('/');
        const results = await page.evaluate(async ({ url, error, warning }) => {
            const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const first = await post(error);
            const second = await post(warning);
            const invalid = await post({ ...error, client_api_type: "" });
            return { first: first.status, firstBody: await first.text(), second: second.status, invalid: invalid.status };
        }, { url: endpoint, error: diagnostic('FRONTEND_API_CALL_ERROR', 'local-error'), warning: diagnostic('FRONTEND_API_CALL_IRREGULAR', 'local-warning', 'x'.repeat(80 * 1024)) });
        expect(results.first).toBe(204);
        expect(results.firstBody).toBe('');
        expect(results.second).toBe(204);
        expect(results.invalid).toBe(400);
    });

    test('staging authorizer and CloudWatch preserve both diagnostics', async ({ page, request }) => {
        test.skip(!staging, 'Only the known staging host may run AWS checks');
        test.skip(process.env.EXECUTE_LIVE_COGNITO_TESTS !== 'true', 'Live Cognito login is disabled');
        test.setTimeout(150000);
        const unauthenticated = await request.post(endpoint, { data: diagnostic('FRONTEND_API_CALL_ERROR', 'missing-auth') });
        expect(unauthenticated.status()).toBe(401);
        const invalid = await request.post(endpoint, { headers: { Authorization: 'Bearer invalid' }, data: diagnostic('FRONTEND_API_CALL_ERROR', 'invalid-auth') });
        expect([401, 403]).toContain(invalid.status());
        await new User(page).navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');
        const token = await page.evaluate(() => {
            const key = Object.keys(localStorage).find(k => k.endsWith('.idToken'));
            return key ? localStorage.getItem(key) : null;
        });
        if (!token) throw new Error('Authenticated staging session has no ID token');
        const marker = `frontend-events-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
        const start = Date.now() - 5000;
        const largeBody = 'x'.repeat(80 * 1024);
        for (const [type, suffix, body] of [['FRONTEND_API_CALL_ERROR', 'error', '<raw>response</raw>'], ['FRONTEND_API_CALL_IRREGULAR', 'warning', largeBody]]) {
            const response = await request.post(endpoint, { headers: { Authorization: `Bearer ${token}` }, data: diagnostic(type, `${marker}-${suffix}`, body) });
            expect(response.status()).toBe(204);
            expect(await response.text()).toBe('');
        }
        interface Log {
            event_category: string; log_level: string; timestamp: string; event_name?: string;
            source?: { file: string; function: string };
            exception?: { message: string; stackTrace: string };
            parameters: {
                event_id: string; source: { file: string; function: string };
                request: { body: string; method: string; url: string; headers: Record<string, string> };
                response: { body: string; status: number; status_text: string; headers: Record<string, string> };
            };
            user_claims: { sub: string; extra: { roles: string[]; active: boolean } };
        }
        const found = new Map<string, Log>();
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline && found.size < 2) {
            let output: string;
            try {
                ({ stdout: output } = await execFileAsync('aws', ['logs', 'filter-log-events', '--log-group-name', group, '--start-time', String(start), '--filter-pattern', `"${marker}"`, '--output', 'json', '--region', 'eu-west-2', '--no-cli-pager', '--limit', '100'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }));
            } catch (error) { throw new Error(`CloudWatch polling failed; check AWS CLI and IAM access: ${String(error)}`); }
            const events = (JSON.parse(output) as { events: { message: string }[] }).events;
            for (const event of events) {
                const startJson = event.message.indexOf('{');
                if (startJson < 0) continue;
                try {
                    const log = JSON.parse(event.message.slice(startJson)) as Log;
                    if (typeof log.parameters.event_id === 'string' && log.parameters.event_id.startsWith(marker)) found.set(log.parameters.event_id, log);
                } catch { /* Other log messages may contain non-JSON prefixes. */ }
            }
            if (found.size < 2) await new Promise(resolve => setTimeout(resolve, 3000));
        }
        expect(found.size, 'Both emitted events must arrive in CloudWatch within 90 seconds').toBe(2);
        const error = found.get(`${marker}-error`);
        const warning = found.get(`${marker}-warning`);
        if (!error || !warning) throw new Error('CloudWatch did not contain both expected diagnostic IDs');
        expect(error.event_category).toBe('FRONTEND_API_CALL_ERROR');
        expect(error.log_level).toBe('ERROR');
        expect(warning.event_category).toBe('FRONTEND_API_CALL_IRREGULAR');
        expect(warning.log_level).toBe('WARN');
        expect(warning.event_name).toBe('synthetic failure');
        expect(warning.source?.file).toBe('fetch.ts');
        expect(error.timestamp).toContain('2026-10-27T12:00:00');
        expect(error.exception?.message).toBe(`${marker}-error`);
        expect(error.parameters.request.body).toBe('request body');
        expect(error.parameters.response.body).toBe('<raw>response</raw>');
        expect(warning.parameters.response.body).toBe(largeBody);
        expect(error.user_claims).toEqual({ sub: 'client-reported', extra: { roles: ['captain'], active: true } });
        expect(warning.user_claims).toEqual(error.user_claims);
        expect(error.parameters).not.toHaveProperty('user_claims');
        expect(warning.parameters).not.toHaveProperty('user_claims');
        expect(error).not.toHaveProperty('uploader_user_claims');
        expect(warning).not.toHaveProperty('uploader_user_claims');
        expect(warning.timestamp).toContain('2026-10-27T12:00:00');
        expect(error.parameters.source.file).toBe('fetch.ts');
        expect(error.parameters.source.function).toBe('fetchPage');
        expect(error.exception?.stackTrace).toBe('original stack');
        expect(error.parameters.request.method).toBe('POST');
        expect(error.parameters.request.url).toBe('https://example.test');
        expect(error.parameters.request.headers['X-Test']).toBe('request');
        expect(error.parameters.response.status).toBe(503);
        expect(error.parameters.response.status_text).toBe('Unavailable');
        expect(error.parameters.response.headers['X-Test']).toBe('response');
    });
});
