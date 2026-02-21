import { describe, it, expect, vi } from 'vitest';

// For build-time config we test the contract by mocking getConfig.

describe('Environment Config (build-time)', () => {
  it('getConfig returns injected config (mocked)', async () => {
    vi.resetModules();

    const mockConfig = {
      FrontEnd: { WebsiteBaseUrl: 'http://localhost:3000' },
      ApiGateWay: { ApiBaseUrl: 'http://api.localhost', CreateInviteAutomaticallySendInviteEmail: true },
      DynamoDB: { ServiceLocalUrl: 'http://dynamo', "AWS.Profile": "test", "AWS.Region": "us-east-1" },
      Cognito: { UserPoolId: 'pool', ClientId: 'client', Domain: 'domain' },
      active_seasons_data_source: [
        {
          league: "TestLeague",
          season: "2025-2026",
          custom_processor: "Processor",
          registrations_start_date: 1234567890,
          ratings_end_date: 1234567890,
          division_tables: [{ "Div1": "url1" }],
          division_fixtures: [{ "Div1": "url2" }],
          all_players: [{ "Div1": "url3" }]
        }
      ]
    };

    vi.doMock('../../../src/config/environment', () => ({
      getConfig: () => mockConfig,
      loadConfig: () => Promise.resolve(mockConfig),
    }));

    const { getConfig, loadConfig } = await import('../../../src/config/environment');

    expect(getConfig()).toEqual(mockConfig);
    await expect(loadConfig()).resolves.toEqual(mockConfig);
  });

  it('getConfig throws when APP_CONFIG is not set (real implementation)', async () => {
    vi.resetModules();
    vi.doUnmock('../../../src/config/environment');

    const { getConfig } = await import('../../../src/config/environment');

    // In unit tests, APP_CONFIG is not injected by Vite's define step.
    expect(() => getConfig()).toThrow(/APP_CONFIG is not set/);
  });
});
