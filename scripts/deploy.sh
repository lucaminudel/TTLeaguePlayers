#!/bin/bash

# TTLeague Players Deployment Script
# Usage: ./scripts/deploy.sh <environment>
# Environments: dev, test, staging, prod

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment>"
    echo "Environments: dev, test, staging, prod"
    exit 1
fi

ENVIRONMENT=$1

case $ENVIRONMENT in
    dev|test|staging|prod)
        echo "Valid environment: $ENVIRONMENT"
        ;;
    *)
        echo "Invalid environment: $ENVIRONMENT"
        echo "Valid environments: dev, test, staging, prod"
        exit 1
        ;;
esac

echo "Building SAM application..."
sam build

if [ "$ENVIRONMENT" = "dev" ] || [ "$ENVIRONMENT" = "test" ]; then
    PORT=3000
    if [ "$ENVIRONMENT" = "test" ]; then
        PORT=3003
    fi
    
    echo "Starting local SAM for $ENVIRONMENT on port $PORT..."
    sam local start-api --config-env $ENVIRONMENT --port $PORT
else
    echo "Deploying to $ENVIRONMENT..."
    sam deploy --config-env $ENVIRONMENT
    
    echo "Deployment to $ENVIRONMENT completed successfully!"
fi