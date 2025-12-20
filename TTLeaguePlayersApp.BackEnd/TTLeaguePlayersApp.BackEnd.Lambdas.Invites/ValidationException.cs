namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class ValidationException : Exception
{
    public List<string> Errors { get; }

    public ValidationException(List<string> errors) : base("Validation failed")
    {
        Errors = errors;
    }
}