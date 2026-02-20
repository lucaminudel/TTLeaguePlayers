using Amazon.Lambda.Core;
using Amazon.Lambda.S3Events;
using Amazon.S3;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using MimeKit;

namespace TTLeaguePlayersApp.BackEnd.Utilities;

public class EmailForwarderLambda
{
    private readonly IAmazonS3 _s3Client;
    private readonly IAmazonSimpleEmailServiceV2 _sesClient;
    private readonly string _forwardTo;
    private readonly ILoggerObserver _observer;

    public EmailForwarderLambda() : this(new LoggerObserver(), new AmazonS3Client(), new AmazonSimpleEmailServiceV2Client())
    {
    }

    public EmailForwarderLambda(ILoggerObserver observer, IAmazonS3 s3Client, IAmazonSimpleEmailServiceV2 sesClient)
    {
        _s3Client = s3Client;
        _sesClient = sesClient;
        _forwardTo = "luca.minudel@gmail.com";
        _observer = observer;   
    }

    public async Task HandleAsync(S3Event s3Event, ILambdaContext context)
    {
        foreach (var record in s3Event.Records)
        {
            var bucket = record.S3.Bucket.Name;
            var key = record.S3.Object.Key;

            context.Logger.LogInformation($"Processing email from {bucket}/{key}");

            using var response = await _s3Client.GetObjectAsync(bucket, key);
            using var ms = new MemoryStream();
            await response.ResponseStream.CopyToAsync(ms);
            ms.Position = 0;

            // Parse the email using MimeKitLite
            var message = MimeMessage.Load(ms);

            _observer.OnBusinessEvent("EMAIL FORWARDING", context,
                parameters: new () { ["S3 bucket"] = bucket, ["S3 key"] = key, ["From"] = message.From.ToString(), ["To"] = message.To.ToString() });

            // Remove problematic headers
            var headersToStrip = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Return-Path", "Received", "X-SES-RECEIPT", "X-SES-DKIM-SIGNATURE",
                "Authentication-Results", "Received-SPF", "X-Gmail-Message-State", "X-Received",
                "X-SES-CONFIGURATION-SET", "X-SES-MESSAGE-TAGS"
            };

            foreach (var header in headersToStrip)
            {
                message.Headers.RemoveAll(header);
            }

            // Save original From
            var originalFromMailbox = message.From.Mailboxes.FirstOrDefault();
            var originalEmail = originalFromMailbox?.Address ?? string.Empty;
            var obfuscatedEmail = originalEmail.Replace("@", " at ");
            
            // Extract the recipient email address (who the email was sent to)
            var recipientEmail = message.To.Mailboxes.FirstOrDefault()?.Address ?? "contact_us@ttleagueplayers.uk";
            var manualFromHeader = $"\"Forwarded - Originally from {obfuscatedEmail}\" <{recipientEmail}>";

            // Remove all existing From headers and inject the manual one
            message.Headers.RemoveAll("From");
            message.Headers.Add("From", manualFromHeader);

            var originalFrom = originalFromMailbox?.ToString() ?? "Unknown Sender";
            message.Headers.Add("Reply-To", originalFrom);

            // Set To
            message.To.Clear();
            message.To.Add(new MailboxAddress(_forwardTo, _forwardTo));

            // Write the modified message to a stream
            using var outputStream = new MemoryStream();
            message.WriteTo(outputStream);
            outputStream.Position = 0;

            var sendRequest = new SendEmailRequest
            {
                Content = new EmailContent
                {
                    Raw = new RawMessage
                    {
                        Data = outputStream
                    }
                },
                Destination = new Destination
                {
                    ToAddresses = new List<string> { _forwardTo }
                }
            };

            try
            {
                await _sesClient.SendEmailAsync(sendRequest);
                
                // Automatically delete the raw email from S3 after a successful forward
                await _s3Client.DeleteObjectAsync(bucket, key);
            }
            catch (Exception ex)
            {
                _observer.OnRuntimeCriticalError(ex, context,
                    parameters: new () { ["Class"] = nameof(EmailForwarderLambda), ["Method"] = nameof(HandleAsync), 
                                        ["Bucket"] = bucket, ["Key"] = key });

                // continue with the next record without deleting this email, so it can be retried later
            }
        }
        _observer.OnRuntimeRegularEvent("EMAIL FORWARDING COMPLETED",
            source: new() { ["Class"] =  nameof(EmailForwarderLambda), ["Method"] =  nameof(HandleAsync) }, 
            context, parameters: new () { [nameof(s3Event)] = s3Event.ToString() ?? "" } );

    }
}
