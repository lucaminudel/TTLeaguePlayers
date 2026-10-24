import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { loadManifest, OutgoingNetworkAudit, TableTennis365Impersonator } from './tabletennis365-impersonator';

export type TableTennis365Mode = 'off' | 'stubbed' | 'live';

interface TableTennis365Fixtures {
    tableTennis365: TableTennis365Mode;
    tableTennis365Stub: TableTennis365Impersonator;
    tableTennis365NetworkAudit: OutgoingNetworkAudit | undefined;
}

export const test = base.extend<TableTennis365Fixtures>({
    tableTennis365: ['off', { option: true }],
    page: async ({ page, tableTennis365NetworkAudit }, provide) => {
        if (tableTennis365NetworkAudit) await tableTennis365NetworkAudit.attachPage(page);
        await provide(page);
    },
    serviceWorkers: async ({ tableTennis365 }, provide) => {
        await provide(tableTennis365 === 'stubbed' ? 'block' : 'allow');
    },
    tableTennis365NetworkAudit: [async ({ context, tableTennis365 }, provide) => {
        if (tableTennis365 !== 'stubbed') { await provide(undefined); return; }
        const audit = new OutgoingNetworkAudit(context);
        const pending = new Set<Promise<void>>();
        const attach = (page: Parameters<OutgoingNetworkAudit['attachPage']>[0]) => {
            const operation = audit.attachPage(page);
            pending.add(operation);
            void operation.finally(() => pending.delete(operation)).catch(() => undefined);
        };
        context.on('page', attach);
        const originalNewPage = context.newPage.bind(context);
        context.newPage = async () => {
            const page = await originalNewPage();
            await audit.attachPage(page);
            return page;
        };
        try {
            await Promise.all(context.pages().map(page => audit.attachPage(page)));
            await provide(audit);
            await Promise.all(pending);
        } finally {
            context.off('page', attach);
            context.newPage = originalNewPage;
            await audit.dispose();
        }
    }, { auto: true }],
    tableTennis365Stub: [async ({ context, tableTennis365, tableTennis365NetworkAudit }, provide, testInfo) => {
        if (tableTennis365 !== 'stubbed') {
            await provide(new TableTennis365Impersonator(context, new Map()));
            return;
        }
        const manifest = fileURLToPath(new URL('../data/tabletennis365-impersonator/manifest.json', import.meta.url));
        if (!tableTennis365NetworkAudit) throw new Error('Stubbed mode requires the independent outgoing-network audit');
        const stub = new TableTennis365Impersonator(context, await loadManifest(manifest), page => tableTennis365NetworkAudit.attachPage(page));
        await stub.install();
        try { await provide(stub); } finally {
            await stub.dispose();
            await testInfo.attach('tabletennis365-request-audit', {
                body: JSON.stringify({ handled: stub.outcomes, outgoing: tableTennis365NetworkAudit.outgoing }, null, 2),
                contentType: 'application/json'
            });
            expect(stub.unexpected, 'Every TableTennis365 request must have a recorded response or explicit override').toEqual([]);
            expect(tableTennis365NetworkAudit.outgoing, 'No TableTennis365 request may reach the outgoing network').toEqual([]);
        }
    }, { auto: true }]
});

export const stubbedTest = test.extend({ tableTennis365: 'stubbed' as TableTennis365Mode });

export { expect };
