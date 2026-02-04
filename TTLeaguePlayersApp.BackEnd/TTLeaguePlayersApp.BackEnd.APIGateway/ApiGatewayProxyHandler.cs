using System.Net;
using System.Web;
using System.Text;
using System.Text.Json;
using System.Security;
using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace TTLeaguePlayersApp.BackEnd.APIGateway;

public partial class ApiGatewayProxyHandler
{
    private readonly GetInviteLambda _getInviteLambda;
    private readonly CreateInviteLambda _createInviteLambda;
    private readonly AccepteInviteLambda _acceptInviteLambda;
    private readonly DeleteInviteLambda _deleteInviteLambda;
    private readonly CreateKudosLambda _createKudosLambda;
    private readonly DeleteKudosLambda _deleteKudosLambda;
    private readonly string _allowedOrigin; 
    private readonly HashSet<string> _allowedOriginsWhitelist;
    private readonly ILoggerObserver _observer;
        
    public ApiGatewayProxyHandler()
    {
        _observer = new LoggerObserver();

        var loader = new Loader();
        var config = loader.GetEnvironmentVariables();

        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = Amazon.RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }

        var invitesDataTable = new InvitesDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix);

        _createInviteLambda = new CreateInviteLambda(_observer, invitesDataTable);
        _getInviteLambda = new GetInviteLambda(_observer, invitesDataTable); 
        _acceptInviteLambda = new AccepteInviteLambda(_observer, invitesDataTable, new AmazonCognitoIdentityProviderClient(), config.Cognito.UserPoolId);
        _deleteInviteLambda = new DeleteInviteLambda(_observer, invitesDataTable);
         var kudosDataTable = new KudosDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix);
        _createKudosLambda = new CreateKudosLambda(_observer, kudosDataTable);
        _deleteKudosLambda = new DeleteKudosLambda(_observer, kudosDataTable);
        _allowedOrigin = "*"; // Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*"; replace with DataStore.Configuration
        _allowedOriginsWhitelist = new(StringComparer.OrdinalIgnoreCase);
    }

    public ApiGatewayProxyHandler(GetInviteLambda getInviteLambda, CreateInviteLambda createInviteLambda, AccepteInviteLambda markInviteAcceptedLambda, DeleteInviteLambda deleteInviteLambda, CreateKudosLambda createKudosLambda, DeleteKudosLambda deleteKudosLambda, InvitesDataTable invitesDataTable, KudosDataTable kudosDataTable, string allowedOrigin, IEnumerable<string>? allowedOriginsWhitelist = null)
    {
        _getInviteLambda = getInviteLambda;
        _createInviteLambda = createInviteLambda;
        _acceptInviteLambda = markInviteAcceptedLambda;
        _deleteInviteLambda = deleteInviteLambda;
        _createKudosLambda = createKudosLambda;
        _deleteKudosLambda = deleteKudosLambda;
        _allowedOrigin = allowedOrigin; 
        _allowedOriginsWhitelist = new HashSet<string>(allowedOriginsWhitelist ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        _observer = new LoggerObserver();
    }

    public async Task<APIGatewayProxyResponse> Dispatch(APIGatewayProxyRequest request, ILambdaContext context)
    {
        
        Dictionary<string, string> requestParameters = new() { ["RequestHttpMethod"] = request.HttpMethod, ["RequestPath"] = request.Path };

        try
        {
            var path = NormalizePath(request.Path);
            var method = (request.HttpMethod ?? string.Empty).ToUpperInvariant();

            var response = (method, path) switch
            {
                // Preflight for /invites
                ("OPTIONS", "/invites") => CreatePreflightResponse("OPTIONS,POST", request),

                // Create a new invite: POST /invites
                ("POST", "/invites") => await HandleCreateInvite(request, context),

                // Method not allowed for /invites
                (var m, "/invites") when m != "POST" && m != "OPTIONS" => CreateResponse(HttpStatusCode.MethodNotAllowed, new { message = "Method Not Allowed" }),

                // Preflight for /kudos
                ("OPTIONS", "/kudos") => CreatePreflightResponse("OPTIONS,POST,DELETE", request),

                // Create a new kudos: POST /kudos
                ("POST", "/kudos") => await HandleCreateKudos(request, context),

                // Delete a kudos: DELETE /kudos
                ("DELETE", "/kudos") => await HandleDeleteKudos(request, context),

                 // Method not allowed for /kudos
                (var m, "/kudos") when m != "POST" && m != "DELETE" && m != "OPTIONS" => CreateResponse(HttpStatusCode.MethodNotAllowed, new { message = "Method Not Allowed" }),

                // Preflight for /invites/{nano_id}
                ("OPTIONS", var p) when p.StartsWith("/invites/") => CreatePreflightResponse("OPTIONS,GET,PATCH,DELETE", request),

                // Update invite: PATCH /invites/{nano_id}
                ("PATCH", var p) when p.StartsWith("/invites/") => await HandlePatchInviteById(request, context),

                // Delete an invite by nano_id: DELETE /invites/{nano_id}
                ("DELETE", var p) when p.StartsWith("/invites/") => await HandleDeleteInviteById(request, context),

                // Get an invite by nano_id: GET /invites/{nano_id}
                ("GET", var p) when p.StartsWith("/invites/") => await HandleGetInviteById(request, context),

                // Method not allowed for /invites/{id}
                (var m, var p) when p.StartsWith("/invites/") && m != "GET" && m != "PATCH" && m != "DELETE" && m != "OPTIONS" => CreateResponse(HttpStatusCode.MethodNotAllowed, new { message = "Method Not Allowed" }),

                // Fallback: 404 for unknown paths
                _ => CreateResponse(HttpStatusCode.NotFound, new { message = "Not Found" })
            };

            _observer.OnRuntimeRegularEvent("API DISPATCH COMPLETED",
                source: new() { ["Class"] =  nameof(ApiGatewayProxyHandler), ["Method"] =  nameof(Dispatch) }, 
                context, requestParameters.With((HttpStatusCode)response.StatusCode),
                userClaims: GetAuthenticatedUserFromCognitoAuthorizerClaims(request));
            return response;
        }
        catch (ArgumentException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            _observer.OnRuntimeError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = $"Invalid request: {ex.Message}" });
        }
        catch (InvalidOperationException ex)
        {
            // Default to 400 here; individual handlers can override to 404 where appropriate
            var responseStatusCode = HttpStatusCode.BadRequest;

            _observer.OnRuntimeError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = $"Invalid operation: {ex.Message}" });
        }
        catch (SecurityException ex)
        {
            var responseStatusCode = HttpStatusCode.Forbidden;

            _observer.OnSecurityError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }
        catch (OperationCanceledException ex)
        {
            var responseStatusCode = HttpStatusCode.ServiceUnavailable;

            _observer.OnRuntimeError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = $"Request cancelled: {ex.Message}" });
        }
        catch (Exception ex) when (ex.GetType().FullName?.StartsWith("Amazon.") == true)
        {
            var responseStatusCode = HttpStatusCode.ServiceUnavailable;

            _observer.OnRuntimeCriticalError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = $"Amazon service error: {ex.Message}" });
        }
        catch (Exception ex)
        {
            var responseStatusCode = HttpStatusCode.InternalServerError;

            _observer.OnRuntimeCriticalError(ex, context, requestParameters.With(responseStatusCode));
            return CreateResponse(responseStatusCode, new { message = $"Internal Server Error: {{Additional info: Error type:{ex.GetType()}; Error message:{ex.Message}}}" });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleDeleteInviteById(APIGatewayProxyRequest request, ILambdaContext context)
    {

        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandleDeleteInviteById));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("DELETE INVITE", context, inParameters);

        ExtractNanoIdOrCreateResponseAndNotifyObserver(context, request.Path, inParameters, fromHere, out string? nanoId, out APIGatewayProxyResponse? createdResponse);
        if (nanoId is null)
            return createdResponse!;

        try
        {
            await _deleteInviteLambda.HandleAsync(nanoId, context);

            _observer.OnRuntimeRegularEvent("DELETE INVITE COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.NoContent));

            return CreateResponse(HttpStatusCode.NoContent);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("DELETE INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }

    }

    private async Task<APIGatewayProxyResponse> HandleGetInviteById(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandleGetInviteById));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("ACCESS INVITE", context, inParameters);

        ExtractNanoIdOrCreateResponseAndNotifyObserver(context, request.Path, inParameters, fromHere, out string? nanoId, out APIGatewayProxyResponse? createdResponse);
        if (nanoId is null)
            return createdResponse!;

        try
        {
            var invite = await _getInviteLambda.HandleAsync(nanoId, context);

            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.OK) );

            return CreateResponse(HttpStatusCode.OK, invite);
        }
        catch (NotFoundException ex)
        {
            var responseStatusCode = HttpStatusCode.NotFound;

            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",fromHere, context, inParameters.With(responseStatusCode) );

            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleCreateInvite(APIGatewayProxyRequest request, ILambdaContext context)
    {

        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandleCreateInvite));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("CREATE INVITE", context, inParameters);

        ExtractBodyOrCreateResponseAndNotifyObserver(context, request.Headers, request.Body, fromHere, inParameters, 
                                                     out CreateInviteRequest? createRequest, out APIGatewayProxyResponse? createdResponse);
        if (createRequest is null)
            return createdResponse!;

        try
        {
            var createdInvite = await _createInviteLambda.HandleAsync(createRequest, context);

            _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.Created));

            var additionalHeaders = new Dictionary<string, string> { { "Location", $"/invites/{createdInvite.NanoId}" } };
            return CreateResponse(HttpStatusCode.Created, createdInvite, additionalHeaders);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
    }

    private async Task<APIGatewayProxyResponse> HandlePatchInviteById(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandlePatchInviteById));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("ACCEPT INVITE", context, inParameters);

        ExtractNanoIdOrCreateResponseAndNotifyObserver(context, request.Path, inParameters, fromHere, out string? nanoId, out APIGatewayProxyResponse? createdNanoIdResponse);
        if (nanoId is null)
            return createdNanoIdResponse!;

        ExtractBodyOrCreateResponseAndNotifyObserver(context, request.Headers, request.Body, fromHere, inParameters, 
                                                     out PatchInviteRequest? patchRequest, out APIGatewayProxyResponse? createdResponse);
        if (patchRequest is null)
            return createdResponse!;

        if (patchRequest.AcceptedAt is null)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = $"Missing {JsonFieldName.For<Invite>(nameof(patchRequest.AcceptedAt))}.";

            _observer.OnRuntimeIrregularEvent("PATCH INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage });
        }

        try
        {
            var updatedInvite = await _acceptInviteLambda.HandleAsync(nanoId, patchRequest.AcceptedAt.Value, context);

            _observer.OnRuntimeRegularEvent("PATCH INVITE COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.OK));

            return CreateResponse(HttpStatusCode.OK, updatedInvite);
        }
        catch (NotFoundException ex)
        {
            var responseStatusCode = HttpStatusCode.NotFound;

            _observer.OnRuntimeRegularEvent("PATCH INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode) );

            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("PATCH INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
        catch(UserNotFoundException ex)
        {
            var responseStatusCode = HttpStatusCode.UnprocessableEntity;

            _observer.OnRuntimeRegularEvent("PATCH INVITE COMPLETED", fromHere, context, inParameters.With(responseStatusCode, ex.Message) );

            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }   
        catch (Exception ex) when (ex is TooManyRequestsException || ex is InternalErrorException)
        {
            var responseStatusCode = HttpStatusCode.ServiceUnavailable;
            
            _observer.OnRuntimeCriticalError(ex, context, inParameters.With(responseStatusCode));

            var additionalHeaders = new Dictionary<string, string> { { "Retry-After", "900" } };
            return CreateResponse(responseStatusCode, new { message = "Service overloaded or temporarely down, retry." }, additionalHeaders);
        }
    }

    private async Task<APIGatewayProxyResponse> HandleCreateKudos(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandleCreateKudos));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("GIVE KUDOS", context, inParameters);

        ExtractBodyOrCreateResponseAndNotifyObserver(context, request.Headers, request.Body, fromHere, inParameters,
                                                     out CreateKudosRequest? createRequest, out APIGatewayProxyResponse? createdResponse);
        if (createRequest is null)
            return createdResponse!;

        // Extract claims to pass to Lambda for validation
        Dictionary<string, string> userClaims = ExtractUserClaims(request);

        try
        {
            var createdKudos = await _createKudosLambda.HandleAsync(createRequest, userClaims, context);

            _observer.OnRuntimeRegularEvent("CREATE KUDOS COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.Created));

            return CreateResponse(HttpStatusCode.Created, createdKudos);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("CREATE KUDOS COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleDeleteKudos(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var fromHere = GetSource(nameof(ApiGatewayProxyHandler), nameof(HandleDeleteKudos));
        var inParameters = GetInputParameters(request);

        _observer.OnBusinessEvent("DELETE KUDOS", context, inParameters);

        ExtractBodyOrCreateResponseAndNotifyObserver(context, request.Headers, request.Body, fromHere, inParameters,
                                                     out DeleteKudosRequest? deleteRequest, out APIGatewayProxyResponse? deleteResponse);
        if (deleteRequest is null)
            return deleteResponse!;

        Dictionary<string, string> userClaims = ExtractUserClaims(request);

        try
        {
            await _deleteKudosLambda.HandleAsync(deleteRequest, userClaims, context);

            _observer.OnRuntimeRegularEvent("DELETE KUDOS COMPLETED", fromHere, context, inParameters.With(HttpStatusCode.NoContent));

            return CreateResponse(HttpStatusCode.NoContent);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeRegularEvent("DELETE KUDOS COMPLETED", fromHere, context, inParameters.With(responseStatusCode, errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
    }

    private void ExtractNanoIdOrCreateResponseAndNotifyObserver(ILambdaContext context, string path, Dictionary<string, string> inParameters,  Dictionary<string, string> here, 
                                                out string? nanoId, out APIGatewayProxyResponse? createdResponse)
    {
        TryToExtract(path, out nanoId);
        if (!string.IsNullOrEmpty(nanoId)) {
            createdResponse = null;
            return;
        }
        
        var responseStatusCode = HttpStatusCode.BadRequest;
        var errorMessage = $"Invalid path format. Missing {JsonFieldName.For<Invite>(nameof(nanoId))}.";

        _observer.OnRuntimeIrregularEvent("INVALID PATH FORMAT", here, context, inParameters.With(responseStatusCode, errorMessage));

        createdResponse = CreateResponse(responseStatusCode, new { message = errorMessage });            
    }

    private void ExtractBodyOrCreateResponseAndNotifyObserver<T>(ILambdaContext context, IDictionary<string, string> headers, string body, Dictionary<string, string> fromHere, Dictionary<string, string> inParameters, out T? createRequest, out  APIGatewayProxyResponse?  createdResponse)
        where T : class
    {
        if (!IsJsonContentType(headers, out var contentTypeErrorMessage))
        {
            var responseStatusCode = HttpStatusCode.UnsupportedMediaType;;

            _observer.OnRuntimeIrregularEvent("INVALID CONTENT TYPE", fromHere, context, inParameters.With(responseStatusCode, contentTypeErrorMessage).With("Headers", JsonSerializer.Serialize(headers)));

            createRequest = null;
            createdResponse = CreateResponse(responseStatusCode, new { message = contentTypeErrorMessage });
            return ;
        }

        TryDeserialize<T>(body ?? string.Empty, out createRequest, out var bodyErrorStatusCode, out var bodyErrorMessage);

        if (createRequest is null)
        {
            _observer.OnRuntimeIrregularEvent("INVALID CONTENT BODY", fromHere, context, inParameters.With(bodyErrorStatusCode, bodyErrorMessage));

            createdResponse = CreateResponse(bodyErrorStatusCode, new { message = bodyErrorMessage });
            return ;
        }

        createdResponse = null;
    }

    private APIGatewayProxyResponse CreateResponse(HttpStatusCode statusCode)
    {
        var response = CreateResponse(statusCode, new {}, new Dictionary<string, string>());
        response.Body = string.Empty;

        return response;
    }

    private APIGatewayProxyResponse CreateResponse(HttpStatusCode statusCode, object body)
        => CreateResponse(statusCode, body, new Dictionary<string, string>());

    private APIGatewayProxyResponse CreateResponse(HttpStatusCode statusCode, object body, Dictionary<string, string> additionalHeaders)
    {
        var headers = BuildBaseCorsHeaders();
        foreach (var keyVal in additionalHeaders)
        {
            headers[keyVal.Key] = keyVal.Value;
        }

        return new APIGatewayProxyResponse
        {
            StatusCode = (int)statusCode,
            Body =  body is null ? string.Empty : JsonSerializer.Serialize(body),
            Headers = headers
        };
    }

    private APIGatewayProxyResponse CreatePreflightResponse(string allowedMethods, APIGatewayProxyRequest request)
    {
        var headers = BuildBaseCorsHeaders(request);

        // Respect custom request headers if provided by the browser
        if (request.Headers != null && request.Headers.TryGetValue("Access-Control-Request-Headers", out var reqHeaders))
        {
            headers["Access-Control-Allow-Headers"] = reqHeaders;
        }

        headers["Access-Control-Allow-Methods"] = allowedMethods;
        headers["Access-Control-Max-Age"] = "600"; // cache preflight for 10 minutes
        headers["Vary"] = "Origin,Access-Control-Request-Method,Access-Control-Request-Headers";

        return new APIGatewayProxyResponse
        {
            StatusCode = (int)HttpStatusCode.OK,
            Headers = headers,
            Body = string.Empty
        };
    }

    private Dictionary<string, string> BuildBaseCorsHeaders(APIGatewayProxyRequest? request = null)
    {
        var originFromRequest = request?.Headers != null && request.Headers.TryGetValue("Origin", out var originVal)
            ? originVal
            : null;

        var allowOrigin = ResolveAllowedOrigin(originFromRequest);

        return new Dictionary<string, string>
        {
            { "Access-Control-Allow-Origin", allowOrigin },
            { "Access-Control-Allow-Headers", "Content-Type,Authorization" },
            { "Access-Control-Allow-Credentials", "true" },
            { "Content-Type", "application/json; charset=utf-8" },
            { "Vary", "Origin" }
        };
    }

    private static void TryDeserialize<T>(string body, out T? validRequestOrNull, out HttpStatusCode errorStatusCode, out string errorMessage)
    {
        if (string.IsNullOrEmpty(body))
        {
            validRequestOrNull = default;
            errorStatusCode = HttpStatusCode.BadRequest;
            errorMessage = "Empty request body.";
            return;
        }

        try
        {
            validRequestOrNull = JsonSerializer.Deserialize<T>(body, JsonOptions);
        }
        catch (Exception ex)
        {
            errorStatusCode = HttpStatusCode.BadRequest;
            errorMessage = $"Invalid request body. {{Additional info: Error type:{ex.GetType()}; Error message:{ex.Message}}}";
            validRequestOrNull = default;
            return;
        }

        if (validRequestOrNull == null)
        {
            errorStatusCode = HttpStatusCode.BadRequest;
            errorMessage = "Invalid request body";
            return;
        }

        errorStatusCode = HttpStatusCode.OK;
        errorMessage = string.Empty;
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        PropertyNameCaseInsensitive = true
    };

    private static void TryToExtract(string path, out string? id)
    {
        id = null;

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 2)
        {
            id = SafeUrlDecode(segments[1]);
        }
    }

    private string ResolveAllowedOrigin(string? originFromRequest)
    {
        // If whitelist is set, reflect the origin only if it matches; otherwise, fall back to configured _allowedOrigin
        if (!string.IsNullOrWhiteSpace(originFromRequest) && _allowedOriginsWhitelist.Count > 0)
        {
            if (_allowedOriginsWhitelist.Contains(originFromRequest))
            {
                return originFromRequest;
            }
        }
        return _allowedOrigin;
    }

    private static bool IsJsonContentType(IDictionary<string, string>? headers, out string error)
    {
        error = string.Empty;
        if (headers is null) { return true; }

        if (headers.TryGetValue("Content-Type", out var ct) || headers.TryGetValue("content-type", out ct))
        {
            if (!string.IsNullOrWhiteSpace(ct))
            {
                var normalized = ct.ToLowerInvariant();
                if (normalized.Contains("application/json") || normalized.Contains("text/json"))
                {
                    return true;
                }

                error = $"Unsupported Content-Type '{ct}'. Expected application/json.";
                return false;
            }
        }

        // If header absent, be permissive
        return true;
    }

    private static string SafeUrlDecode(string potentiallyUrlEncodedString)
    {
        // Based on the deployment environment and the web server, a url encoded paramater could be received already decoded or not.
        // HttpUtility.UrlDecode handles both encoded and already-decoded strings safely

        if (string.IsNullOrEmpty(potentiallyUrlEncodedString))
            return potentiallyUrlEncodedString;
        
        try
        {
            string decoded = HttpUtility.UrlDecode(potentiallyUrlEncodedString);
            
            return decoded;
        }
        catch
        {
            return potentiallyUrlEncodedString;
        }
    }

    private static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "/";
        // Ensure leading slash and remove trailing slash (except for root)
        var p = path.StartsWith('/') ? path : "/" + path;
        return p.Length > 1 && p.EndsWith('/') ? p.TrimEnd('/') : p;
    }
    private Dictionary<string, string>  GetSource(string className, string methodName)
    {
        return new Dictionary<string, string> { ["Class"] = className, ["Method"] = methodName };
    }

    private Dictionary<string, string>  GetInputParameters(APIGatewayProxyRequest request) {
         return new() { ["RequestPath"] = request.Path ?? string.Empty, ["RequestBody"] = request.Body ?? string.Empty };
    }

    private  (string userName, string userEmail) GetAuthenticatedUserFromCognitoAuthorizerClaims(APIGatewayProxyRequest? _currentRequest)
    {
        var userName = string.Empty;
        var userEmail = string.Empty;
        if (_currentRequest?.RequestContext?.Authorizer?.Claims is System.Collections.Generic.IDictionary<string, string> claims)
        {

            if (claims.TryGetValue("email", out var email) && !string.IsNullOrWhiteSpace(email))
            {
                userEmail = email;
            }

            if (claims.TryGetValue("preferred_username", out var preferred) && !string.IsNullOrWhiteSpace(preferred))
                userName = preferred;
            else if (!string.IsNullOrWhiteSpace(email))
                userName = email;
            else if (claims.TryGetValue("cognito:username", out var cognitoUser) && !string.IsNullOrWhiteSpace(cognitoUser))
                userName = cognitoUser;
            else if (claims.TryGetValue("name", out var name) && !string.IsNullOrWhiteSpace(name))
                userName = name;
        }

        return (userName, userEmail);
    }

    private Dictionary<string, string> ExtractUserClaims(APIGatewayProxyRequest request)
    {
        Dictionary<string, string> userClaims = new();
        
        // 1. Try to get claims from the Authorizer (populated by API Gateway in the Cloud)
        if (request.RequestContext?.Authorizer?.Claims is IDictionary<string, string> authClaims)
        {
            foreach (var kvp in authClaims) userClaims[kvp.Key] = kvp.Value;
        }
        else if (request.RequestContext?.Authorizer?.Claims != null)
        {
            foreach (var key in request.RequestContext.Authorizer.Claims.Keys)
            {
                var val = request.RequestContext.Authorizer.Claims[key];
                userClaims[key] = val?.ToString() ?? string.Empty;
            }
        }

        // 2. Fallback for local C# Acceptance testing (test, dev environment) where Authorizer claims are not populated
        if (userClaims.Count == 0)
        {
            if (request.Headers != null && (request.Headers.TryGetValue("Authorization", out var authHeader) || request.Headers.TryGetValue("authorization", out authHeader)))
            {
                try
                {
                    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                        ? authHeader.Substring(7)
                        : authHeader;

                    var parts = token.Split('.');
                    if (parts.Length == 3)
                    {
                        var payload = parts[1];
                        // Add padding if needed for Base64 decoding
                        payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                        var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                        using var doc = JsonDocument.Parse(json);
                        foreach (var prop in doc.RootElement.EnumerateObject())
                        {
                            userClaims[prop.Name] = prop.Value.ToString() ?? string.Empty;
                        }
                    }
                }
                catch
                {
                    // Ignore parsing errors in fallback mode; security validation in Lambda will handle missing claims
                }
            }
        }

        return userClaims;
    }

}
