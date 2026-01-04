#!/bin/bash

# Register test user for TTLeague environments
# Usage: ./register-test-user.sh [dev|test]

ENVIRONMENT=$1
EMAIL="test_already_registered@user.test"
PASSWORD="aA1!56789012"

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test]"
    exit 1
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "test" ]]; then
    echo "Error: Only 'dev' and 'test' environments are allowed"
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

#echo "User Pool ID: $USER_POOL_ID"
#echo "Registering user: $EMAIL"

# Create user
aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL \
    --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true \
    --temporary-password $PASSWORD \
    --message-action SUPPRESS > /dev/null

# Set permanent password and confirm user
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $EMAIL \
    --password $PASSWORD \
    --permanent

echo "Cognito Test user '$EMAIL' registered and confirmed successfully!"