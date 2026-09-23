import React, { useState } from 'react';
import { Button } from '../common/Button';
import { ErrorMessage } from '../common/ErrorMessage';
import { FieldError } from '../common/FieldError';
import { FormField } from '../common/FormField';
import { Input } from '../common/Input';
import { toUserFriendlyApiError } from '../../utils/apiErrorUtils';
import { isValidEmail } from '../../utils/emailUtils';

interface InvitePlayerDialogProps {
    /** The player as the league site spells them; the invite is created under this name. */
    playerName: string;
    onCancel: () => void;
    /** Resolves when the invite exists. The caller closes the dialog; a rejection keeps it open. */
    onSend: (email: string) => Promise<void>;
}

/**
 * Collects the one thing no league page can tell us - the player's e-mail address - and hands it to
 * the caller to create the invite with.
 */
export const InvitePlayerDialog: React.FC<InvitePlayerDialogProps> = ({ playerName, onCancel, onSend }) => {
    const [email, setEmail] = useState('');
    const [hasTriedToSend, setHasTriedToSend] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const trimmedEmail = email.trim();
    const isEmailUsable = isValidEmail(trimmedEmail);

    const showEmailError = !isEmailUsable && (trimmedEmail !== '' || hasTriedToSend);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!isEmailUsable) {
            setHasTriedToSend(true);
            return;
        }

        setSendError(null);
        setIsSubmitting(true);
        try {
            await onSend(trimmedEmail);
        } catch (error: unknown) {
            const reasons = (error as { errors?: string[] }).errors;
            const message = toUserFriendlyApiError(error, 'Could not send the invite. Please try again.');

            setSendError(reasons && reasons.length > 0 ? `${message}: ${reasons.join('; ')}` : message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6"
                data-testid="invite-player-dialog"
            >
                <h3 className="text-xl font-bold text-main-text text-center">Invite {playerName}</h3>

                <form noValidate onSubmit={(event) => { void handleSubmit(event); }} data-testid="invite-player-form">
                    <FormField
                        htmlFor="invite-player-email"
                        label="Player&apos;s e-mail"
                        error={showEmailError
                            ? <FieldError testId="invite-player-email-error">Enter a valid e-mail address</FieldError>
                            : null}
                    >
                        <Input
                            id="invite-player-email"
                            type="email"
                            autoFocus
                            value={email}
                            onChange={(event) => { setEmail(event.target.value); }}
                            placeholder="name@example.com"
                            disabled={isSubmitting}
                            data-testid="invite-player-email"
                        />
                    </FormField>

                    <p className="mt-3 text-sm text-secondary-text">
                        They will receive an e-mail with a link to join the app as a player of this team.
                    </p>

                    {sendError && <ErrorMessage testId="invite-player-error">{sendError}</ErrorMessage>}

                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <Button
                            type="button"
                            onClick={onCancel}
                            className="!bg-gray-600 hover:!bg-gray-700"
                            disabled={isSubmitting}
                            data-testid="invite-player-cancel"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            data-testid="invite-player-send"
                        >
                            {isSubmitting ? 'Sending…' : 'Send invite'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
