namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class SecurityValidationException : ValidationException
{

    public SecurityValidationException(List<string> errors) : base(errors)
    {
    }
}