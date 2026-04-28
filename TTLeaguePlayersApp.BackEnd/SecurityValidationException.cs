namespace TTLeaguePlayersApp.BackEnd;

public class SecurityValidationException : ValidationException
{

    public SecurityValidationException(List<string> errors) : base(errors)
    {
    }
}