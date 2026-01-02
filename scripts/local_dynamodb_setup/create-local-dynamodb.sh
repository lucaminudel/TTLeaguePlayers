#!/bin/bash

echo "Starting local DynamoDB containers..."
docker-compose up -d

echo "Waiting for containers to be ready..."
sleep 3

echo "DynamoDB Local containers running:"
echo "- Dev environment: http://host.docker.internal:8000"
echo "- Test environment: http://host.docker.internal:8001"

echo "DB URL"
echo "Add to /etc/hosts this: 127.0.0.1       host.docker.internal"
echo "to give access to the db to both the local frontend and the lambdas running"
echo "in the local docker."
echo ""
echo "TABLE CREATION"
echo "To create local tables on the local dynamodb extract the definition"
echo "from template.yalm in a temprary aws commans shell to keep a single source of truth."
