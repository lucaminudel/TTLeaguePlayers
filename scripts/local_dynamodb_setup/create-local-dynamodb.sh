#!/bin/bash

echo "Starting local DynamoDB containers..."
docker-compose up -d

echo "Waiting for containers to be ready..."
sleep 3

echo "DynamoDB Local containers running:"
echo "- Dev environment: http://localhost:8000"
echo "- Test environment: http://localhost:8001"

echo ""
echo "To start SAM local:"
echo "sam local start-api --docker-network host --config-env dev"
echo ""
echo "To create local tables on the local dynamodb extract the definition "
echo "from template.yalm in a temprary aws commans shell to keep a single source of truth."
