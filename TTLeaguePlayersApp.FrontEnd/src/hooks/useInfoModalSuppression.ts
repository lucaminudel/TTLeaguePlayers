import { useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * Derives the local-storage suppression key from the modal's GUID and the current user's id.
 * Suppression is per user, not per browser: signing out does not clear local storage.
 *
 * With no `userId` the key is `null`: `isInfoModalSuppressed()` always returns `false` and
 * `suppressInfoModal()` writes nothing, so an unauthenticated visitor sees the modal every time but
 * nothing crashes.
 */
export function infoModalStorageKey(guid: string, userId: string | null | undefined): string | null {
    return userId ? `hide_modal_${guid}_${userId}` : null;
}

export function isInfoModalSuppressed(guid: string, userId: string | null | undefined): boolean {
    const storageKey = infoModalStorageKey(guid, userId);
    return storageKey !== null && localStorage.getItem(storageKey) === 'true';
}

export function suppressInfoModal(guid: string, userId: string | null | undefined): void {
    const storageKey = infoModalStorageKey(guid, userId);
    if (storageKey === null) return;
    try {
        localStorage.setItem(storageKey, 'true');
    } catch (error) {
        console.warn('Could not save modal preference:', error);
    }
}

/**
 * Both returned functions are `useCallback`-wrapped with a stable identity across renders (as long
 * as the derived key does not change), so callers can safely reference them from inside effects or
 * handlers reached by effects without triggering a re-run on every render.
 */
export function useInfoModalSuppression(guid: string): {
    isSuppressed: () => boolean;
    suppress: () => void;
} {
    const { userId } = useAuth();

    const isSuppressed = useCallback(() => {
        return isInfoModalSuppressed(guid, userId);
    }, [guid, userId]);

    const suppress = useCallback(() => {
        suppressInfoModal(guid, userId);
    }, [guid, userId]);

    return { isSuppressed, suppress };
}
