import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuth } from '../../../src/hooks/useAuth';
import { AuthContext, type AuthContextType } from '../../../src/contexts/AuthContextDefinition';

describe('useAuth', () => {
    it('returns the auth value supplied by its provider', () => {
        const auth = { isAuthenticated: true } as AuthContextType;

        const { result } = renderHook(() => useAuth(), {
            wrapper: ({ children }) => <AuthContext value={auth}>{children}</AuthContext>,
        });

        expect(result.current).toBe(auth);
    });

    it('throws a clear error when rendered outside AuthProvider', () => {
        expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
    });
});
