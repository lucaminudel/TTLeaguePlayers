import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../../../../src/components/common/ProtectedRoute';

const authState = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: () => authState,
}));

function LoginLocation() {
    const location = useLocation();
    return <p data-testid="login-search">{location.search}</p>;
}

describe('ProtectedRoute', () => {
    beforeEach(() => {
        authState.isAuthenticated = false;
    });

    it('redirects unauthenticated visitors with the encoded requested path and hash', () => {
        render(
            <MemoryRouter initialEntries={['/private/standings#current-season']}>
                <Routes>
                    <Route path="/login" element={<LoginLocation />} />
                    <Route path="*" element={
                        <ProtectedRoute>
                            <p data-testid="private-content">Private standings</p>
                        </ProtectedRoute>
                    } />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('login-search')).toHaveTextContent(
            '?returnUrl=%2Fprivate%2Fstandings%23current-season'
        );
        expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
    });

    it('renders protected content for an authenticated visitor', () => {
        authState.isAuthenticated = true;

        render(
            <MemoryRouter initialEntries={['/private/standings#current-season']}>
                <Routes>
                    <Route path="*" element={
                        <ProtectedRoute>
                            <p data-testid="private-content">Private standings</p>
                        </ProtectedRoute>
                    } />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('private-content')).toBeInTheDocument();
    });
});
