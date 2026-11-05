import { describe, expect, it } from 'vitest';
import { getAppVersion, getConfig, loadConfig } from '../../../src/config/environment';

describe('build-time environment config', () => {
    it('rejects a bundle that has no APP_CONFIG', () => {
        expect(() => getConfig()).toThrow(
            'APP_CONFIG is not set. Please ensure vite.config.ts defines import.meta.env.APP_CONFIG'
        );
    });

    it('returns the object injected at build time', () => {
        const appConfig = { active_seasons_data_source: [] };

        expect(getConfig({ APP_CONFIG: appConfig })).toBe(appConfig);
    });

    it('reports a missing config when the environment object is null', () => {
        expect(() => getConfig(null)).toThrow(/APP_CONFIG is not set/);
    });

    it('fails loadConfig when the build did not inject APP_CONFIG', () => {
        expect(() => loadConfig()).toThrow(/APP_CONFIG is not set/);
    });

    it('uses local defaults when build metadata is absent', () => {
        expect(getAppVersion()).toEqual({ version: 'dev', buildDate: 'local', buildSeconds: '0' });
        expect(getAppVersion(null)).toEqual({ version: 'dev', buildDate: 'local', buildSeconds: '0' });
    });
});
