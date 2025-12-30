using System.Net;
using System.Web;
using System.Text.Json;
using System.Security;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace TTLeaguePlayersApp.BackEnd.APIGateway;

public class ApiGatewayProxyHandler
{
    private readonly GetInviteLambda _getInviteLambda;
    private readonly CreateInviteLambda _createInviteLambda;
    private readonly string _allowedOrigin; 
    private readonly HashSet<string> _allowedOriginsWhitelist;
    private readonly ILoggerObserver _observer;

    private APIGatewayProxyRequest? _currentRequest;
    private Dictionary<string, string> _requestParameters = new ();
    

    public ApiGatewayProxyHandler()
    {
        _observer = new LoggerObserver();

        _getInviteLambda = new GetInviteLambda(_observer);
        _createInviteLambda = new CreateInviteLambda(_observer);
        _allowedOrigin = "*"; // Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*"; replace Environment.GetEnvironmentVariable with DataStore.Configuration
        _allowedOriginsWhitelist = new(StringComparer.OrdinalIgnoreCase);
    }

    public ApiGatewayProxyHandler(GetInviteLambda getInviteLambda, CreateInviteLambda createInviteLambda, string allowedOrigin, IEnumerable<string>? allowedOriginsWhitelist = null)
    {
        _getInviteLambda = getInviteLambda;
        _createInviteLambda = createInviteLambda;
        _allowedOrigin = allowedOrigin; 
        _allowedOriginsWhitelist = new HashSet<string>(allowedOriginsWhitelist ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        _observer = new LoggerObserver();
    }

    public async Task<APIGatewayProxyResponse> Dispatch(APIGatewayProxyRequest request, ILambdaContext context)
    {

        _currentRequest = request;
        _requestParameters = new() { ["RequestHttpMethod"] = request.HttpMethod, ["RequestPath"] = request.Path };

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

                // Preflight for /invites/{nano_id}
                ("OPTIONS", var p) when p.StartsWith("/invites/") => CreatePreflightResponse("OPTIONS,GET", request),

                // Get an invite by nano_id: GET /invites/{nano_id}
                ("GET", var p) when p.StartsWith("/invites/") => await HandleGetInviteById(request, context),

                // Method not allowed for /invites/{id}
                (var m, var p) when p.StartsWith("/invites/") && m != "GET" && m != "OPTIONS" => CreateResponse(HttpStatusCode.MethodNotAllowed, new { message = "Method Not Allowed" }),

                // Fallback: 404 for unknown paths
                _ => CreateResponse(HttpStatusCode.NotFound, new { message = "Not Found" })
            };

            _observer.OnRuntimeRegularEvent("API DISPATCH COMPLETED",
                source: new() { ["Class"] =  nameof(ApiGatewayProxyHandler), ["Method"] =  nameof(Dispatch) }, 
                context, _requestParameters.With("ResponseStatusCode", response.StatusCode.ToString()) ,
                userClaims: GetAuthenticatedUserFromCognitoAuthorizerClaims());
            return response;
        }
        catch (ArgumentException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            _observer.OnRuntimeError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = $"Invalid request: {ex.Message}" });
        }
        catch (InvalidOperationException ex)
        {
            // Default to 400 here; individual handlers can override to 404 where appropriate
            var responseStatusCode = HttpStatusCode.BadRequest;

            _observer.OnRuntimeError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = $"Invalid operation: {ex.Message}" });
        }
        catch (OperationCanceledException ex)
        {
            var responseStatusCode = HttpStatusCode.RequestTimeout;

            _observer.OnRuntimeError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = $"Request cancelled: {ex.Message}" });
        }
        catch (SecurityException ex)
        {
            var responseStatusCode = HttpStatusCode.Forbidden;

            _observer.OnSecurityError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }
        catch (Exception ex) when (ex.GetType().FullName?.StartsWith("Amazon.") == true)
        {
            var responseStatusCode = HttpStatusCode.ServiceUnavailable;

            _observer.OnRuntimeCriticalError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = $"Amazon service error: {ex.Message}" });
        }
        catch (Exception ex)
        {
            var responseStatusCode = HttpStatusCode.InternalServerError;

            _observer.OnRuntimeCriticalError(ex, context, _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = $"Internal Server Error: {{Additional info: Error type:{ex.GetType()}; Error message:{ex.Message}}}" });
        }
        finally
        {
            _currentRequest = null;
            _requestParameters = new();
        }
    }

    private async Task<APIGatewayProxyResponse> HandleGetInviteById(APIGatewayProxyRequest request, ILambdaContext context)
    {
        string? nanoId;
        TryToExtractSegment1PathParameter(request, out nanoId);

        Dictionary<string, string> logSource = new() { ["Class"] = nameof(ApiGatewayProxyHandler), ["Method"] = nameof(HandleGetInviteById) };
        Dictionary<string, string> logParameters = new () { ["NanoId"] = nanoId ?? string.Empty };
        _observer.OnBusinessEvent("ACCESS INVITE", context, logParameters);

        if (string.IsNullOrEmpty(nanoId))
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Invalid path format. Missing nano_id.";

            _observer.OnRuntimeIrregularEvent("INVALID PATH FORMAT", 
                source: logSource, context,
                _requestParameters.With("ResponseStatusCode", responseStatusCode.ToString())
                                  .With("Message", errorMessage));

            return CreateResponse(responseStatusCode, new { message = errorMessage });
        }


        try
        {
            var invite = await _getInviteLambda.HandleAsync(nanoId, context);

            _observer.OnRuntimeRegularEvent("GET INVITE BY COMPLETED",
                source: logSource, context, logParameters);

            return CreateResponse(HttpStatusCode.OK, invite);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeError(ex, context, logParameters.With("ResponseStatusCode", responseStatusCode.ToString()).With("Message", errorMessage));
            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
        catch (NotFoundException ex)
        {
            var responseStatusCode = HttpStatusCode.NotFound;

            _observer.OnRuntimeError(ex, context, logParameters.With("ResponseStatusCode", responseStatusCode.ToString()));
            return CreateResponse(responseStatusCode, new { message = ex.Message });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleCreateInvite(APIGatewayProxyRequest request, ILambdaContext context)
    {
        Dictionary<string, string> logSource = new() { ["Class"] = nameof(ApiGatewayProxyHandler), ["Method"] = nameof(HandleCreateInvite) };
        Dictionary<string, string> logParameters = new () { ["RequestBody"] = request.Body ?? string.Empty };
        _observer.OnBusinessEvent("CREATE INVITE", context, logParameters);


        // Validate Content-Type header is JSON
        if (!IsJsonContentType(request.Headers, out var contentTypeError))
        {
            var responseStatusCode = HttpStatusCode.UnsupportedMediaType;
            var headers = JsonSerializer.Serialize(request.Headers);

            _observer.OnRuntimeIrregularEvent("INVALID CONTENT TYPE", 
                source: logSource, context,
                logParameters.With("ResponseStatusCode", responseStatusCode.ToString())
                             .With("Message", contentTypeError)
                             .With("Headers", headers));

            return CreateResponse(responseStatusCode, new { message = contentTypeError });
        }

        TryDeserialize<CreateInviteRequest>(request.Body ?? string.Empty, out var createRequest, out var bodyErrorStatusCode, out var bodyErrorMessage);

        if (createRequest is null)
        {
            _observer.OnRuntimeIrregularEvent("INVALID CONTENT BODY", 
                source: logSource, context,
                logParameters.With("ResponseStatusCode", bodyErrorStatusCode.ToString())
                             .With("Message", bodyErrorMessage));

            return CreateResponse(bodyErrorStatusCode, new { message = bodyErrorMessage });
        }

        try
        {
            var createdInvite = await _createInviteLambda.HandleAsync(createRequest, context);

            _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED",
                source: logSource, context, 
                logParameters.With("NanoId", createdInvite.NanoId));

            var additionalHeaders = new Dictionary<string, string> { { "Location", $"/invites/{createdInvite.NanoId}" } };
            return CreateResponse(HttpStatusCode.Created, createdInvite, additionalHeaders);
        }
        catch (ValidationException ex)
        {
            var responseStatusCode = HttpStatusCode.BadRequest;
            var errorMessage = "Validation failed";

            _observer.OnRuntimeError(ex, context, logParameters.With("ResponseStatusCode", responseStatusCode.ToString()).With("Message", errorMessage));
            return CreateResponse(responseStatusCode, new { message = errorMessage, errors = ex.Errors });
        }
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
            Body = JsonSerializer.Serialize(body),
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
            StatusCode = (int)HttpStatusCode.NoContent,
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

    private static void TryToExtractSegment1PathParameter(APIGatewayProxyRequest request, out string? id)
    {
        id = null;

        var segments = request.Path.Split('/', StringSplitOptions.RemoveEmptyEntries);
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

    private  (string userName, string userEmail) GetAuthenticatedUserFromCognitoAuthorizerClaims()
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

}
