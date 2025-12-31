namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class ValidationException : Exception
{
    public List<string> Errors { get; }

    public ValidationException(List<string> errors) : base("Validation failed")
    {
        Errors = errors;
    }
}