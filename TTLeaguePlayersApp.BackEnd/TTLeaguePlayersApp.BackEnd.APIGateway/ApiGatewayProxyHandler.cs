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
    

    public ApiGatewayProxyHandler()
    {
        _getInviteLambda = new GetInviteLambda();
        _createInviteLambda = new CreateInviteLambda();
        _allowedOrigin = "*"; // Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*"; replace Environment.GetEnvironmentVariable with DataStore.Configuration
        _allowedOriginsWhitelist = new(StringComparer.OrdinalIgnoreCase);
    }

    public ApiGatewayProxyHandler(GetInviteLambda getInviteLambda, CreateInviteLambda createInviteLambda, string allowedOrigin, IEnumerable<string>? allowedOriginsWhitelist = null)
    {
        _getInviteLambda = getInviteLambda;
        _createInviteLambda = createInviteLambda;
        _allowedOrigin = allowedOrigin; 
        _allowedOriginsWhitelist = new HashSet<string>(allowedOriginsWhitelist ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
    }

    public async Task<APIGatewayProxyResponse> Dispatch(APIGatewayProxyRequest request, ILambdaContext context)
    {
        context.Logger.LogInformation($"Processing {request.HttpMethod} request for path {request.Path}");


        try
        {
            var path = NormalizePath(request.Path);
            var method = (request.HttpMethod ?? string.Empty).ToUpperInvariant();

            return (method, path) switch
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
        }
        catch (ArgumentException ex)
        {
            context.Logger.LogError($"Bad request: {ex.Message}");
            return CreateResponse(HttpStatusCode.BadRequest, new { message = $"Invalid request: {ex.Message}" });
        }
        catch (InvalidOperationException ex)
        {
            // Default to 400 here; individual handlers can override to 404 where appropriate
            context.Logger.LogError($"Invalid operation: {ex.Message}");
            return CreateResponse(HttpStatusCode.BadRequest, new { message = $"Invalid operation: {ex.Message}" });
        }
        catch (OperationCanceledException ex)
        {
            context.Logger.LogError($"Request cancelled: {ex.Message}");
            return CreateResponse(HttpStatusCode.RequestTimeout, new { message = $"Request cancelled: {ex.Message}" });
        }
        catch (SecurityException ex)
        {
            context.Logger.LogError($"Forbidden: {ex.Message}");
            return CreateResponse(HttpStatusCode.Forbidden, new { message = ex.Message });
        }
        catch (Exception ex) when (ex.GetType().FullName?.StartsWith("Amazon.") == true)
        {
            context.Logger.LogError($"Amazon service error: {ex.Message}");
            return CreateResponse(HttpStatusCode.ServiceUnavailable, new { message = $"Amazon service error: {ex.Message}" });
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error processing request: {ex.Message}");
            context.Logger.LogError(ex.StackTrace);
            return CreateResponse(HttpStatusCode.InternalServerError, new { message = $"Internal Server Error: {{Additional info: Error type:{ex.GetType()}; Error message:{ex.Message}}}" });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleGetInviteById(APIGatewayProxyRequest request, ILambdaContext context)
    {
        string? nanoId;
        TryToExtractSegment1PathParameter(request, out nanoId);
        if (string.IsNullOrEmpty(nanoId))
        {
            return CreateResponse(HttpStatusCode.BadRequest, new { message = "Invalid path format. Missing nano_id." });
        }

        try
        {
            var invite = await _getInviteLambda.HandleAsync(nanoId, context);
            return CreateResponse(HttpStatusCode.OK, invite);
        }
        catch (ValidationException ex)
        {
            return CreateResponse(HttpStatusCode.BadRequest, new { message = "Validation failed", errors = ex.Errors });
        }
        catch (NotFoundException ex)
        {
            return CreateResponse(HttpStatusCode.NotFound, new { message = ex.Message });
        }
    }

    private async Task<APIGatewayProxyResponse> HandleCreateInvite(APIGatewayProxyRequest request, ILambdaContext context)
    {
        // Validate Content-Type header is JSON
        if (!IsJsonContentType(request.Headers, out var contentTypeError))
        {
            return CreateResponse(HttpStatusCode.UnsupportedMediaType, new { message = contentTypeError });
        }

        TryDeserialize<CreateInviteRequest>(request.Body ?? string.Empty, out var createRequest, out var errorStatusCode, out var errorMessage);

        if (createRequest is null)
        {
            return CreateResponse(errorStatusCode, new { message = errorMessage });
        }

        try
        {
            var createdInvite = await _createInviteLambda.HandleAsync(createRequest, context);
            var additionalHeaders = new Dictionary<string, string> { { "Location", $"/invites/{createdInvite.NanoID}" } };
            return CreateResponse(HttpStatusCode.Created, createdInvite, additionalHeaders);
        }
        catch (ValidationException ex)
        {
            return CreateResponse(HttpStatusCode.BadRequest, new { message = "Validation failed", errors = ex.Errors });
        }
        catch (NotFoundException ex)
        {
            return CreateResponse(HttpStatusCode.NotFound, new { message = ex.Message });
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
}
