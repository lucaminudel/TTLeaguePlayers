#!/bin/bash

aws logs describe-query-definitions --region eu-west-2 --output json --no-paginate > aws_cloudwatch_queries.json
echo CloudWatch Logs Insights queries exported to aws_cloudwatch_queries.json