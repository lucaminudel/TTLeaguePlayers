import React, { useEffect, useState } from 'react';
import { getConfig, type ActiveSeasonDataSource } from '../config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser';

type ContractState = 'loading' | 'ready' | 'error';

interface ContractResult {
    state: ContractState;
    league?: string;
    season?: string;
    division?: string;
    fixtureCount?: number;
    teamCount?: number;
    playerCount?: number;
    error?: string;
}

const CLTTL_LEAGUE = 'CLTTL';
const CLTTL_SEASON = '2026-2027';

function hasDivisionLink(source: Record<string, string>[], division: string): boolean {
    return source.some((entry) => Object.prototype.hasOwnProperty.call(entry, division) && entry[division].trim().length > 0);
}

function findCurrentDivisionFourDataSource(sources: ActiveSeasonDataSource[]): ActiveSeasonDataSource {
    const configured = sources.find((source) => source.league === CLTTL_LEAGUE && source.season === CLTTL_SEASON);

    if (!configured || !hasDivisionLink(configured.division_players, 'Division 4') || !hasDivisionLink(configured.division_fixtures, 'Division 4')) {
        throw new Error(`No ${CLTTL_LEAGUE} ${CLTTL_SEASON} data source with Division 4 players and fixtures is configured.`);
    }

    return configured;
}

export const ExternalContractsLiveTesting: React.FC = () => {
    const [result, setResult] = useState<ContractResult>({ state: 'loading' });

    useEffect(() => {
        let cancelled = false;

        const loadContract = async () => {
            try {
                const dataSource = findCurrentDivisionFourDataSource(getConfig().active_seasons_data_source);
                const division = 'Division 4';
                const fetcher = new CLTTLActiveSeason2026PagesFetcher(dataSource, true);
                const parser = new CLTTLActiveSeason2026PagesParser();
                const fixturesCalendar = await fetcher.getTeamFixtures(division);
                const fixtures = parser.getTeamFixtures(fixturesCalendar);

                if (fixtures.length === 0) {
                    throw new Error('The proxy response did not contain any fixtures.');
                }

                const teamSelectorHtml = await fetcher.getTeamIds(division);
                const teamIds = parser.getTeamIds(teamSelectorHtml);

                if (teamIds.length === 0) {
                    throw new Error('The proxy response did not contain any numeric team options.');
                }

                const playersResponse = await fetcher.getTeamPlayers(division, teamIds[0].id);
                const players = parser.getTeamPlayers(playersResponse);

                if (!cancelled) {
                    setResult({
                        state: 'ready',
                        league: dataSource.league,
                        season: dataSource.season,
                        division,
                        fixtureCount: fixtures.length,
                        teamCount: teamIds.length,
                        playerCount: players.length,
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setResult({
                        state: 'error',
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        };

        void loadContract();
        return () => { cancelled = true; };
    }, []);

    return (
        <main>
            <h1>External contracts live testing</h1>
            <p data-testid="external-contract-status">{result.state}</p>
            {result.state === 'loading' && <p data-testid="external-contract-loading">Loading proxy response…</p>}
            {result.state === 'ready' && (
                <section data-testid="go-x2u-in-proxy-result">
                    <p data-testid="external-contract-season">{result.league} {result.season}</p>
                    <p data-testid="external-contract-division">{result.division}</p>
                    <p data-testid="external-contract-fixture-calendar">Fixtures: {String(result.fixtureCount)}</p>
                    <p data-testid="external-contract-team-selector">Team options: {String(result.teamCount)}</p>
                    <p data-testid="external-contract-team-player-json">Player names: {String(result.playerCount)}</p>
                </section>
            )}
            {result.state === 'error' && <p data-testid="external-contract-error">{result.error}</p>}
        </main>
    );
};
