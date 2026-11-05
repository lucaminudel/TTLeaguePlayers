import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { infoModalStorageKey, isInfoModalSuppressed, suppressInfoModal, useInfoModalSuppression } from '../../../src/hooks/useInfoModalSuppression';

const auth = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
vi.mock('../../../src/hooks/useAuth', () => ({ useAuth: () => auth }));

describe('info modal suppression', () => {
    beforeEach(() => {
        auth.userId = 'user-1';
        localStorage.clear();
    });

    it('keys suppression by both GUID and user and reads only the true value', () => {
        expect(infoModalStorageKey('notice', 'user-1')).toBe('hide_modal_notice_user-1');
        expect(infoModalStorageKey('notice', null)).toBeNull();
        expect(isInfoModalSuppressed('notice', 'user-1')).toBe(false);
        localStorage.setItem('hide_modal_notice_user-1', 'true');
        expect(isInfoModalSuppressed('notice', 'user-1')).toBe(true);
        expect(isInfoModalSuppressed('notice', 'user-2')).toBe(false);
    });

    it('does not read or write a preference without a user id', () => {
        auth.userId = null;
        expect(isInfoModalSuppressed('notice', null)).toBe(false);
        expect(() => { suppressInfoModal('notice', null); }).not.toThrow();
        expect(localStorage.length).toBe(0);
    });

    it('reads and writes against the latest authenticated user after rerender', () => {
        const { result, rerender } = renderHook(() => useInfoModalSuppression('notice'));
        auth.userId = 'user-2';
        rerender();
        result.current.suppress();

        expect(localStorage.getItem('hide_modal_notice_user-2')).toBe('true');
        expect(localStorage.getItem('hide_modal_notice_user-1')).toBeNull();
        expect(result.current.isSuppressed()).toBe(true);
    });

    it('catches storage write failures and exposes the current user preference', () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(() => { suppressInfoModal('notice', 'user-1'); }).not.toThrow();
        expect(warning).toHaveBeenCalledWith('Could not save modal preference:', expect.any(Error));
        warning.mockRestore();
        vi.restoreAllMocks();

        const { result } = renderHook(() => useInfoModalSuppression('notice'));
        expect(result.current.isSuppressed()).toBe(false);
        result.current.suppress();
        expect(result.current.isSuppressed()).toBe(true);
    });
});
