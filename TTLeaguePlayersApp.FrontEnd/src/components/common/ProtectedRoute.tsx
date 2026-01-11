import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute component that wraps pages requiring authentication.
 * Note: The router only renders after the initial auth check is complete (see App.tsx),
 * so this component can safely assume that isLoading is false.
 * - If authenticated, renders the children
 * - If not authenticated, redirects to login with a returnUrl query parameter
 * After successful login, the user will be redirected back to the originally requested page.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Encode the current location as returnUrl to redirect after login
    const returnUrl = encodeURIComponent(location.pathname + location.hash);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return <>{children}</>;
};
