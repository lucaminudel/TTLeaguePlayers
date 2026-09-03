import { useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * Derives the local-storage suppression key from the modal's GUID and the current user's id.
 * Suppression is per user, not per browser: signing out does not clear local storage.
 *
 * With no `userId` the key is `null`: `isSuppressed()` always returns `false` and `suppress()`
 * writes nothing, so an unauthenticated visitor sees the modal every time but nothing crashes.
 *
 * Both returned functions are `useCallback`-wrapped with a stable identity across renders (as long
 * as the derived key does not change), so callers can safely reference them from inside effects or
 * handlers reached by effects without triggering a re-run on every render.
 */
export function useInfoModalSuppression(guid: string): {
    isSuppressed: () => boolean;
    suppress: () => void;
} {
    const { userId } = useAuth();
    const storageKey = userId ? `hide_modal_${guid}_${userId}` : null;

    const isSuppressed = useCallback(() => {
        return storageKey !== null && localStorage.getItem(storageKey) === 'true';
    }, [storageKey]);

    const suppress = useCallback(() => {
        if (storageKey === null) return;
        try {
            localStorage.setItem(storageKey, 'true');
        } catch (error) {
            console.warn('Could not save modal preference:', error);
        }
    }, [storageKey]);

    return { isSuppressed, suppress };
}
