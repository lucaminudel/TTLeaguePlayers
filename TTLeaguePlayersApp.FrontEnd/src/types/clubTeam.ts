/**
 * A club team as listed on the league site's club page, with the division it plays in.
 *
 * The division travels with the team because the kudos partition key is per division: the club page
 * is the only place that knows which division each of a club's teams is in, and the standings
 * endpoint cannot look it up.
 *
 * Field names are snake_case because this shape is sent verbatim in the POST /kudos/clubstandings
 * body — no remapping layer.
 */
export interface ClubTeamWithDivision {
    team_name: string;
    team_division: string;
}
