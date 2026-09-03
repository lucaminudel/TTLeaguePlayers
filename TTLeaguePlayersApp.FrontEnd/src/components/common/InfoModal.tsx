import React, { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { useInfoModalSuppression } from '../../hooks/useInfoModalSuppression';

interface InfoModalProps {
    guid: string;
    title: string;
    body: React.ReactNode;
    testId: string;
    onOk: () => void;
}

/**
 * A generic "please be aware" dialog with a "don't show again" checkbox 
*/
export const InfoModal: React.FC<InfoModalProps> = ({ guid, title, body, testId, onOk }) => {
    const { suppress } = useInfoModalSuppression(guid);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const modalId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const okContainerRef = useRef<HTMLDivElement>(null);
    const previouslyFocusedRef = useRef<Element | null>(null);

    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement;
        okContainerRef.current?.querySelector('button')?.focus();

        return () => {
            const opener = previouslyFocusedRef.current;
            // Guarded by isConnected: the Rate flow navigates away on OK, which can detach the
            // opener (e.g. the Rate button) from the document before this cleanup runs.
            if (opener instanceof HTMLElement && opener.isConnected) {
                opener.focus();
            }
        };
        // Runs once, at mount and unmount, matching the "one modal per open" lifecycle.
    }, []);

    const getFocusable = (): HTMLElement[] => {
        const dialog = dialogRef.current;
        if (!dialog) return [];
        return Array.from(
            dialog.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') return;

        const focusable = getFocusable();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };

    const handleOk = () => {
        if (dontShowAgain) suppress();
        onOk();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${modalId}-title`}
                aria-describedby={`${modalId}-body`}
                onKeyDown={handleKeyDown}
                data-testid={testId}
                className="bg-primary-base border border-gray-600 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
                <h3 id={`${modalId}-title`} className="text-xl font-bold text-main-text text-center">
                    {title}
                </h3>

                <div id={`${modalId}-body`}>
                    {body}
                </div>

                <div className="flex items-center justify-center gap-3">
                    <input
                        type="checkbox"
                        id={`${modalId}-dont-show-again`}
                        data-testid={`${testId}-dont-show-again`}
                        checked={dontShowAgain}
                        onChange={(e) => { setDontShowAgain(e.target.checked); }}
                        className="w-5 h-5 accent-action-accent"
                    />
                    <label htmlFor={`${modalId}-dont-show-again`} className="text-sm text-secondary-text">
                        Don&apos;t show this message again
                    </label>
                </div>

                <div className="flex justify-center" ref={okContainerRef}>
                    <Button
                        onClick={handleOk}
                        data-testid={`${testId}-ok`}
                    >
                        OK
                    </Button>
                </div>
            </div>
        </div>
    );
};
