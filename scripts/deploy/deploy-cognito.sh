#!/bin/bash

# Deploy Cognito configuration for TTLeague environments
# Usage: ./deploy-cognito.sh [dev|test|staging|prod]

# Configure you local access to your AWS account before using this
# with AWS CLI: aws configure (recommended)
# or setting the Environment variables:
#   export AWS_ACCESS_KEY_ID=your_key
#   export AWS_SECRET_ACCESS_KEY=your_secret
#   export AWS_DEFAULT_REGION=eu-west-2

ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 [dev|test|staging|prod]"
    exit 1
fi

case $ENVIRONMENT in
    dev|test)
        echo "Deploying $ENVIRONMENT environment with relaxed security settings..."
        echo "Using SAM to deploy only Cognito resources..."
        ;;
    staging|prod)
        echo "Deploying Cognito for $ENVIRONMENT environment..."
        echo "Remember also to deploy the main stack for $ENVIRONMENT environment..."
        echo " with sam deploy --resolve-s3 --config-env $ENVIRONMENT"
        ;;
    *)
        echo "Invalid environment. Use: dev, test, staging, or prod"
        exit 1
        ;;
esac


echo "--------------------------------------------------------------"
echo "Doing ..."
echo "--------------------------------------------------------------"
echo ""

sam deploy \
    --template-file cognito-template.yaml \
    --stack-name ttleague-cognito-$ENVIRONMENT \
    --parameter-overrides Environment=$ENVIRONMENT \
    --capabilities CAPABILITY_IAM \
    --no-confirm-changeset \
    --config-env $ENVIRONMENT \

echo ""
echo "--------------------------------------------------------------"
echo "... done !!!"
echo "--------------------------------------------------------------"
echo ""
echo ""
echo ""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/../cognito/get-cognito-values-for-env-config-files.sh" $ENVIRONMENT