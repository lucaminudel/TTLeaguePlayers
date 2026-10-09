import React, { useEffect, useState } from 'react';
import { getConfig, type ActiveSeasonDataSource } from '../config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser';

type ContractState = 'loading' | 'ready' | 'error';

interface ContractResult {
    state: ContractState;
    division?: string;
    teamCount?: number;
    playerCount?: number;
    error?: string;
}

function findDataSource(): ActiveSeasonDataSource {
    const configured = getConfig().active_seasons_data_source.find(
        (source) => source.league === 'CLTTL' && source.division_players.some((entry) => 'Division 4' in entry)
    );

    if (!configured) {
        throw new Error('No CLTTL data source with a Division 4 players page is configured.');
    }

    return configured;
}

export const ExternalContractsLiveTesting: React.FC = () => {
    const [result, setResult] = useState<ContractResult>({ state: 'loading' });

    useEffect(() => {
        let cancelled = false;

        const loadContract = async () => {
            try {
                const dataSource = findDataSource();
                const division = 'Division 4';
                const fetcher = new CLTTLActiveSeason2026PagesFetcher(dataSource, true);
                const parser = new CLTTLActiveSeason2026PagesParser();
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
                        division,
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
                    <p data-testid="external-contract-division">{result.division}</p>
                    <p data-testid="external-contract-team-selector">Team options: {String(result.teamCount)}</p>
                    <p data-testid="external-contract-team-player-json">Player names: {String(result.playerCount)}</p>
                </section>
            )}
            {result.state === 'error' && <p data-testid="external-contract-error">{result.error}</p>}
        </main>
    );
};
