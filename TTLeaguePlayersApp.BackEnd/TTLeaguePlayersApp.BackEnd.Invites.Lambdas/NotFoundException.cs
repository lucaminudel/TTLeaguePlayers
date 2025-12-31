namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message)
    {
    }
}