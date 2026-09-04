import { useCallback, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { isInfoModalSuppressed } from './useInfoModalSuppression';

/**
 * Drives a fixed, ordered sequence of info modals shown once per visit, each independently
 * suppressible. `guids` must be a module-scope constant: the returned callbacks are keyed on
 * `guids.join('|')`, not on the array's own identity, so a fresh array literal on every render
 * would otherwise defeat the memoisation.
 *
 * Suppression is queried lazily as the sequence advances, not snapshotted at trigger time.
 * With no `userId`, every GUID reads as not-suppressed, so the whole sequence shows.
 */
export function useInfoModalSequence(guids: string[]): {
    onTrigger: () => void;
    currentGuid: string | null;
    dismissCurrent: () => void;
} {
    const { userId } = useAuth();
    const shownThisVisitRef = useRef(false);
    const [currentGuid, setCurrentGuid] = useState<string | null>(null);

    const guidsKey = guids.join('|');

    const firstNonSuppressedFrom = useCallback((startIndex: number): string | null => {
        for (let i = startIndex; i < guids.length; i++) {
            if (!isInfoModalSuppressed(guids[i], userId)) return guids[i];
        }
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guidsKey, userId]);

    const onTrigger = useCallback(() => {
        if (shownThisVisitRef.current) return;
        shownThisVisitRef.current = true;
        setCurrentGuid(firstNonSuppressedFrom(0));
    }, [firstNonSuppressedFrom]);

    const dismissCurrent = useCallback(() => {
        setCurrentGuid((current) => {
            const currentIndex = current === null ? -1 : guids.indexOf(current);
            return firstNonSuppressedFrom(currentIndex + 1);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guidsKey, firstNonSuppressedFrom]);

    return { onTrigger, currentGuid, dismissCurrent };
}
