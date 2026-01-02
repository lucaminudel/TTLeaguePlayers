#!/bin/bash

# Get Cognito values after deployment
# Usage: ./get-cognito-values-for-env-config-files.sh [dev|test|staging|prod]

ENVIRONMENT=$1
STACK_NAME="ttleague-cognito-$ENVIRONMENT"

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test|staging|prod]"
    exit 1
fi

echo "Getting Cognito values for $ENVIRONMENT environment..."

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
    --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='CognitoClientId'].OutputValue" \
    --output text)

DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='CognitoDomain'].OutputValue" \
    --output text)

echo "Update config/$ENVIRONMENT.env.json with:"
echo "\"UserPoolId\": \"$USER_POOL_ID\","
echo "\"ClientId\": \"$CLIENT_ID\","
echo "\"Domain\": \"$DOMAIN\""