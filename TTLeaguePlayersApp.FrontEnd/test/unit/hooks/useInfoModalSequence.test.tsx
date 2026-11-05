import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfoModalSequence } from '../../../src/hooks/useInfoModalSequence';

const auth = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
vi.mock('../../../src/hooks/useAuth', () => ({ useAuth: () => auth }));

describe('useInfoModalSequence', () => {
    beforeEach(() => {
        auth.userId = 'user-1';
        localStorage.clear();
    });

    it('shows the first unsuppressed message and advances in order, only once per visit', () => {
        const guids = ['first', 'second', 'third'];
        const { result } = renderHook(() => useInfoModalSequence(guids));

        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('first');
        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('first');
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBe('second');
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBe('third');
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBeNull();
    });

    it('checks suppression as each message is reached and skips suppressed messages', () => {
        localStorage.setItem('hide_modal_first_user-1', 'true');
        localStorage.setItem('hide_modal_third_user-1', 'true');
        const { result } = renderHook(() => useInfoModalSequence(['first', 'second', 'third']));

        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('second');
        localStorage.setItem('hide_modal_third_user-1', 'true');
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBeNull();
    });

    it('uses the current user when advancing after an authentication change', () => {
        localStorage.setItem('hide_modal_second_user-2', 'true');
        const guids = ['first', 'second'];
        const { result, rerender } = renderHook(() => useInfoModalSequence(guids));

        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('first');
        auth.userId = 'user-2';
        rerender();
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBeNull();
    });

    it('uses the current user when triggering after an authentication change', () => {
        localStorage.setItem('hide_modal_first_user-2', 'true');
        const guids = ['first', 'second'];
        const { result, rerender } = renderHook(() => useInfoModalSequence(guids));

        auth.userId = 'user-2';
        rerender();
        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('second');
    });

    it('shows messages without a user id and does not advance beyond the sequence', () => {
        auth.userId = null;
        const { result } = renderHook(() => useInfoModalSequence(['only']));

        act(() => { result.current.onTrigger(); });
        expect(result.current.currentGuid).toBe('only');
        act(() => { result.current.dismissCurrent(); });
        expect(result.current.currentGuid).toBeNull();
    });
});
