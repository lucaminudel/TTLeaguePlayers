namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message)
    {
    }
}