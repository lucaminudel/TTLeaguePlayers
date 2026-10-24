import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { BrowserContext, CDPSession, Page, Route } from '@playwright/test';

export interface ManifestEntry {
    url: string;
    status: number;
    contentType: string;
    bodyFile: string;
    capturedAt: string | null;
    provenance: string;
}

export type RequestTarget = { kind: 'unrelated' } | { kind: 'invalid'; diagnostic: string } | { kind: 'tabletennis365'; url: string; key: string };
export interface StubResponse { status: number; contentType: string; body: string }
export interface RequestOutcome { target: string; outcome: 'manifest' | 'override' | 'network-error' | 'unknown'; status?: number }

const upstreamHosts = new Set(['www.tabletennis365.com', 'tabletennis365.com']);
const visiblyWebsiteTarget = (value: string): boolean => /^https?:\/\/(?:www\.)?tabletennis365\.com(?:[/:?#]|$)/i.test(value);

export function normalizedTarget(url: URL): string {
    const normalized = new URL(url);
    normalized.hash = '';
    const parameters = [...normalized.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    normalized.search = '';
    for (const [key, value] of parameters) normalized.searchParams.append(key, value);
    return normalized.href;
}

export function resolveTableTennis365Target(requestUrl: string): RequestTarget {
    let url: URL;
    try { url = new URL(requestUrl); } catch { return { kind: 'unrelated' }; }
    if (url.hostname === 'go.x2u.in' && url.pathname === '/proxy') {
        const targets = url.searchParams.getAll('url');
        const hasWebsiteTarget = targets.some(target => {
            try { return upstreamHosts.has(new URL(target).hostname); } catch { return visiblyWebsiteTarget(target); }
        });
        if (!hasWebsiteTarget) return { kind: 'unrelated' };
        if (targets.length !== 1) return { kind: 'invalid', diagnostic: 'TableTennis365 proxy request requires exactly one upstream url parameter' };
        try { url = new URL(targets[0]); } catch { return { kind: 'invalid', diagnostic: 'Known proxy carries a malformed TableTennis365 upstream target' }; }
    }
    if (!upstreamHosts.has(url.hostname)) return { kind: 'unrelated' };
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        return { kind: 'invalid', diagnostic: 'Unsupported TableTennis365 target protocol or credentials' };
    }
    return { kind: 'tabletennis365', url: url.href, key: normalizedTarget(url) };
}

export function sanitizedTarget(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        url.username = '';
        url.password = '';
        for (const key of [...url.searchParams.keys()]) {
            if (/key|token|secret|password|email|authorization/i.test(key)) url.searchParams.set(key, '[redacted]');
        }
        return url.href;
    } catch { return '[invalid target]'; }
}

export async function loadManifest(manifestPath: string): Promise<Map<string, StubResponse>> {
    const entries: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('TableTennis365 manifest must be an array');
    const responses = new Map<string, StubResponse>();
    const root = resolve(dirname(manifestPath));
    for (const candidate of entries as unknown[]) {
        if (!candidate || typeof candidate !== 'object') throw new Error('Invalid TableTennis365 manifest entry');
        const entry = candidate as Partial<ManifestEntry>;
        if (typeof entry.url !== 'string' || typeof entry.status !== 'number' || !Number.isInteger(entry.status) || entry.status < 200 || entry.status > 599 || typeof entry.contentType !== 'string'
            || typeof entry.bodyFile !== 'string' || !(entry.capturedAt === null || typeof entry.capturedAt === 'string')
            || typeof entry.provenance !== 'string') throw new Error('Incomplete TableTennis365 manifest entry');
        const target = resolveTableTennis365Target(entry.url);
        if (target.kind !== 'tabletennis365' || new URL(entry.url).hostname === 'go.x2u.in') throw new Error('Manifest must use direct upstream URLs');
        if (responses.has(target.key)) throw new Error(`Duplicate TableTennis365 manifest target: ${sanitizedTarget(target.url)}`);
        const bodyPath = resolve(root, entry.bodyFile);
        if (!bodyPath.startsWith(root + sep)) throw new Error('Manifest bodyFile must stay within its data directory');
        responses.set(target.key, { status: entry.status, contentType: entry.contentType, body: await readFile(bodyPath, 'utf8') });
    }
    return responses;
}

// This classifier deliberately does not share the stub resolver: the audit must detect resolver mistakes.
export function isWebsiteBoundRequest(rawUrl: string): boolean {
    try {
        const request = new URL(rawUrl);
        if (request.hostname === 'www.tabletennis365.com' || request.hostname === 'tabletennis365.com') return true;
        if (request.hostname !== 'go.x2u.in' || request.pathname !== '/proxy') return false;
        const targets = request.searchParams.getAll('url');
        return targets.some(target => {
            try {
                const host = new URL(target).hostname;
                return host === 'www.tabletennis365.com' || host === 'tabletennis365.com';
            } catch { return /^https?:\/\/(?:www\.)?tabletennis365\.com(?:[/:?#]|$)/i.test(target); }
        });
    } catch { return false; }
}

export interface EgressObservation { target: string }

export class OutgoingNetworkAudit {
    readonly outgoing: EgressObservation[] = [];
    private readonly sessions = new Map<Page, Promise<CDPSession>>();
    private readonly context: BrowserContext;
    private readonly isTarget: (url: string) => boolean;

    constructor(context: BrowserContext, isTarget = isWebsiteBoundRequest) {
        this.context = context;
        this.isTarget = isTarget;
    }

    async attachPage(page: Page): Promise<void> {
        let session = this.sessions.get(page);
        if (!session) {
            session = this.attachSession(page);
            this.sessions.set(page, session);
        }
        await session;
    }

    private async attachSession(page: Page): Promise<CDPSession> {
        const session = await this.context.newCDPSession(page);
        const requests = new Map<string, string>();
        const pending = new Set<string>();
        const record = (requestId: string) => {
            const url = requests.get(requestId);
            if (!url) { pending.add(requestId); return; }
            if (this.isTarget(url)) this.outgoing.push({ target: safeAuditTarget(url) });
            pending.delete(requestId);
        };
        session.on('Network.requestWillBeSent', (event: { requestId: string; request: { url: string } }) => {
            requests.set(event.requestId, event.request.url);
            if (pending.has(event.requestId)) record(event.requestId);
        });
        // Chromium emits ExtraInfo for network dispatch, but not Playwright route.fulfill().
        session.on('Network.requestWillBeSentExtraInfo', (event: { requestId: string }) => { record(event.requestId); });
        await session.send('Network.enable');
        return session;
    }

    async dispose(): Promise<void> {
        for (const [page, session] of this.sessions) {
            if (!page.isClosed()) await (await session).detach();
        }
        this.sessions.clear();
    }
}

function safeAuditTarget(rawUrl: string): string {
    const target = resolveTableTennis365Target(rawUrl);
    if (target.kind === 'tabletennis365') return sanitizedTarget(target.url);
    if (target.kind === 'invalid') return target.diagnostic;
    return sanitizedTarget(rawUrl);
}

const baseUrl = 'https://www.tabletennis365.com/CentralLondon';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

export class TableTennis365Impersonator {
    readonly outcomes: RequestOutcome[] = [];
    readonly unexpected: string[] = [];
    private readonly overrides = new Map<string, StubResponse | 'abort'>();
    private installed = false;
    private readonly matchesTarget = (url: URL): boolean => resolveTableTennis365Target(url.href).kind !== 'unrelated';
    private readonly context: BrowserContext;
    private readonly responses: Map<string, StubResponse>;
    private readonly beforeRoute?: (page: Page) => Promise<void>;

    constructor(context: BrowserContext, responses: Map<string, StubResponse>, beforeRoute?: (page: Page) => Promise<void>) {
        this.context = context;
        this.responses = responses;
        this.beforeRoute = beforeRoute;
    }

    readonly fixtures = {
        failWithHttpStatus: (status: number, url?: string) => {
            if (!Number.isInteger(status) || status < 400 || status > 599) throw new Error('HTTP failure status must be between 400 and 599');
            this.overrideFixtures({ status, contentType: 'text/plain', body: 'Injected upstream HTTP failure' }, url);
        },
        failWithNetworkError: (url?: string) => { this.overrideFixtures('abort', url); },
        returnServiceUnavailable: (url?: string) => { this.overrideFixtures({ status: 200, contentType: 'text/html', body: '<html><body>Service unavailable</body></html>' }, url); }
    };

    readonly players = {
        returnRoster: ({ team, players, teamId = 73142 }: { team: string; players: readonly string[]; teamId?: number }) => {
            if (!Number.isSafeInteger(teamId) || teamId <= 0) throw new Error('Roster teamId must be a positive integer');
            this.setResponse(`${baseUrl}/Team/Eligibility`, { status: 200, contentType: 'text/html', body: `<!DOCTYPE html><html><body><select id="teamSelect"><option value="">All Teams</option><option value="${String(teamId)}">${escapeHtml(team)}</option></select></body></html>` });
            this.setResponse(`${baseUrl}/Team/Eligibility?handler=Players&leagueId=4760&teamId=${String(teamId)}`, { status: 200, contentType: 'application/json', body: JSON.stringify({ teamPlayers: players.map((name, index) => ({ id: index + 1, name })), otherPlayers: [] }) });
        }
    };

    readonly clubs = {
        failWithNetworkError: (clubNameOrUrl: string) => { this.setResponse(this.clubUrl(clubNameOrUrl), 'abort'); }
    };

    setResponse(url: string, response: StubResponse | 'abort'): void {
        const target = resolveTableTennis365Target(url);
        if (target.kind !== 'tabletennis365') throw new Error('Override requires a direct TableTennis365 target');
        this.overrides.set(target.key, response);
    }

    private clubUrl(club: string): string {
        return /^https?:\/\//.test(club) ? club : `${baseUrl}/Clubs/${encodeURIComponent(club)}`;
    }

    private overrideFixtures(response: StubResponse | 'abort', url?: string): void {
        if (url) { this.setResponse(url, response); return; }
        for (const key of this.responses.keys()) {
            if (new URL(key).pathname.endsWith('/Fixtures/calendar.ics')) this.overrides.set(key, response);
        }
    }

    private readonly handler = async (route: Route): Promise<void> => {
        if (this.beforeRoute) {
            let page: Page | undefined;
            try { page = route.request().frame().page(); }
            catch (error) {
                // A popup's first navigation can be intercepted before its Page/Frame exists.
                // Fulfill or abort it here; the context page event attaches the later network audit.
                if (!route.request().isNavigationRequest()) throw error;
            }
            if (page) await this.beforeRoute(page);
        }
        const target = resolveTableTennis365Target(route.request().url());
        if (target.kind === 'unrelated') { await route.fallback(); return; }
        const method = route.request().method();
        const targetDiagnostic = target.kind === 'invalid' ? target.diagnostic : sanitizedTarget(target.url);
        const diagnostic = method === 'GET' ? targetDiagnostic : `Unsupported TableTennis365 request method ${method}: ${targetDiagnostic}`;
        const response = method === 'GET' && target.kind === 'tabletennis365' ? this.overrides.get(target.key) ?? this.responses.get(target.key) : undefined;
        if (!response) {
            this.unexpected.push(diagnostic);
            this.outcomes.push({ target: diagnostic, outcome: 'unknown' });
            await route.abort('blockedbyclient');
        } else if (response === 'abort') {
            this.outcomes.push({ target: diagnostic, outcome: 'network-error' });
            await route.abort('failed');
        } else {
            this.outcomes.push({ target: diagnostic, outcome: target.kind === 'tabletennis365' && this.overrides.has(target.key) ? 'override' : 'manifest', status: response.status });
            await route.fulfill({ ...response, headers: { 'access-control-allow-origin': '*' } });
        }
    };

    async install(): Promise<void> {
        if (this.installed) throw new Error('TableTennis365 impersonator already installed');
        await this.context.route(this.matchesTarget, this.handler);
        this.installed = true;
    }

    async dispose(): Promise<void> {
        if (this.installed) await this.context.unroute(this.matchesTarget, this.handler);
        this.installed = false;
        this.overrides.clear();
    }
}
