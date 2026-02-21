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

# ==============================================================================
# STAGING DEPLOYMENT SCRIPT
# ==============================================================================
# This script deploys the complete TTLeague Players application to staging/prod:
# - Backend (Lambda, API Gateway, DynamoDB)
# - Frontend (S3, CloudFront)
# - DNS configuration (Route 53)
#
# AWS SETUP PREREQUISITES (must be completed before running this script):
# ==============================================================================
# 1. Domain Registration & DNS:
#    - Register domain: ttleagueplayers.uk (Route 53 or external registrar)
#    - Create Route 53 hosted zone for ttleagueplayers.uk
#    - Update domain nameservers to point to Route 53 (if external registrar)
#
# 2. SSL Certificates (ACM):
#    - us-east-1 certificate for CloudFront (frontend):
#      arn:aws:acm:us-east-1:318866803001:certificate/f14f89b6-d8a6-41f4-b5cb-fc33842188af
#    - eu-west-2 certificate for API Gateway (backend):
#      arn:aws:acm:eu-west-2:318866803001:certificate/e7d44891-30b3-4c47-9f6a-aee908d4c57c
#    - Add DNS validation CNAME records to Route 53
#    - Wait for certificates to be validated (Status: ISSUED)
#
# 3. SSM Parameters:
#    - Store backend certificate ARN:
#      aws ssm put-parameter --name /ttleague/staging/certificate-arn \
#        --value "arn:aws:acm:eu-west-2:..." --type String --region eu-west-2
#    - Store frontend certificate ARN:
#      aws ssm put-parameter --name /ttleague/staging/cloudfront-certificate-arn \
#        --value "arn:aws:acm:us-east-1:..." --type String --region eu-west-2
#
# 4. Cognito User Pool:
#    - Deploy Cognito stack:
#      ./deploy-cognito.sh [dev|test|staging|prod]
#    - Verify stack outputs: UserPoolId, ClientId, Domain
#       ./get-cognito-values-for-env-config-files.sh [dev|test|staging|prod]
#
#
# ==============================================================================

REGION="eu-west-2"
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"

# Domain configuration
if [[ "$ENVIRONMENT" == "prod" ]]; then
    FRONTEND_DOMAIN="ttleagueplayers.uk"
    API_DOMAIN="api.ttleagueplayers.uk"
else
    FRONTEND_DOMAIN="${ENVIRONMENT}.ttleagueplayers.uk"
    API_DOMAIN="api-${ENVIRONMENT}.ttleagueplayers.uk"
fi
FRONTEND_URL="https://${FRONTEND_DOMAIN}"

# Stack names
BACKEND_STACK="ttleague-players-${ENVIRONMENT}"
FRONTEND_STACK="ttleague-frontend-${ENVIRONMENT}"
COGNITO_STACK="ttleague-cognito-${ENVIRONMENT}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  TTLeague Players - ${ENVIRONMENT} Deployment"
echo "========================================"
echo ""

# ==============================================================================
# 1. VERIFY PREREQUISITES
# ==============================================================================
echo -e "${YELLOW}[1/7] Verifying prerequisites...${NC}"

# Check Cognito stack exists
if ! aws cloudformation describe-stacks --stack-name "$COGNITO_STACK" --region "$REGION" &>/dev/null; then
    echo -e "${RED}ERROR: Cognito stack '$COGNITO_STACK' not found${NC}"
    echo "Run: sam deploy --template-file cognito-template.yaml --stack-name $COGNITO_STACK --parameter-overrides Environment=staging --region $REGION --capabilities CAPABILITY_IAM"
    exit 1
fi

# Check certificates in SSM
BACKEND_CERTIFICATE_ARN_FROM_SSM=$(aws ssm get-parameter \
    --name "/ttleague/${ENVIRONMENT}/certificate-arn" \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

CLOUDFRONT_CERTIFICATE_ARN_FROM_SSM=$(aws ssm get-parameter \
    --name "/ttleague/${ENVIRONMENT}/cloudfront-certificate-arn" \
    --region "$REGION" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

if [ -z "$BACKEND_CERTIFICATE_ARN_FROM_SSM" ]; then
    if [ -n "$BACKEND_CERTIFICATE_ARN" ]; then
        echo -e "${YELLOW}⚠ Backend certificate ARN not found in SSM; will bootstrap using BACKEND_CERTIFICATE_ARN${NC}"
    else
        BACKEND_CERTIFICATE_ARN="arn:aws:acm:eu-west-2:318866803001:certificate/e7d44891-30b3-4c47-9f6a-aee908d4c57c"
        echo -e "${YELLOW}⚠ Backend certificate ARN not found in SSM; using default known ARN${NC}"
    fi
else
    BACKEND_CERTIFICATE_ARN="$BACKEND_CERTIFICATE_ARN_FROM_SSM"
fi

if [ -z "$CLOUDFRONT_CERTIFICATE_ARN_FROM_SSM" ]; then
    if [ -n "$CLOUDFRONT_CERTIFICATE_ARN" ]; then
        echo -e "${YELLOW}⚠ CloudFront certificate ARN not found in SSM; will bootstrap using CLOUDFRONT_CERTIFICATE_ARN${NC}"
    else
        CLOUDFRONT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:318866803001:certificate/f14f89b6-d8a6-41f4-b5cb-fc33842188af"
        echo -e "${YELLOW}⚠ CloudFront certificate ARN not found in SSM; using default known ARN${NC}"
    fi
else
    CLOUDFRONT_CERTIFICATE_ARN="$CLOUDFRONT_CERTIFICATE_ARN_FROM_SSM"
fi

echo -e "${GREEN}✓ Prerequisites verified${NC}"
echo ""

# ==============================================================================
# 2. BUILD & DEPLOY BACKEND
# ==============================================================================
echo -e "${YELLOW}[2/7] Building and deploying backend...${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Temporarily disable 'set -e' for backend deployment
set +e
BACKEND_DEPLOY_OUTPUT=$(BACKEND_CERTIFICATE_ARN="$BACKEND_CERTIFICATE_ARN" bash "$SCRIPT_DIR/deploy-backend.sh" "$ENVIRONMENT" 2>&1)
BACKEND_DEPLOY_EXIT_CODE=$?
set -e

# Always print backend deploy output for debugging
echo "$BACKEND_DEPLOY_OUTPUT"

# Check for 'No changes to deploy' and allow script to continue
if [ $BACKEND_DEPLOY_EXIT_CODE -ne 0 ]; then
    if echo "$BACKEND_DEPLOY_OUTPUT" | grep -q "No changes to deploy. Stack"; then
        echo -e "${YELLOW}Backend up to date: No changes to deploy${NC}"
    else
        echo -e "${RED}ERROR: Backend deployment failed${NC}"
        exit 1
    fi
fi

# Get API Gateway endpoint
API_GATEWAY_ID=$(aws cloudformation describe-stack-resources \
    --stack-name "$BACKEND_STACK" \
    --region "$REGION" \
    --query 'StackResources[?ResourceType==`AWS::ApiGateway::RestApi`].PhysicalResourceId' \
    --output text)

echo -e "${GREEN}✓ Backend deployed successfully${NC}"
echo "  API Gateway ID: $API_GATEWAY_ID"
echo ""

# ==============================================================================
# 3. DEPLOY FRONTEND INFRASTRUCTURE (S3 + CloudFront)
# ==============================================================================
echo -e "${YELLOW}[3/7] Deploying frontend infrastructure...${NC}"

cd "$PROJECT_ROOT"

# Get CloudFront certificate ARN from SSM (must exist)
CLOUDFRONT_CERT_ARN="$CLOUDFRONT_CERTIFICATE_ARN"

aws cloudformation deploy \
    --template-file frontend-template.yaml \
    --stack-name "$FRONTEND_STACK" \
    --parameter-overrides \
        "Environment=$ENVIRONMENT" \
        "DomainName=$FRONTEND_DOMAIN" \
        "CertificateArn=$CLOUDFRONT_CERT_ARN" \
    --region "$REGION" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Frontend infrastructure deployment failed${NC}"
    exit 1
fi

# Get CloudFront distribution ID
CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' \
    --output text 2>/dev/null || echo "")

echo -e "${GREEN}✓ Frontend infrastructure deployed${NC}"
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo "  CloudFront Distribution ID: $CLOUDFRONT_DISTRIBUTION_ID"
    echo "  CloudFront Domain: $CLOUDFRONT_DOMAIN"
fi
echo ""

# ==============================================================================
# 4. BUILD & DEPLOY FRONTEND
# ==============================================================================
echo -e "${YELLOW}[4/7] Building and deploying frontend...${NC}"

cd "$PROJECT_ROOT/TTLeaguePlayersApp.FrontEnd"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    npm install
fi

# Call the dedicated frontend deployment script
bash "$SCRIPT_DIR/deploy-frontend.sh" "$ENVIRONMENT"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Frontend deployment failed${NC}"
    exit 1
fi

echo ""

# ==============================================================================
# 5. CONFIGURE DNS (Route 53)
# ==============================================================================
echo -e "${YELLOW}[5/7] Configuring DNS...${NC}"

# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='ttleagueplayers.uk.'].Id" \
    --output text | cut -d'/' -f3)

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo -e "${RED}ERROR: Hosted zone for ttleagueplayers.uk not found${NC}"
    exit 1
fi

# Create/update A record for frontend (CloudFront)
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    cat > /tmp/dns-frontend.json <<EOF
{
    "Changes": [{
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": "${FRONTEND_DOMAIN}",
            "Type": "A",
            "AliasTarget": {
                "HostedZoneId": "Z2FDTNDATAQYW2",
                "DNSName": "${CLOUDFRONT_DOMAIN}",
                "EvaluateTargetHealth": false
            }
        }
    }]
}
EOF
    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/dns-frontend.json
    rm /tmp/dns-frontend.json
    echo "  Frontend DNS configured: $FRONTEND_DOMAIN -> $CLOUDFRONT_DOMAIN"
else
    echo -e "${YELLOW}  ⚠ CloudFront not found - skipping frontend DNS${NC}"
fi

# Configure DNS for API Gateway custom domain
# The custom domain is created by template.yaml when DomainName parameter is provided
# Get the API Gateway custom domain endpoint to create Route 53 record
API_CUSTOM_DOMAIN_ENDPOINT=$(aws apigateway get-domain-name \
    --domain-name "$API_DOMAIN" \
    --region "$REGION" \
    --query 'regionalDomainName' \
    --output text 2>/dev/null || echo "")

if [ -n "$API_CUSTOM_DOMAIN_ENDPOINT" ]; then
    cat > /tmp/dns-api.json <<EOF
{
    "Changes": [{
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": "${API_DOMAIN}",
            "Type": "CNAME",
            "TTL": 300,
            "ResourceRecords": [{"Value": "${API_CUSTOM_DOMAIN_ENDPOINT}"}]
        }
    }]
}
EOF
    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/dns-api.json
    rm /tmp/dns-api.json
    echo "  API custom domain DNS configured: $API_DOMAIN -> $API_CUSTOM_DOMAIN_ENDPOINT"
else
    echo -e "${YELLOW}  ⚠ API custom domain not found - will use default AWS endpoint${NC}"
fi

echo -e "${GREEN}✓ DNS configured${NC}"
echo ""

# ==============================================================================
# 6. TEST DEPLOYMENT
# ==============================================================================
echo -e "${YELLOW}[6/7] Testing deployment...${NC}"

# Test backend API
API_URL="https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/${ENVIRONMENT}"
echo "  Testing backend API: $API_URL"

if curl -s -o /dev/null -w "%{http_code}" "$API_URL/invites" | grep -q "200\|404"; then
    echo -e "${GREEN}✓ Backend API is responding${NC}"
else
    echo -e "${YELLOW}⚠ Backend API test inconclusive (may need custom domain)${NC}"
fi

# Test frontend
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "  Testing frontend: https://${CLOUDFRONT_DOMAIN}"
    if curl -s -o /dev/null -w "%{http_code}" "https://${CLOUDFRONT_DOMAIN}" | grep -q "200"; then
        echo -e "${GREEN}✓ Frontend is accessible via CloudFront${NC}"
    else
        echo -e "${YELLOW}⚠ Frontend test via CloudFront failed (may need time to propagate)${NC}"
    fi
fi

echo ""

# ==============================================================================
# DEPLOYMENT COMPLETE
# ==============================================================================
echo "========================================"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "========================================"
echo ""
echo "URLs:"
echo "  Frontend: https://${FRONTEND_DOMAIN}"
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "  CloudFront: https://${CLOUDFRONT_DOMAIN}"
fi
echo "  Backend API: $API_URL"
echo "  Backend API (custom domain): https://${API_DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Wait for DNS propagation (5-30 minutes)"
echo "  2. Wait for CloudFront deployment (10-15 minutes)"
echo "  3. Update frontend config with API URL: https://${API_DOMAIN}"
echo "  4. Test the application at https://${FRONTEND_DOMAIN}"
echo ""
