#!/bin/bash

# Register test user for TTLeague environments
# Usage: ./register-test-users.sh [dev|test|staging]

ENVIRONMENT=$1
FORCE_CREATE=$2

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test|staging]"
    exit 1
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "test" && "$ENVIRONMENT" != "staging" ]]; then
    echo "Error: Only 'dev' and 'test' and 'staging' environments are allowed"
    exit 1
fi

if [[ -n "$FORCE_CREATE" && "$FORCE_CREATE" != "force" ]]; then
    echo "Error: Second parameter must be empty or 'force'"
    exit 1
fi

STACK_NAME="ttleague-cognito-$ENVIRONMENT"

#echo "Getting Cognito User Pool ID for $ENVIRONMENT environment..."

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
    --output text)

if [ -z "$USER_POOL_ID" ]; then
    echo "Error: Could not get User Pool ID for $ENVIRONMENT environment"
    exit 1
fi


if [[ "$FORCE_CREATE" == "force" ]]; then
    echo "Standard test users will be created."

    # Helper function to register and optionally confirm a user
    register_user() {
        local email=$1
        local password=$2
        local confirm=$3
        local custom_attr_name=$4
        local custom_attr_value=$5

        local attr_json="[{\"Name\":\"email\",\"Value\":\"$email\"},{\"Name\":\"email_verified\",\"Value\":\"true\"}"
        if [ -n "$custom_attr_name" ]; then
            local escaped_value=$(echo "$custom_attr_value" | sed 's/"/\\"/g')
            attr_json+=",{\"Name\":\"$custom_attr_name\",\"Value\":\"$escaped_value\"}"
        fi
        attr_json+="]"

        aws cognito-idp admin-create-user \
            --user-pool-id "$USER_POOL_ID" \
            --username "$email" \
            --user-attributes "$attr_json" \
            --temporary-password "$password" \
            --message-action SUPPRESS > /dev/null

        if [ "$confirm" = "true" ]; then
            aws cognito-idp admin-set-user-password \
                --user-pool-id "$USER_POOL_ID" \
                --username "$email" \
                --password "$password" \
                --permanent
        fi
    }

    COMMON_PASSWORD="aA1!56789012"

    # 1. User with CLTT, BCS, and FLICK leagues
    EMAIL1="test_already_registered@user.test"
    ACTIVE_SEASONS_JSON1='[{"league": "CLTTL", "season": "2025-2026","team_name": "Morpeth 10","team_division": "Division 4","person_name": "Luca Minudel","role": "CAPTAIN"},{"league": "BCS","season": "2025-2026","team_name": "Morpeth B","team_division": "Division 2","person_name": "Luca Minudel","role": "CAPTAIN"},{"league": "FLICK","season": "2025-Nov","team_name": "Indiidual","team_division": "Division 1","person_name": "Luca Sr Minudel","role": "CAPTAIN"}]'
    register_user "$EMAIL1" "$COMMON_PASSWORD" "true" "custom:active_seasons" "$ACTIVE_SEASONS_JSON1"
    echo "Cognito Test user '$EMAIL1' registered and confirmed successfully with CLTT, BCS, and FLICK leagues!"


    # 2. User pending invite acceptance (not confirmed)
    EMAIL2="test_ready_for_accept_invite_api_call@user.test"
    register_user "$EMAIL2" "$COMMON_PASSWORD" "false"
    echo "Cognito Test user '$EMAIL2' registered, not confirmed and pending for invite accepted API call!"

    # 3. User with only BCS league
    EMAIL3="test_already_registered2@user.test"
    ACTIVE_SEASONS_JSON3='[{"league": "BCS", "season": "2025-2026","team_name": "Morpeth B","team_division": "Division 2","person_name": "Luca Minudel","role": "CAPTAIN"}]'
    register_user "$EMAIL3" "$COMMON_PASSWORD" "true" "custom:active_seasons" "$ACTIVE_SEASONS_JSON3"
    echo "Cognito Test user '$EMAIL3' registered and confirmed successfully with only BCS league!"


    # 4. User with one managed club
    EMAIL4="test_already_registered3@user.test"
    MANAGED_CLUBS_JSON4='[{"league":"CLTTL","season":"2025-2026","club_name":"Morpeth Table Tennis Club","club_location":"London","manager_name":"Luca Minudel"}]'
    register_user "$EMAIL4" "$COMMON_PASSWORD" "true" "custom:managed_clubs" "$MANAGED_CLUBS_JSON4"
    echo "Cognito Test user '$EMAIL4' registered and confirmed successfully with one Managed Club!"


    # 5. User with NO active season and NO managed club
    EMAIL5="test_already_registered4@user.test"
    register_user "$EMAIL5" "$COMMON_PASSWORD" "true"
    echo "Cognito Test user '$EMAIL5' registered and confirmed successfully with NO active season and NO managed club!"

    # 6. User with multiple managed club
    EMAIL6="test_already_registered5@user.test"
    MANAGED_CLUBS_JSON6='[{"league": "CLTTL","season": "2025-2026","club_name": "Morpeth","club_location": "London","manager_name": "Luca Minudel"},{"league": "BCS","season": "2025-2026","club_name": "Morpeth","club_location": "London","manager_name": "Luca Minudel"},{"league": "FLICK","season": "2025-Nov","club_name": "Morpeth M","club_location": "Manchester","manager_name": "Luca Minudel"}]'
    register_user "$EMAIL6" "$COMMON_PASSWORD" "true" "custom:managed_clubs" "$MANAGED_CLUBS_JSON6"
    echo "Cognito Test user '$EMAIL6' registered and confirmed successfully with multiple Managed Clubs!"

    # 7. User Salvatore Bollito
    EMAIL7="test_kudos_wt@user.test"
    ACTIVE_SEASONS_JSON7='[{"league": "CLTTL", "season": "2025-2026","team_name": "Walworth Tigers","team_division": "Division 4","person_name": "Salvatore Bollito","role": "CAPTAIN"}]'
    register_user "$EMAIL7" "$COMMON_PASSWORD" "true" "custom:active_seasons" "$ACTIVE_SEASONS_JSON7"
    echo "Cognito Test user '$EMAIL7' registered and confirmed successfully!"


    # 8. User Charlie Boom
    EMAIL8="test_kudos_f5@user.test"
    ACTIVE_SEASONS_JSON8='[{"league": "CLTTL", "season": "2025-2026","team_name": "Fusion 5","team_division": "Division 4","person_name": "Charlie Boom","role": "PLAYER"}]'
    register_user "$EMAIL8" "$COMMON_PASSWORD" "true" "custom:active_seasons" "$ACTIVE_SEASONS_JSON8"
    echo "Cognito Test user '$EMAIL8' registered and confirmed successfully!"

fi


if [[ "$FORCE_CREATE" != "force" ]]; then
    echo "If you want to create the standard test users, add the 'force' parameter"

fi
