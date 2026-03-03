#!/bin/bash

# Deploy shared SES Receipt Rule Set for TTLeague email forwarding
# This creates and activates a single rule set shared by both staging and prod.
# Individual receipt rules are managed by the staging/prod CloudFormation stacks.
#
# This script is idempotent — safe to run multiple times.
# Must be run BEFORE deploying staging or prod (similar to deploy-cognito.sh).

REGION="eu-west-2"
RULE_SET_NAME="ttleague-rules"

echo "Creating SES Receipt Rule Set '$RULE_SET_NAME' (if not exists)..."
aws ses create-receipt-rule-set \
    --rule-set-name "$RULE_SET_NAME" \
    --region "$REGION" 2>/dev/null || true

echo "Setting '$RULE_SET_NAME' as active rule set..."
aws ses set-active-receipt-rule-set \
    --rule-set-name "$RULE_SET_NAME" \
    --region "$REGION"

echo "✓ SES Receipt Rule Set '$RULE_SET_NAME' is active"
