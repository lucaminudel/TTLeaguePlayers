import { use } from 'react';
import { AuthContext } from '../contexts/AuthContextDefinition';

export function useAuth() {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}