import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { InfoModal } from '../../../../src/components/common/InfoModal';
import {
    RATE_INFO_MODAL_GUID,
    STANDINGS_INFO_MODAL_GUID,
} from '../../../../src/components/common/infoModalMessages';

const authMocks = vi.hoisted(() => ({
    useAuth: vi.fn(),
}));

vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: authMocks.useAuth,
}));

const TEST_GUID = 'test-guid-1111-2222-3333-444455556666';

// A minimal harness: an "opener" button that mounts the modal, mirroring how a real caller
// (a Rate button, a page after a successful load) opens InfoModal from its own trigger.
function Harness({ guid = TEST_GUID, onOk }: { guid?: string; onOk?: () => void }) {
    const [open, setOpen] = React.useState(false);
    return (
        <div>
            <button data-testid="opener" onClick={() => { setOpen(true); }}>Open</button>
            {open && (
                <InfoModal
                    guid={guid}
                    title="Test Title"
                    body={<p>Test body text</p>}
                    testId="test-info-modal"
                    onOk={() => {
                        setOpen(false);
                        onOk?.();
                    }}
                />
            )}
        </div>
    );
}

async function openModal(props: { guid?: string; onOk?: () => void } = {}) {
    render(<Harness {...props} />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => { expect(screen.getByTestId('test-info-modal-ok')).toHaveFocus(); });
    return opener;
}

describe('InfoModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        authMocks.useAuth.mockReturnValue({ userId: 'test-user-sub' });
    });

    it('renders accessible dialog semantics', async () => {
        await openModal();

        const modal = screen.getByTestId('test-info-modal');
        expect(modal).toHaveAttribute('role', 'dialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('gives the dialog an accessible name equal to the title', async () => {
        await openModal();

        expect(screen.getByTestId('test-info-modal')).toHaveAccessibleName('Test Title');
    });

    it('moves focus to the OK button when it opens', async () => {
        // openModal() already asserts this via waitFor; a second explicit assertion documents intent.
        await openModal();

        expect(screen.getByTestId('test-info-modal-ok')).toHaveFocus();
    });

    it('restores focus to the opener when it closes', async () => {
        const opener = await openModal();

        fireEvent.click(screen.getByTestId('test-info-modal-ok'));

        await waitFor(() => { expect(opener).toHaveFocus(); });
    });

    it('resolves aria-describedby to the body content', async () => {
        await openModal();

        const modal = screen.getByTestId('test-info-modal');
        const describedById = modal.getAttribute('aria-describedby');
        expect(describedById).toBeTruthy();
        if (!describedById) throw new Error('unreachable: asserted truthy above');

        const bodyEl = document.getElementById(describedById);
        expect(bodyEl).not.toBeNull();
        expect(bodyEl).toHaveTextContent('Test body text');
    });

    it('writes nothing to local storage when OK is pressed unticked', async () => {
        await openModal({ guid: TEST_GUID });

        fireEvent.click(screen.getByTestId('test-info-modal-ok'));

        expect(localStorage.getItem(`hide_modal_${TEST_GUID}_test-user-sub`)).toBeNull();
    });

    it('writes the suppression key when the checkbox is ticked before OK', async () => {
        await openModal({ guid: TEST_GUID });

        fireEvent.click(screen.getByTestId('test-info-modal-dont-show-again'));
        fireEvent.click(screen.getByTestId('test-info-modal-ok'));

        expect(localStorage.getItem(`hide_modal_${TEST_GUID}_test-user-sub`)).toBe('true');
    });

    it('writes nothing when there is no userId, even when ticked', async () => {
        authMocks.useAuth.mockReturnValue({ userId: null });

        await openModal({ guid: TEST_GUID });

        fireEvent.click(screen.getByTestId('test-info-modal-dont-show-again'));
        fireEvent.click(screen.getByTestId('test-info-modal-ok'));

        expect(localStorage.length).toBe(0);
    });

    it('calls onOk whether or not the checkbox was ticked', async () => {
        const onOkUnticked = vi.fn();
        await openModal({ onOk: onOkUnticked });
        fireEvent.click(screen.getByTestId('test-info-modal-ok'));
        expect(onOkUnticked).toHaveBeenCalledTimes(1);
        cleanup();

        const onOkTicked = vi.fn();
        await openModal({ onOk: onOkTicked });
        fireEvent.click(screen.getByTestId('test-info-modal-dont-show-again'));
        fireEvent.click(screen.getByTestId('test-info-modal-ok'));
        expect(onOkTicked).toHaveBeenCalledTimes(1);
    });

    describe('focus trap', () => {
        // jsdom implements no sequential focus navigation: a dispatched Tab keydown moves no focus
        // by itself. This asserts the component's own trap handler, not browser tab order — real
        // tab-order behaviour is only exercised by the e2e specs, in a real browser.
        it('wraps focus from the last focusable element to the first on Tab', async () => {
            await openModal();

            const checkbox = screen.getByTestId('test-info-modal-dont-show-again');
            const ok = screen.getByTestId('test-info-modal-ok');
            ok.focus();

            const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
            ok.dispatchEvent(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(checkbox).toHaveFocus();
        });

        it('wraps focus from the first focusable element to the last on Shift+Tab', async () => {
            await openModal();

            const checkbox = screen.getByTestId('test-info-modal-dont-show-again');
            const ok = screen.getByTestId('test-info-modal-ok');
            checkbox.focus();

            const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
            checkbox.dispatchEvent(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(ok).toHaveFocus();
        });
    });

    // Sub-task 9: the (d) requirement that the Kudos page checkbox does not affect the standings
    // pages, and vice versa — the D10 substitute for an e2e run across both standings pages.
    describe('cross-GUID key independence', () => {
        it('ticking under the Rate GUID leaves the standings GUID key absent', async () => {
            await openModal({ guid: RATE_INFO_MODAL_GUID });

            fireEvent.click(screen.getByTestId('test-info-modal-dont-show-again'));
            fireEvent.click(screen.getByTestId('test-info-modal-ok'));

            expect(localStorage.getItem(`hide_modal_${RATE_INFO_MODAL_GUID}_test-user-sub`)).toBe('true');
            expect(localStorage.getItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`)).toBeNull();
        });

        it('ticking under the standings GUID leaves the Rate GUID key absent', async () => {
            await openModal({ guid: STANDINGS_INFO_MODAL_GUID });

            fireEvent.click(screen.getByTestId('test-info-modal-dont-show-again'));
            fireEvent.click(screen.getByTestId('test-info-modal-ok'));

            expect(localStorage.getItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`)).toBe('true');
            expect(localStorage.getItem(`hide_modal_${RATE_INFO_MODAL_GUID}_test-user-sub`)).toBeNull();
        });
    });
});
