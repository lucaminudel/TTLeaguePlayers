#!/bin/bash

set -e

# Accept environment as parameter [staging|prod]
ENVIRONMENT=$1

# Validate environment parameter
if [[ ! "$ENVIRONMENT" =~ ^(staging|prod)$ ]]; then
    echo "Usage: $0 [staging|prod]"
    echo "Error: Invalid environment '$ENVIRONMENT'. Must be 'staging' or 'prod'."
    exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="eu-west-2"
BACKEND_STACK="ttleague-players-${ENVIRONMENT}"
COGNITO_STACK="ttleague-cognito-${ENVIRONMENT}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Backend Deployment - ${ENVIRONMENT}"
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
echo -e "${YELLOW}[1b/3] Getting Certificate ARN...${NC}"

CERTIFICATE_ARN=$(aws ssm get-parameter \
    --name "/ttleague/${ENVIRONMENT}/certificate-arn" \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

if [ -z "$CERTIFICATE_ARN" ] && [ -n "$BACKEND_CERTIFICATE_ARN" ]; then
    CERTIFICATE_ARN="$BACKEND_CERTIFICATE_ARN"
fi

if [ -z "$CERTIFICATE_ARN" ]; then
    echo -e "${RED}ERROR: Certificate ARN not found in SSM at /ttleague/${ENVIRONMENT}/certificate-arn${NC}"
    echo "You can bootstrap by setting BACKEND_CERTIFICATE_ARN=<arn> when running deploy scripts."
    exit 1
fi
echo "  Certificate ARN: $CERTIFICATE_ARN"

# Determine frontend domain (prod uses apex domain, staging uses subdomain)
if [[ "$ENVIRONMENT" == "prod" ]]; then
    ALLOWED_ORIGIN="https://ttleagueplayers.uk"
else
    ALLOWED_ORIGIN="https://${ENVIRONMENT}.ttleagueplayers.uk"
fi

echo ""
echo -e "${YELLOW}[2/3] Building backend...${NC}"

cd "$PROJECT_ROOT"
sam build --config-env "$ENVIRONMENT"

echo ""
echo -e "${YELLOW}[3/3] Deploying backend...${NC}"

API_DOMAIN="api-${ENVIRONMENT}.ttleagueplayers.uk"
if [[ "$ENVIRONMENT" == "prod" ]]; then
    API_DOMAIN="api.ttleagueplayers.uk"
fi

sam deploy --config-env "$ENVIRONMENT" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        "Environment=$ENVIRONMENT" \
        "LambdaArchitecture=arm64" \
        "DotnetBuildConfiguration=Release" \
        "DomainName=$API_DOMAIN" \
        "AllowedOrigin=$ALLOWED_ORIGIN" \
        "CognitoUserPoolId=$COGNITO_USER_POOL_ID" \
        "CognitoClientId=$COGNITO_CLIENT_ID" \
        "CognitoDomain=$COGNITO_DOMAIN" \
        "CertificateArn=$CERTIFICATE_ARN" \
        "HostedZoneId=Z07708401HNB3O1D566US" \
        "ApexDomain=ttleagueplayers.uk"

echo ""
echo -e "${GREEN}✓ Backend deployed successfully!${NC}"
echo "  API URL: https://api-${ENVIRONMENT}.ttleagueplayers.uk"
echo ""
