import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getConfig, type ActiveSeasonDataSource } from '../config/environment';
import { CLTTLActiveSeason2026PagesFetcher } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesFetcher';
import { CLTTLActiveSeason2026PagesParser } from '../service/active-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser';
import { CLTTLManagedClub2026PagesFetcher } from '../service/active-season-processors/clttl-2026/CLTTLManagedClub2026PagesFetcher';
import { CLTTLManagedClub2026PagesParser } from '../service/active-season-processors/clttl-2026/CLTTLManagedClub2026PagesParser';
import type { ClubTeamWithDivision } from '../types/clubTeam';

type ContractMode = 'active-season' | 'managed-club';
type ContractResult =
    | { state: 'loading' }
    | { state: 'error'; error: string }
    | { state: 'ready'; mode: 'active-season'; fixtureCount: number; teamCount: number; team: string; players: string[] }
    | { state: 'ready'; mode: 'managed-club'; teams: ClubTeamWithDivision[] };

const CLTTL_LEAGUE = 'CLTTL';
const CLTTL_SEASON = '2026-2027';
const DIVISION = 'Division 4';
const REPRESENTATIVE_TEAM = 'Morpeth 10';
const REPRESENTATIVE_CLUB = 'Morpeth Table Tennis Club';

function hasSourceLink(source: Record<string, string>[], key: string): boolean {
    return source.some((entry) => Object.prototype.hasOwnProperty.call(entry, key) && entry[key].trim().length > 0);
}

function findCurrentDataSource(mode: ContractMode): ActiveSeasonDataSource {
    const configured = getConfig().active_seasons_data_source.find((source) => source.league === CLTTL_LEAGUE && source.season === CLTTL_SEASON);

    if (mode === 'managed-club') {
        if (!configured || !hasSourceLink(configured.club_teams, REPRESENTATIVE_CLUB)) {
            throw new Error(`No ${CLTTL_LEAGUE} ${CLTTL_SEASON} data source with a ${REPRESENTATIVE_CLUB} club page is configured.`);
        }
    } else if (!configured || !hasSourceLink(configured.division_players, DIVISION) || !hasSourceLink(configured.division_fixtures, DIVISION)) {
        throw new Error(`No ${CLTTL_LEAGUE} ${CLTTL_SEASON} data source with Division 4 players and fixtures is configured.`);
    }

    return configured;
}

async function loadActiveSeasonContract(dataSource: ActiveSeasonDataSource): Promise<ContractResult> {
    const fetcher = new CLTTLActiveSeason2026PagesFetcher(dataSource, true);
    const parser = new CLTTLActiveSeason2026PagesParser();
    const fixtures = parser.getTeamFixtures(await fetcher.getTeamFixtures(DIVISION));
    if (fixtures.length === 0) {
        throw new Error('The proxy response did not contain any fixtures.');
    }

    const teamIds = parser.getTeamIds(await fetcher.getTeamIds(DIVISION));
    if (teamIds.length === 0) {
        throw new Error('The proxy response did not contain any numeric team options.');
    }
    if (teamIds.some(({ team, id }) => !team.trim() || !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('The proxy response contained invalid team names or IDs.');
    }
    const selectedTeam = teamIds.find(({ team }) => team === REPRESENTATIVE_TEAM);
    if (!selectedTeam) {
        throw new Error(`The proxy response did not contain ${REPRESENTATIVE_TEAM}.`);
    }

    const playersResponse = await fetcher.getTeamPlayers(DIVISION, selectedTeam.id);
    const roster: unknown = JSON.parse(playersResponse);
    if (!roster || typeof roster !== 'object' || !('teamPlayers' in roster) || !Array.isArray(roster.teamPlayers)
        || roster.teamPlayers.length === 0
        || roster.teamPlayers.some((player: unknown) => !player || typeof player !== 'object' || !('name' in player)
            || typeof player.name !== 'string' || !player.name.trim())) {
        throw new Error(`The proxy response did not contain a valid nonempty roster for ${REPRESENTATIVE_TEAM}.`);
    }
    const players = parser.getTeamPlayers(playersResponse);
    return { state: 'ready', mode: 'active-season', fixtureCount: fixtures.length, teamCount: teamIds.length, team: selectedTeam.team, players };
}

async function loadManagedClubContract(dataSource: ActiveSeasonDataSource): Promise<ContractResult> {
    const fetcher = new CLTTLManagedClub2026PagesFetcher(dataSource, true);
    const parser = new CLTTLManagedClub2026PagesParser();
    const teams = parser.getClubTeams(await fetcher.getClubTeams(REPRESENTATIVE_CLUB));
    if (teams.length === 0 || teams.some(({ team_name, team_division }) => !team_name.trim() || !team_division.trim())) {
        throw new Error('The proxy response did not contain valid club teams with names and divisions.');
    }
    return { state: 'ready', mode: 'managed-club', teams };
}

const ContractDiagnostic: React.FC<{ mode: ContractMode }> = ({ mode }) => {
    const [result, setResult] = useState<ContractResult>({ state: 'loading' });

    useEffect(() => {
        let cancelled = false;
        const loadContract = async () => {
            try {
                const dataSource = findCurrentDataSource(mode);
                const loaded = await (mode === 'managed-club' ? loadManagedClubContract(dataSource) : loadActiveSeasonContract(dataSource));
                if (!cancelled) {
                    setResult(loaded);
                }
            } catch (error) {
                if (!cancelled) {
                    setResult({ state: 'error', error: error instanceof Error ? error.message : String(error) });
                }
            }
        };
        void loadContract();
        return () => { cancelled = true; };
    }, [mode]);

    return (
        <main>
            <h1>External contracts live testing</h1>
            <p data-testid="external-contract-status">{result.state}</p>
            {result.state === 'loading' && <p data-testid="external-contract-loading">Loading proxy response…</p>}
            {result.state === 'ready' && (
                <section data-testid="go-x2u-in-proxy-result">
                    <p data-testid="external-contract-season">{CLTTL_LEAGUE} {CLTTL_SEASON}</p>
                    {result.mode === 'active-season' ? (
                        <>
                            <p data-testid="external-contract-division">{DIVISION}</p>
                            <p data-testid="external-contract-fixture-calendar">Fixtures: {result.fixtureCount}</p>
                            <p data-testid="external-contract-team-selector">Team options: {result.teamCount}</p>
                            <p data-testid="external-contract-selected-team">{result.team}</p>
                            <p data-testid="external-contract-team-player-json">Player names: {result.players.length}</p>
                            <ul>{result.players.map((name) => <li key={name} data-testid="external-contract-player-name">{name}</li>)}</ul>
                        </>
                    ) : (
                        <>
                            <p data-testid="external-contract-club">{REPRESENTATIVE_CLUB}</p>
                            <p data-testid="external-contract-club-team-count">Club teams: {result.teams.length}</p>
                            <ul>{result.teams.map((team) => (
                                <li key={`${team.team_division}-${team.team_name}`}>
                                    <span data-testid="external-contract-club-team-name">{team.team_name}</span>
                                    {' — '}
                                    <span data-testid="external-contract-club-team-division">{team.team_division}</span>
                                </li>
                            ))}</ul>
                        </>
                    )}
                </section>
            )}
            {result.state === 'error' && <p data-testid="external-contract-error">{result.error}</p>}
        </main>
    );
};

export const ExternalContractsLiveTesting: React.FC = () => {
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('contract') === 'managed-club' ? 'managed-club' : 'active-season';
    return <ContractDiagnostic key={mode} mode={mode} />;
};
