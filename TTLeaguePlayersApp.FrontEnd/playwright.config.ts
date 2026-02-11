import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: `http://localhost:${process.env.PORT ?? '5173'}`,
        trace: 'on-first-retry',
    },

    projects: [
        // Dedicated project for long-running KudosAwardAndStanding tests
        {
            name: 'kudos-long-tests',
            testMatch: /KudosAwardAndStanding\.spec\.ts$/,
            workers: 1,
            fullyParallel: false,
            use: {
                ...devices['iPhone SE'],
                // Use Chromium engine but emulate iPhone SE viewport/UA/touch.
                // The built-in 'iPhone SE' device preset defaults to WebKit.
                browserName: 'chromium',
            },
        },
        // Default project for other tests
        {
            name: 'chromium (iPhone SE emulation)',
            // Exclude the long test from the default project
            testIgnore: /KudosAwardAndStanding\.spec\.ts$/,
            use: {
                ...devices['iPhone SE'],
                // Use Chromium engine but emulate iPhone SE viewport/UA/touch.
                // The built-in 'iPhone SE' device preset defaults to WebKit.
                browserName: 'chromium',
            },
        },
    ],
});
