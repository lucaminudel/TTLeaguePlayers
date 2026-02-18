#!/bin/bash

# Delete test users for TTLeague environments
# Usage: ./delete-test-users.sh [dev|test] [force]

ENVIRONMENT=$1
FORCE_DELETE=$2

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test|staging] [force]"
    exit 1
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "test" && "$ENVIRONMENT" != "staging" ]]; then
    echo "Error: Only 'dev' and 'test' and 'staging' environments are allowed"
    exit 1
fi

if [[ -n "$FORCE_DELETE" && "$FORCE_DELETE" != "force" ]]; then
    echo "Error: Second parameter must be empty or 'force'"
    exit 1
fi

STACK_NAME="ttleague-cognito-$ENVIRONMENT"

# echo "Getting Cognito User Pool ID for $ENVIRONMENT environment..."
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
    --output text)
if [ -z "$USER_POOL_ID" ]; then
    echo "Error: Could not get User Pool ID for $ENVIRONMENT environment"
    exit 1
fi

if [[ "$FORCE_DELETE" == "force" ]]; then
    # No test_* emails exclusion from deletion
    echo "All test_* users will be deleted ..."

    E1=""
    E2=""
    E3=""
    E4=""
    E5=""
else
    # Emails to exclude from deletion
    echo "Only dynamically created test_{number} users will be deleted ..."

    E1="test_already_registered@user.test"
    E2="test_ready_for_accept_invite_api_call@user.test"
    E3="test_already_registered2@user.test"
    E4="test_kudos_wt@user.test"
    E5="test_kudos_f5@user.test"
fi

# echo "User Pool ID: $USER_POOL_ID"
# echo "Finding users with email starting with 'test_'..."
# Get all users and filter by email starting with test_ but exclude specific emails
USERS=$(aws cognito-idp list-users \
    --user-pool-id $USER_POOL_ID \
    --query "Users[?Attributes[?Name=='email' && starts_with(Value, 'test_') && Value!='$E1' && Value!='$E2' && Value!='$E3' && Value!='$E4' && Value!='$E5']].Username" \
    --output text)

if [ -z "$USERS" ]; then
    echo "No Cognito users 'test_*' found in $ENVIRONMENT, the userpool is clean."
    exit 0
fi

# echo "Found users to delete:"
# for user in $USERS; do
#     echo "  - $user"
# done

#echo "Deleting users..."
for user in $USERS; do
#    echo "Deleting user: $user"
    aws cognito-idp admin-delete-user \
        --user-pool-id $USER_POOL_ID \
        --username $user
done

echo "   All Congito users 'test_*' in $ENVIRONMENT deleted successfully. The userpool is clean."