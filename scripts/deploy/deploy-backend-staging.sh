#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENVIRONMENT="staging"
REGION="eu-west-2"
BACKEND_STACK="ttleague-players-staging"
COGNITO_STACK="ttleague-cognito-staging"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Backend Deployment - Staging"
echo "========================================"
echo ""

# Get Cognito values
echo -e "${YELLOW}[1/3] Getting Cognito configuration...${NC}"

COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$COGNITO_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
    --output text)

COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$COGNITO_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
    --output text)

COGNITO_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "$COGNITO_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoDomain`].OutputValue' \
    --output text)

echo "  UserPoolId: $COGNITO_USER_POOL_ID"
echo "  ClientId: $COGNITO_CLIENT_ID"

echo ""
echo -e "${YELLOW}[2/3] Building backend...${NC}"

cd "$PROJECT_ROOT"
sam build --config-env staging

echo ""
echo -e "${YELLOW}[3/3] Deploying backend...${NC}"

sam deploy --config-env staging \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        "Environment=staging" \
        "LambdaArchitecture=arm64" \
        "DotnetBuildConfiguration=Release" \
        "DomainName=api-staging.ttleagueplayers.uk" \
        "AllowedOrigin=https://staging.ttleagueplayers.uk" \
        "CognitoUserPoolId=$COGNITO_USER_POOL_ID" \
        "CognitoClientId=$COGNITO_CLIENT_ID" \
        "CognitoDomain=$COGNITO_DOMAIN" \
        "HostedZoneId=Z07708401HNB3O1D566US" \
        "ApexDomain=ttleagueplayers.uk"

echo ""
echo -e "${GREEN}✓ Backend deployed successfully!${NC}"
echo "  API URL: https://api-staging.ttleagueplayers.uk"
echo ""
