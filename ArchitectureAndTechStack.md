# App Architecture & Tech-stack
This is a high level description of the Architecture and the Tech-stack of the application named TTLeaguePlayers

## Architectural components
This is the list of key AWS cloud services used as key components of this cloud native serverless application:

1. **AWS S3**: hosting a Client-Side Rendered (CSR) Single Page App (SPA) 
2. **AWS CloudFront CDN**: serving the HTTP/HTTPS the web app pages hosted in S3
3. **AWS Lambda**: serverless microservices backend logic
4. **AWS API Gateway**: HTTPS API access to the lambdas 
5. **AWS Cognito**: sign-in, login, authorisation and basic users info
6. **AWS DynamoDB**: for persisting invitations and kudos
7. **AWS SES**: for emailing sign-in invites and notifications

## Tech-stack

### FrontEnd
The Client-Side Rendered (CSR) Single Page App (SPA)  web application to be hosted in AWS S3 is developed using:
- UI Library: React
- Language: Typescript
- CSS Framework: Tailwind CSS
- Amazon Cognito User Pools Library for React: amazon-cognito-identity-js
- Unit test framework: Vitest 
- E2e test framework: Playwright

This FrontEnd project is: TTLeaguePlayersApp.FrontEnd

### BackEnd
The cloud native serverless microservices using AWS Lambda, AWS API Gateway, AWS Cognito, AWS DynamoDB, and AWS SES is developed using:
- Development and run-time Framework: .NET 8
- Language: C#
 
 The whole backend is implemented as a single .NET project containing 
 - the Lambda functions: with one Lambda per Resource (instead of one per Command)
 - the API Gateway HTTPS API implementation: with a REST API style, API Gateway proxy pattern, without using AWS CDK and without using ASP&#46;NET Core
 - a data store access layer: to access the DynamoDB and the configuration info.

This single-project backend can be built with SAM without incurring in multi-projects .NET solutions not fully supported by the SAM build.
  
This BackEnd project is: TTLeaguePlayersApp.BackEnd

### Environments
There are four different environments for this application.
Two are manly local environment:
* Dev: to run and debug locally the whole application, it uses
	* AWS Cognito online: a dev instance 
	* Local SAM: to deploy the backend and its HTTPS API
	* Local DynamoDB: to access a local instance of the DynamoDB
	* Local Webserver: to run and debug the frontend locally instead of using S3
- Test: to run the automated e2e tests, it uses
	* AWS Cognito online: a test instance 
	* Local SAM: to deploy the backend and its HTTPS API
	* Local DynamoDB: to access a local instance of the DynamoDB
	* Local Webserver: to run the e2e automated tests.

And there are two are fully online environment:
* Staging: all the backend and frontend and the services are deployed and run online on Amazon,  on a nested subdomain
* Prod: all the backend and frontend and the services are deployed and run online on Amazon,  on the main domain.


