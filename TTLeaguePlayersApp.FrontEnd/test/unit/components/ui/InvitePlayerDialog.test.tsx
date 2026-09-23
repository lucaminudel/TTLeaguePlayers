import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvitePlayerDialog } from '../../../../src/components/ui/InvitePlayerDialog';
import { GeneralApiError } from '../../../../src/api/api';

describe('InvitePlayerDialog', () => {
    const PLAYER = 'Kevin Ji';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderDialog = (onSend = vi.fn().mockResolvedValue(undefined), onCancel = vi.fn()) => {
        render(<InvitePlayerDialog playerName={PLAYER} onCancel={onCancel} onSend={onSend} />);
        return { onSend, onCancel };
    };

    const typeEmail = (value: string) => {
        fireEvent.change(screen.getByTestId('invite-player-email'), { target: { value } });
    };

    const clickSend = () => { fireEvent.click(screen.getByTestId('invite-player-send')); };

    it('names the player being invited', () => {
        renderDialog();

        expect(screen.getByTestId('invite-player-dialog')).toHaveTextContent(`Invite ${PLAYER}`);
    });

    it('sends the trimmed e-mail', async () => {
        const { onSend } = renderDialog();

        typeEmail('  kevin@user.test  ');
        clickSend();

        await waitFor(() => { expect(onSend).toHaveBeenCalledWith('kevin@user.test'); });
    });

    it('refuses an address with no @ and does not send', async () => {
        const { onSend } = renderDialog();

        typeEmail('not-an-email');
        clickSend();

        await waitFor(() => {
            expect(screen.getByTestId('invite-player-email-error')).toHaveTextContent('Enter a valid e-mail address');
        });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('refuses an address with no dot in the domain and does not send', async () => {
        const { onSend } = renderDialog();

        typeEmail('kevin@localhost');
        clickSend();

        await waitFor(() => { expect(screen.getByTestId('invite-player-email-error')).toBeTruthy(); });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('reports a malformed address as it is typed, before Send is pressed', () => {
        const { onSend } = renderDialog();

        typeEmail('kevin@');

        expect(screen.getByTestId('invite-player-email-error')).toHaveTextContent('Enter a valid e-mail address');
        expect(onSend).not.toHaveBeenCalled();
    });

    it('says nothing about an untouched empty field', () => {
        renderDialog();

        expect(screen.queryByTestId('invite-player-email-error')).toBeNull();
    });

    it('stops complaining as soon as the address becomes valid, without pressing Send', () => {
        renderDialog();

        typeEmail('kevin@');
        expect(screen.getByTestId('invite-player-email-error')).toBeTruthy();

        typeEmail('kevin@user.test');

        expect(screen.queryByTestId('invite-player-email-error')).toBeNull();
    });

    it('refuses an empty address and does not send', async () => {
        const { onSend } = renderDialog();

        clickSend();

        await waitFor(() => { expect(screen.getByTestId('invite-player-email-error')).toBeTruthy(); });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('clears the validation error once a valid address is sent', async () => {
        const { onSend } = renderDialog();

        typeEmail('not-an-email');
        clickSend();
        await waitFor(() => { expect(screen.getByTestId('invite-player-email-error')).toBeTruthy(); });

        typeEmail('kevin@user.test');
        clickSend();

        await waitFor(() => { expect(onSend).toHaveBeenCalled(); });
        expect(screen.queryByTestId('invite-player-email-error')).toBeNull();
    });

    it('disables both buttons while the invite is being sent, and shows it is working', async () => {
        let resolveSend: () => void = () => undefined;
        const onSend = vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveSend = resolve; }));
        renderDialog(onSend);

        typeEmail('kevin@user.test');
        clickSend();

        await waitFor(() => { expect(screen.getByTestId('invite-player-send')).toBeDisabled(); });
        expect(screen.getByTestId('invite-player-cancel')).toBeDisabled();
        expect(screen.getByTestId('invite-player-send')).toHaveTextContent('Sending…');

        resolveSend();
        await waitFor(() => { expect(screen.getByTestId('invite-player-send')).not.toBeDisabled(); });
    });

    it('shows the failure and lets the captain try again when sending fails', async () => {
        const onSend = vi.fn().mockRejectedValue(new GeneralApiError('Connection error'));
        renderDialog(onSend);

        typeEmail('kevin@user.test');
        clickSend();

        await waitFor(() => {
            expect(screen.getByTestId('invite-player-error'))
                .toHaveTextContent('Network error. Please check your internet connection.');
        });
        expect(screen.getByTestId('invite-player-send')).not.toBeDisabled();
        expect(screen.getByTestId('invite-player-cancel')).not.toBeDisabled();
    });

    it('shows the field-level reasons a rejected request came back with', async () => {
        const onSend = vi.fn().mockRejectedValue(
            new GeneralApiError('Validation failed', 400, undefined, ['invitee_email_id must be a valid email address'])
        );
        renderDialog(onSend);

        typeEmail('kevin@user.test');
        clickSend();

        await waitFor(() => {
            expect(screen.getByTestId('invite-player-error'))
                .toHaveTextContent('invitee_email_id must be a valid email address');
        });
    });

    it('cancels without sending', () => {
        const { onSend, onCancel } = renderDialog();

        fireEvent.click(screen.getByTestId('invite-player-cancel'));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('sends when the captain presses Enter in the e-mail field', async () => {
        const { onSend } = renderDialog();

        typeEmail('kevin@user.test');
        fireEvent.submit(screen.getByTestId('invite-player-form'));

        await waitFor(() => { expect(onSend).toHaveBeenCalledWith('kevin@user.test'); });
    });
});
