export interface EnvironmentConfig {
    FrontEnd: {
        WebsiteBaseUrl: string;
    };
    ApiGateWay: {
        ApiBaseUrl: string;
    };
    DynamoDB: {
        ServiceLocalUrl: string;
        "AWS.Profile": string;
        "AWS.Region": string | null;
    };
    Cognito: {
        UserPoolId: string;
        ClientId: string;
        Domain: string;
    };
}

let cachedConfig: EnvironmentConfig | null = null;

export async function loadConfig(): Promise<EnvironmentConfig> {
    if (cachedConfig) return cachedConfig;

    // vite.config.ts sets process.env.ENVIRONMENT at build time
    // import.meta.env assess its value at runtime
    const environment = import.meta.env.ENVIRONMENT;

    if (!environment) {
        throw new Error(
            "ENVIRONMENT variable is not set. Please ensure it is set in vite.config.ts"
        );
    }

    try {
        // User requested to assume config files are available under /assets/
        const response = await fetch(`/assets/${environment}.env.json`);

        if (!response.ok) {
            throw new Error(
                `Failed to load configuration file. HTTP status: ${String(response.status)}. Path: /assets/${environment}.env.json`
            );
        }

        cachedConfig = (await response.json()) as EnvironmentConfig;
        return cachedConfig;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(
                `Configuration loading failed': ${error.message}`
            );
        }
        throw new Error(
            `Unknown error loading configuration file '${environment}.env.json'`
        );
    }
}

/**
 * Resets the cached configuration. Only for testing.
 */
export function resetCache(): void {
    cachedConfig = null;
}
