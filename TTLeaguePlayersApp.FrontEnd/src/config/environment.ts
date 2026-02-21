export interface EnvironmentConfig {
    FrontEnd: {
        WebsiteBaseUrl: string;
    }
    ApiGateWay: {
        ApiBaseUrl: string;
        CreateInviteAutomaticallySendInviteEmail: boolean;
    }
    DynamoDB: {
        ServiceLocalUrl: string;
        "AWS.Profile": string;
        "AWS.Region": string | null;
    }
    Cognito: {
        UserPoolId: string;
        ClientId: string;
        Domain: string;
    }
    active_seasons_data_source: ActiveSeasonDataSource[];
}

export interface ActiveSeasonDataSource {
    league: string;
    season: string;
    custom_processor: string;
    registrations_start_date: number;
    ratings_end_date: number;
    division_tables: Record<string, string>[];
    division_fixtures: Record<string, string>[];
    division_players: Record<string, string>[];
}

/**
 * Synchronous, build-time configuration.
 *
 * vite.config.ts injects the selected config JSON into the bundle as import.meta.env.APP_CONFIG.
 * This means config is available immediately at runtime without a network fetch.
 */
export function getConfig(): EnvironmentConfig {
    const config = (import.meta as unknown as { env?: { APP_CONFIG?: unknown } }).env?.APP_CONFIG;

    if (!config) {
        throw new Error(
            'APP_CONFIG is not set. Please ensure vite.config.ts defines import.meta.env.APP_CONFIG'
        );
    }

    return config as EnvironmentConfig;
}

/**
 * Backwards-compatible async wrapper.
 *
 * Previously this fetched `/assets/${ENVIRONMENT}.env.json` at runtime.
 * Now the environment is assumed to be fixed at build time, so this resolves immediately.
 */
export function loadConfig(): Promise<EnvironmentConfig> {
    return Promise.resolve(getConfig());
}
