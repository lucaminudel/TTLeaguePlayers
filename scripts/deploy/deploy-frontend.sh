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
FRONTEND_DOMAIN="${ENVIRONMENT}.ttleagueplayers.uk"
if [[ "$ENVIRONMENT" == "prod" ]]; then
    FRONTEND_DOMAIN="ttleagueplayers.uk"
fi
FRONTEND_STACK="ttleague-frontend-${ENVIRONMENT}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Frontend Deployment - ${ENVIRONMENT}"
echo "========================================"
echo ""

# Get CloudFront distribution ID from stack
CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo -e "${RED}ERROR: CloudFront distribution ID not found${NC}"
    echo "Make sure the frontend infrastructure stack is deployed first."
    exit 1
fi

cd "$PROJECT_ROOT/TTLeaguePlayersApp.FrontEnd"

echo -e "${YELLOW}[1/3] Building frontend...${NC}"
npm run "build-web:${ENVIRONMENT}-env"

echo ""
echo -e "${YELLOW}[2/3] Deploying to S3...${NC}"
aws s3 sync dist/ "s3://${FRONTEND_DOMAIN}" --delete

echo ""
echo -e "${YELLOW}[3/3] Invalidating CloudFront cache...${NC}"
aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" \
    --output text > /dev/null

echo ""
echo -e "${GREEN}✓ Frontend deployed successfully!${NC}"
echo "  URL: https://${FRONTEND_DOMAIN}"
echo "  CloudFront invalidation in progress (1-3 minutes)"
echo ""
