import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeRedirectPath,
  useSessionStore,
  initiateGitHubOAuth,
} from './useSession';
import { ROUTES } from '../../lib/routes';

describe('Auth Security & Session Management', () => {
  beforeEach(() => {
    useSessionStore.getState().setSession(null);
    useSessionStore.getState().setStatus('anonymous');
    vi.restoreAllMocks();
  });

  describe('sanitizeRedirectPath (Open Redirect Prevention)', () => {
    it('allows valid internal application paths', () => {
      expect(sanitizeRedirectPath('/app/overview')).toBe('/app/overview');
      expect(sanitizeRedirectPath('/app/settings/billing')).toBe('/app/settings/billing');
      expect(sanitizeRedirectPath('/diagnoses/d1efa1d8-defb')).toBe('/diagnoses/d1efa1d8-defb');
      expect(sanitizeRedirectPath('/app/repositories?filter=active')).toBe('/app/repositories?filter=active');
    });

    it('rejects protocol-relative and scheme-based external URLs', () => {
      expect(sanitizeRedirectPath('https://evil.com')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('http://malicious.site/phishing')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('//attacker.com/evil')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('/\\attacker.com')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('javascript:alert(1)')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('data:text/html,malicious')).toBe(ROUTES.overview);
    });

    it('falls back to default overview for empty, whitespace, or invalid values', () => {
      expect(sanitizeRedirectPath(null)).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath(undefined)).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('   ')).toBe(ROUTES.overview);
      expect(sanitizeRedirectPath('/app/overview\nhttps://evil.com')).toBe(ROUTES.overview);
    });
  });

  describe('useSessionStore', () => {
    it('sets authenticated state with user details', () => {
      const mockUser = {
        id: 'usr_123',
        userId: 'usr_123',
        login: 'octocat',
        email: 'octocat@github.com',
        name: 'The Octocat',
      };

      const mockSession = {
        access_token: 'hopper_test_jwt',
        token_type: 'bearer',
        user: mockUser,
      };

      useSessionStore.getState().setSession(mockSession);

      const state = useSessionStore.getState();
      expect(state.status).toBe('authenticated');
      expect(state.session).toEqual(mockSession);
      expect(state.user?.login).toBe('octocat');
      expect(state.user?.email).toBe('octocat@github.com');
    });

    it('clears session when signing out', () => {
      useSessionStore.getState().setSession({
        access_token: 'test_token',
        token_type: 'bearer',
        user: {
          id: 'u1',
          userId: 'u1',
          login: 'dev',
          email: null,
          name: 'Developer',
        },
      });

      expect(useSessionStore.getState().status).toBe('authenticated');

      useSessionStore.getState().setSession(null);

      expect(useSessionStore.getState().status).toBe('anonymous');
      expect(useSessionStore.getState().session).toBeNull();
      expect(useSessionStore.getState().user).toBeNull();
    });
  });

  describe('initiateGitHubOAuth', () => {
    it('routes to /api/auth/github for authoritative GitHub authentication', async () => {
      const originalWindow = (globalThis as any).window;
      (globalThis as any).window = {
        location: { href: '', origin: 'http://localhost:5173' },
      };

      try {
        await initiateGitHubOAuth();
        expect((globalThis as any).window.location.href).toBe('/api/auth/github');
      } finally {
        if (originalWindow !== undefined) {
          (globalThis as any).window = originalWindow;
        } else {
          delete (globalThis as any).window;
        }
      }
    });
  });
});
