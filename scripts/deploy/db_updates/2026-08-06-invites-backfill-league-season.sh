#!/bin/bash
#
# Backfills the league_season attribute onto existing invite rows.
#
#   league_season = "<league>#<season>"
#
# It is the partition key of LeagueSeasonTeamIndex. New invites get it at write time from
# InvitesDataTable.CreateNewInvite; rows written before that code shipped have no such attribute and
# are therefore INVISIBLE to the index — DynamoDB indexes an item only when every key attribute is
# present. Without this backfill a team with a real pending invite reads NOT_INVITED, with no error
# anywhere.
#
# ORDERING — this matters, the failures are silent
#
# RUN THIS LAST, always. It must come after BOTH the code that writes league_season and the index
# itself, and the reason is one-directional: any invite created before the new code is live is
# written without league_season and stays missing from the index for ever, because nothing revisits
# it. Backfilling first does not help — it leaves exactly that gap for every invite created between
# the backfill and the deploy.
#
#   staging / prod — one step, then this one.
#     `sam deploy` applies template.yaml, which carries BOTH the lambda code and
#     LeagueSeasonTeamIndex, so the code and the index arrive together. There is no ordering choice
#     to make. Then run this script.
#
#   dev / test — the local tables are NOT managed by CloudFormation, so nothing creates the index
#     for them. It has to be added by hand, extracted from the GlobalSecondaryIndexes block of
#     template.yaml, before this script is run. (A helper script did this and was deleted once it
#     had served its purpose — see README.md.)
#
# A missing index does not error. It returns no rows, and every team reads NOT_INVITED.
#
# USAGE
#   ./2026-08-06-invites-backfill-league-season.sh <table-name> [endpoint-url]
#
# Omitting the endpoint-url is what sends it to AWS rather than a local table.
#
#   ./2026-08-06-invites-backfill-league-season.sh ttleague-invites-dev  http://localhost:8000
#   ./2026-08-06-invites-backfill-league-season.sh ttleague-invites-test http://localhost:8001
#   ./2026-08-06-invites-backfill-league-season.sh ttleague-invites-staging
#   ./2026-08-06-invites-backfill-league-season.sh ttleague-invites-prod
#
# Idempotent: every write is guarded by attribute_not_exists(league_season), so a row that already
# has one is never rewritten and a re-run reports 0 updated. Safe to re-run after a partial failure.
#
# Rows are only ever ADDED to. This script never deletes, and never touches any other attribute.

set -euo pipefail

INDEX_HINT="LeagueSeasonTeamIndex"

TABLE_NAME="${1:-}"
ENDPOINT_URL="${2:-}"

if [ -z "$TABLE_NAME" ]; then
    echo "Usage: $(basename "$0") <table-name> [endpoint-url]" >&2
    exit 2
fi

# macOS ships bash 3.2, where "${ARRAY[@]}" on an EMPTY array trips `set -u`. Expanding through
# ${ARRAY[@]+...} makes the empty case (no endpoint, i.e. staging/prod) expand to nothing.
AWS_ARGS=()
if [ -n "$ENDPOINT_URL" ]; then
    AWS_ARGS+=(--endpoint-url "$ENDPOINT_URL")
fi
aws_dynamodb() {
    aws dynamodb "$@" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"}
}

echo "Table    : $TABLE_NAME"
echo "Endpoint : ${ENDPOINT_URL:-<default AWS endpoint>}"
echo "Setting  : league_season = \"<league>#<season>\", guarded by attribute_not_exists"
echo

# Names are passed through ExpressionAttributeNames rather than written inline, so this keeps
# working if any of these ever collides with a DynamoDB reserved word.
#
# The scan and the update need SEPARATE maps: DynamoDB rejects the whole request with a
# ValidationException if ExpressionAttributeNames contains a name the expression does not use.
SCAN_NAMES='{"#nano_id":"nano_id","#league":"league","#season":"season","#league_season":"league_season"}'
UPDATE_NAMES='{"#league_season":"league_season"}'

SCANNED=0
UPDATED=0
ALREADY_SET=0
SKIPPED=0
PAGES=0
EXCLUSIVE_START_KEY=""

while :; do
    # --no-paginate keeps the CLI from silently following LastEvaluatedKey itself: this script does
    # its own paging so the page count is real and a partial run says how far it got.
    if [ -n "$EXCLUSIVE_START_KEY" ]; then
        PAGE="$(aws_dynamodb scan \
            --table-name "$TABLE_NAME" \
            --no-paginate \
            --projection-expression "#nano_id, #league, #season, #league_season" \
            --expression-attribute-names "$SCAN_NAMES" \
            --exclusive-start-key "$EXCLUSIVE_START_KEY" \
            --output json)"
    else
        PAGE="$(aws_dynamodb scan \
            --table-name "$TABLE_NAME" \
            --no-paginate \
            --projection-expression "#nano_id, #league, #season, #league_season" \
            --expression-attribute-names "$SCAN_NAMES" \
            --output json)"
    fi

    PAGES=$(( PAGES + 1 ))

    # One tab-separated line per item: nano_id, league, season, whether league_season is already set.
    # Empty strings where an attribute is absent, so the field count never changes.
    while IFS=$'\t' read -r NANO_ID LEAGUE SEASON HAS_LEAGUE_SEASON; do
        [ -z "$NANO_ID" ] && continue
        SCANNED=$(( SCANNED + 1 ))

        if [ "$HAS_LEAGUE_SEASON" = "yes" ]; then
            ALREADY_SET=$(( ALREADY_SET + 1 ))
            continue
        fi

        if [ -z "$LEAGUE" ] || [ -z "$SEASON" ]; then
            # Cannot build the key for this row. Every invite is supposed to have both — the
            # datastore validates them on write — so this is worth shouting about rather than
            # skipping quietly. The row stays out of the index until someone fixes it.
            echo "  SKIPPED $NANO_ID: league='$LEAGUE' season='$SEASON' — one is missing" >&2
            SKIPPED=$(( SKIPPED + 1 ))
            continue
        fi

        KEY="$(jq -nc --arg id "$NANO_ID" '{nano_id: {S: $id}}')"
        VALUES="$(jq -nc --arg ls "${LEAGUE}#${SEASON}" '{":ls": {S: $ls}}')"

        if UPDATE_ERROR="$(aws_dynamodb update-item \
                --table-name "$TABLE_NAME" \
                --key "$KEY" \
                --update-expression "SET #league_season = :ls" \
                --condition-expression "attribute_not_exists(#league_season)" \
                --expression-attribute-names "$UPDATE_NAMES" \
                --expression-attribute-values "$VALUES" \
                --output json 2>&1 >/dev/null)"; then
            echo "  updated $NANO_ID -> ${LEAGUE}#${SEASON}"
            UPDATED=$(( UPDATED + 1 ))
        elif echo "$UPDATE_ERROR" | grep -q "ConditionalCheckFailedException"; then
            # Expected and benign: something set league_season between the scan and this write.
            echo "  already set $NANO_ID (set concurrently)"
            ALREADY_SET=$(( ALREADY_SET + 1 ))
        else
            # ANY other failure is a real one and must not be counted as success. Swallowing it here
            # is how a backfill "completes" while leaving rows invisible to the index — precisely the
            # silent failure this script exists to prevent.
            echo "ERROR: update-item failed for $NANO_ID" >&2
            echo "$UPDATE_ERROR" >&2
            exit 1
        fi
    done < <(echo "$PAGE" | jq -r '
        .Items[]? | [
            (.nano_id.S // ""),
            (.league.S // ""),
            (.season.S // ""),
            (if .league_season then "yes" else "no" end)
        ] | @tsv')

    EXCLUSIVE_START_KEY="$(echo "$PAGE" | jq -c '.LastEvaluatedKey // empty')"
    if [ -z "$EXCLUSIVE_START_KEY" ]; then
        break
    fi
done

echo
echo "Pages read  : $PAGES"
echo "Scanned     : $SCANNED"
echo "Updated     : $UPDATED"
echo "Already set : $ALREADY_SET"
echo "Skipped     : $SKIPPED"

if [ "$SKIPPED" -gt 0 ]; then
    echo
    echo "WARNING: $SKIPPED row(s) had no league and/or season and were left alone. They will not" >&2
    echo "         appear in $INDEX_HINT." >&2
    exit 1
fi

echo
echo "Note: club-manager invites have no invitee_team, so they still do NOT appear in"
echo "      $INDEX_HINT even now that they carry league_season. That is intended —"
echo "      the index is sparse, and only captain/player invites belong in it."
