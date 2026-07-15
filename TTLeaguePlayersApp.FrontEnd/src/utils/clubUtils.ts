export function createManagedClubKey(club: { league: string; season: string; club_name: string }): string {
    return `${club.league}-${club.season}-${club.club_name}`;
}
