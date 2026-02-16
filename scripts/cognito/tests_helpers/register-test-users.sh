#!/bin/bash

# Register test user for TTLeague environments
# Usage: ./register-test-users.sh [dev|test]

ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test|staging]"
    exit 1
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "test" && "$ENVIRONMENT" != "staging" ]]; then
    echo "Error: Only 'dev' and 'test' and 'staging' environments are allowed"
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



EMAIL="test_already_registered@user.test"
PASSWORD="aA1!56789012"

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL"

# Create the active_seasons JSON 
ACTIVE_SEASONS_JSON='[{"league": "CLTTL", "season": "2025-2026","team_name": "Morpeth 10","team_division": "Division 4","person_name": "Luca Minudel","role": "CAPTAIN"},{"league": "BCS","season": "2025-2026","team_name": "Morpeth B","team_division": "Division 2","person_name": "Luca Minudel","role": "CAPTAIN"},{"league": "FLICK","season": "2025-Nov","team_name": "Indiidual","team_division": "Division 1","person_name": "Luca Sr Minudel","role": "CAPTAIN"}]'

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes "Name=email,Value=$EMAIL" "Name=email_verified,Value=true" "Name=custom:active_seasons,Value='$ACTIVE_SEASONS_JSON'" \
    --temporary-password "$PASSWORD" \
    --message-action SUPPRESS > /dev/null


# Set permanent password and confirm user
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL \
    --password $PASSWORD \
    --permanent

echo "Cognito Test user '$EMAIL' registered and confirmed successfully!"



EMAIL2="test_ready_for_accept_invite_api_call@user.test"
PASSWORD2="aA1!56789012"

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL2"

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL2 \
    --user-attributes Name=email,Value=$EMAIL2 Name=email_verified,Value=true \
    --temporary-password $PASSWORD2 \
    --message-action SUPPRESS > /dev/null

echo "Cognito Test user '$EMAIL2' registered, not confirmed and pending for invite accepted API call!"



EMAIL3="test_already_registered2@user.test"
PASSWORD3="aA1!56789012"
# Create the active_seasons JSON with only BCS league
ACTIVE_SEASONS_JSON3='[{"league": "BCS", "season": "2025-2026","team_name": "Morpeth B","team_division": "Division 2","person_name": "Luca Minudel","role": "CAPTAIN"}]'

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL3"

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL3" \
    --user-attributes "Name=email,Value=$EMAIL3" "Name=email_verified,Value=true" "Name=custom:active_seasons,Value='$ACTIVE_SEASONS_JSON3'" \
    --temporary-password "$PASSWORD3" \
    --message-action SUPPRESS > /dev/null

# Set permanent password and confirm user
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL3 \
    --password $PASSWORD3 \
    --permanent

echo "Cognito Test user '$EMAIL3' registered and confirmed successfully with only BCS league!"



EMAIL4="test_kudos_wt@user.test"
PASSWORD4="aA1!56789012"

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL4"

# Create the active_seasons JSON 
ACTIVE_SEASONS_JSON4='[{"league": "CLTTL", "season": "2025-2026","team_name": "Walworth Tigers","team_division": "Division 4","person_name": "Salvatore Bollito","role": "CAPTAIN"}]'

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL4" \
    --user-attributes "Name=email,Value=$EMAIL4" "Name=email_verified,Value=true" "Name=custom:active_seasons,Value='$ACTIVE_SEASONS_JSON4'" \
    --temporary-password "$PASSWORD4" \
    --message-action SUPPRESS > /dev/null


# Set permanent password and confirm user
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL4 \
    --password $PASSWORD4 \
    --permanent

echo "Cognito Test user '$EMAIL4' registered and confirmed successfully!"



EMAIL5="test_kudos_f5@user.test"
PASSWORD5="aA1!56789012"

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL5"

# Create the active_seasons JSON 
ACTIVE_SEASONS_JSON5='[{"league": "CLTTL", "season": "2025-2026","team_name": "Fusion 5","team_division": "Division 4","person_name": "Charlie Boom","role": "PLAYER"}]'

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL5" \
    --user-attributes "Name=email,Value=$EMAIL5" "Name=email_verified,Value=true" "Name=custom:active_seasons,Value='$ACTIVE_SEASONS_JSON5'" \
    --temporary-password "$PASSWORD5" \
    --message-action SUPPRESS > /dev/null


# Set permanent password and confirm user
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL5 \
    --password $PASSWORD5 \
    --permanent

echo "Cognito Test user '$EMAIL5' registered and confirmed successfully!"