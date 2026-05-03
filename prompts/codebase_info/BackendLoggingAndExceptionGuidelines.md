# Backend Logging And Exception Guidelines


## Quick Rule

Layers responsibility:
- API Gateway knows HTTP request/response context.
- Lambda knows operation, workflow, user claims, and domain context.
- DataSource knows persisted data, keys, storage behavior, and invariants.

Logging calls:
- API Gateway's API calls logs `OnBusinessEvent`. Logs as INFO, a client/user operation. 
- API Gateway and Lambdas when needed logs `OnRuntimeCriticalError`. Logs as CRITICAL Cognito, SES, S3, AWS and runtime failures.
- Bad HTTP shape: API Gateway logs `OnRuntimeIrregularEvent`. Logs as WARNING, a client code error or something unexpected.
- Lambdas unexpected DataStore runtime failure log `OnRuntimeError`, then API Gateway logs fallback error/critical. Logs as ERROR, code error or or something unexpected.
- Lambdas unexpected Cognito runtime failure log `OnRuntimeError`, then API Gateway logs fallback error/critical. Logs as ERROR, code error or or something unexpected.
- Successful Lambda completion, then API Gateway completion also log `OnRuntimeRegularEvent`. Logs as INFO, domain operation. 
- Expected 4xx domain outcome: API Gateway logs `OnRuntimeRegularEvent`. Logs as INFO, failed input validation or business logic.
- Lambda security anomaly logs `OnSecurityError` and continues. Logs as ERROR, security info unavailable or does not match the operation.
- `OnSecurityIrregularEvent` is currently unused
- `OnSecurityRegularEvent` is currently unused
- DataSource validates and throws, but does not log.


## API Gateway

### Checks and Validations

- HTTP Url route exists.
- HTTP method is allowed.
- Path parameters are present and parseable.
- Query parameters needed to build the request object are present.
- `Content-Type` is supported.
- Required body exists.
- JSON body is syntactically valid.
- JSON body deserializes into the expected request DTO.

Do not check deep business rules here.

### Exceptions To Catch

Catch expected operation exceptions and map them to HTTP responses:

- `ValidationException` -> `400 BadRequest`.
- `KeyNotFoundException` -> `404 NotFound`.
- `UserNotFoundException` -> `422 UnprocessableEntity`.

Catch fallback exceptions at `Dispatch`:

- `ArgumentException` -> `400 BadRequest`.
- `InvalidOperationException` -> `400 BadRequest`, unless a more specific handler maps it.
- `SecurityException` -> `403 Forbidden`.
- `OperationCanceledException` -> `503 ServiceUnavailable`.
- AWS SDK exceptions -> `503 ServiceUnavailable`.
- Unknown `Exception` -> `500 InternalServerError`.

### Exceptions To Throw

Prefer returning handled HTTP responses for request-shape problems.

Throw only for invalid gateway state or impossible gateway flow.

### Log Calls

At the start of a real domain operation:

- `OnBusinessEvent("<OPERATION>", context, requestParameters)`

For malformed HTTP input, for Invalid path format, content type or content body:

- `OnRuntimeIrregularEvent( ... )`

For expected handled successful or unsuccessful outcomes:

- `OnRuntimeRegularEvent("<OPERATION> COMPLETED", ..., ResponseStatusCode)`

Use this for both success and expected 4xx outcomes.

For dispatch fallback failures:

- `OnRuntimeError(...)` for runtime fallback exceptions.
- `OnRuntimeCriticalError(...)` for AWS/service/unexpected failures.
- `OnSecurityError(...)` for enforced security failures caught at API level.

At the end of every handled request:

- `OnRuntimeRegularEvent("API DISPATCH COMPLETED", ..., ResponseStatusCode)`

## Lambdas

### Checks and Validations

- Input
  - Required command/query fields that express the operation.
  - Field combinations that make the command meaningful.
  - Operation-specific ranges, such as positive timestamps or allowed values.
- Business rules
  - rules that need workflow knowledge.
  - rules that need another service.
- User-claim checks and security diagnostics.

Examples of Lambda-level checks:

- Invite role matches required invite fields.
- Accept invite is idempotent if already accepted.
- Accept invite updates the correct Cognito attribute.
- Kudos request matches user claims, if checked diagnostically or as authorization.
- Kudos creation updates both DynamoDB and Cognito workflow state.

### Exceptions To Catch

Catch only when the Lambda can add useful operation context.
Catch:
- `SecurityValidationException` when the security check is diagnostic and non-blocking.
- `KeyNotFoundException` when adding a cleaner domain message or logging an expected not-found outcome.
- Broad `Exception` only when adding useful domain context before rethrowing.

Do not catch just to rethrow unchanged.

### Exceptions To Throw

Throw:
- `ValidationException` for command validation or business-rule rejection that should return `400`.
- `KeyNotFoundException` when a required entity is missing and should return `404`.
- `InvalidOperationException` for impossible workflow state, unsupported domain subtype, or corrupted Cognito custom attributes.
- A security exception only when the check is enforcing authorization and should stop the request.

For diagnostic security checks, do not throw after logging unless the product behavior changes to enforced authorization.

### Log Calls

For successful domain completion:

- `OnRuntimeRegularEvent("<OPERATION> COMPLETED", source, context, domainParameters)`

For expected domain states:

- `OnRuntimeRegularEvent("<OPERATION> COMPLETED", ...)` when the (business rule, etc.) failure is expected and maps to a handled response.

For diagnostic security anomalies:

- `OnSecurityError(ex, context, parameters, userClaims)`

Current convention: these are non-blocking inspection signals for bugs or threats, even though this method currently emits `ERROR`.

For runtime failures where Lambda adds useful context:

- `OnRuntimeError(ex, context, domainParameters, userClaims)`
- Then `throw;`

Do not log successful completion after an unexpected exception.

## DataSource

### Checks and Validations

- Schema
  - Required persisted fields.
  - Valid table keys and lookup keys.
  - Valid entity shape before serialization.
- Persistence invariants that must always hold.
- Storage-level idempotency conditions.

Examples of DataSource-level checks:

- Invite has required common fields.
- Invite subtype has required subtype fields.
- Kudos value is `-1`, `0`, or `1`.
- Kudos receiving team is home or away team.
- Kudos giver team is home or away team.
- Kudos giver team is not receiving team.

Do not check user claims or authorization here.

### Exceptions To Catch

Catch storage-specific exceptions only to:

- Implement idempotency.
- Convert conditional storage failure into a clearer domain exception.

Examples:

- Conditional update failed because record does not exist -> throw `KeyNotFoundException`.
- Conditional insert failed because record already exists and operation is idempotent -> return.

Do not catch AWS exceptions just to wrap them generically.

### Exceptions To Throw

Throw:

- Expected
  - `ValidationException` for invalid persisted entity data or persistence invariants.
  - `KeyNotFoundException` when required data is missing.
- Unexpected
  - `ArgumentException` or `ArgumentNullException` for invalid internal method arguments.
  - `InvalidOperationException` for impossible persisted state.

Let AWS SDK exceptions bubble unless translating them gives a clearer domain meaning.

### Log Calls

Do not call `ILoggerObserver` from DataSource classes.

DataSource usually lacks:

- HTTP request context.
- Authenticated user context.
- Operation intent.
- Final response status.

Throw precise exceptions and let Lambda or API Gateway log with richer context.

