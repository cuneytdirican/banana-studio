import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types';
import { checkUserAuthorization, getProfile, getSession, onAuthStateChange, signOut } from '../services/authService';
import { clearLocalMediaCache } from '../services/storageService';
import { LoginScreen } from './LoginScreen';

type Access = { userId: string; profile: UserProfile | null };

/** The workspace is mounted only after a verified active allowlist check. */
export function AuthBoundary({ children }: {
  children: (access: Access, onSignOut: () => Promise<void>) => React.ReactNode;
}) {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const identity = useRef<string | null>(null);
  const verifiedUserId = useRef<string | null>(null);
  const revision = useRef(0);
  const signingOut = useRef(false);
  const cacheCleanup = useRef<Promise<void>>(Promise.resolve());

  const forgetIdentity = useCallback(() => {
    const previousId = identity.current;
    identity.current = null;
    verifiedUserId.current = null;
    setAccess(null);
    cacheCleanup.current = cacheCleanup.current
      .then(() => clearLocalMediaCache(previousId || undefined))
      .catch(() => { /* User-scoped storage still prevents cross-account reads. */ });
  }, []);

  const handleSignOut = useCallback(async () => {
    signingOut.current = true;
    revision.current += 1;
    forgetIdentity();
    setLoading(false);
    setDenied(false);
    setUnavailable(false);
    setSignOutFailed(false);
    try {
      await signOut();
      signingOut.current = false;
    } catch {
      // Keep the workspace closed even if the remote logout request fails.
      setSignOutFailed(true);
    }
  }, [forgetIdentity]);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const isCurrent = (check: number) => !disposed && revision.current === check && !signingOut.current;

    const verify = async (providedSession?: Session | null) => {
      if (signingOut.current) return;
      const check = ++revision.current;
      checking = true;
      let userId: string | null = null;
      let sessionReadFailed = false;
      try {
        sessionReadFailed = providedSession === undefined;
        const session = providedSession === undefined ? await getSession() : providedSession;
        sessionReadFailed = false;
        if (!isCurrent(check)) return;
        userId = session?.user.id || null;
        if (userId !== identity.current) {
          forgetIdentity();
          identity.current = userId;
          setLoading(!!userId);
        }
        if (!userId) {
          forgetIdentity();
          setLoading(false);
          return;
        }
        const authorization = await checkUserAuthorization(userId);
        if (!isCurrent(check)) return;
        if (authorization === 'unauthorized') {
          forgetIdentity();
          setDenied(true);
          setUnavailable(false);
          setSignOutFailed(false);
          setLoading(false);
          return;
        }
        if (authorization === 'unavailable') {
          setLoading(false);
          if (verifiedUserId.current === userId) {
            // Keep the already verified workspace mounted; server-side RLS and
            // requireUser still enforce access while the next timer retries.
            setUnavailable(false);
            return;
          }
          forgetIdentity();
          setDenied(false);
          setUnavailable(true);
          return;
        }
        const profile = await getProfile();
        if (!isCurrent(check)) return;
        // Another identity cannot supply this workspace's profile/admin role.
        if (profile && profile.id !== userId) throw new Error('Session changed');
        await cacheCleanup.current;
        if (!isCurrent(check)) return;
        identity.current = userId;
        verifiedUserId.current = userId;
        setAccess({ userId, profile });
        setDenied(false);
        setUnavailable(false);
        setSignOutFailed(false);
        setLoading(false);
      } catch {
        if (!isCurrent(check)) return;
        setLoading(false);
        if (verifiedUserId.current !== null && verifiedUserId.current === identity.current) {
          // A profile/network read failed after access was already verified.
          setUnavailable(false);
          return;
        }
        forgetIdentity();
        setDenied(!sessionReadFailed);
        setUnavailable(sessionReadFailed);
        setSignOutFailed(false);
      } finally {
        if (revision.current === check) checking = false;
      }
    };

    void verify();
    const { data: { subscription } } = onAuthStateChange((session, event) => {
      if (event === 'INITIAL_SESSION') return;
      // Invalidate async checks and hide the old account synchronously. Supabase
      // auth callbacks must not await auth calls while its session lock is held.
      revision.current += 1;
      checking = false;
      if (!session || session.user.id !== identity.current) {
        forgetIdentity();
        setLoading(!!session);
      }
      const scheduledRevision = revision.current;
      window.setTimeout(() => {
        if (isCurrent(scheduledRevision)) void verify(session);
      }, 0);
    });
    const refresh = () => {
      if (!checking && document.visibilityState !== 'hidden') void verify();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      revision.current += 1;
      subscription.unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [forgetIdentity]);

  if (loading) return <div className="h-screen w-screen bg-[#0d1117] flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!access) return <LoginScreen isUnauthorized={denied} isUnavailable={unavailable} isSignOutFailed={signOutFailed} />;
  return <>{children(access, handleSignOut)}</>;
}
