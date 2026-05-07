import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  confirmUserSignUp,
  fetchCurrentUser,
  refreshAuthSession,
  setApiAuthToken,
  signInUser,
  signUpUser
} from "../api/client";
import type { ConfirmSignUpRequest, SignUpRequest, SignUpResponse, UserProfile } from "../api/client";

const storageKey = "salesops.auth.v1";

export type AuthSession = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: UserProfile;
};

type AuthContextValue = {
  user: UserProfile | null;
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signUp: (payload: SignUpRequest) => Promise<SignUpResponse>;
  confirmSignUp: (payload: ConfirmSignUpRequest) => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession | null) {
  if (!session) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

function buildSession(
  response: {
    idToken: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserProfile;
  },
  refreshToken = response.refreshToken
) {
  return {
    idToken: response.idToken,
    accessToken: response.accessToken,
    refreshToken,
    expiresAt: Date.now() + response.expiresIn * 1000,
    user: response.user
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [isLoading, setIsLoading] = useState(true);

  const persistSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    writeStoredSession(nextSession);
    setApiAuthToken(nextSession?.idToken ?? null);
  }, []);

  const signOut = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  const refreshStoredSession = useCallback(
    async (currentSession: AuthSession) => {
      const refreshed = await refreshAuthSession(currentSession.refreshToken);
      const nextSession = buildSession(
        {
          ...refreshed,
          refreshToken: currentSession.refreshToken,
          user: currentSession.user
        },
        currentSession.refreshToken
      );
      persistSession(nextSession);
      return nextSession;
    },
    [persistSession]
  );

  useEffect(() => {
    let isMounted = true;

    async function restore() {
      const storedSession = readStoredSession();
      if (!storedSession) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        setApiAuthToken(storedSession.idToken);
        const activeSession =
          storedSession.expiresAt <= Date.now() + 60_000
            ? await refreshStoredSession(storedSession)
            : storedSession;

        const user = await fetchCurrentUser();
        if (isMounted) {
          persistSession({ ...activeSession, user });
        }
      } catch {
        if (isMounted) {
          persistSession(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restore();

    return () => {
      isMounted = false;
    };
  }, [persistSession, refreshStoredSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await signInUser({ email, password });
      const nextSession = buildSession(response);
      persistSession(nextSession);
      return response.user;
    },
    [persistSession]
  );

  const signUp = useCallback((payload: SignUpRequest) => signUpUser(payload), []);

  const confirmSignUp = useCallback((payload: ConfirmSignUpRequest) => confirmUserSignUp(payload), []);

  const refreshSession = useCallback(async () => {
    if (!session) {
      throw new Error("No active session.");
    }

    const refreshed = await refreshStoredSession(session);
    const user = await fetchCurrentUser();
    persistSession({ ...refreshed, user });
  }, [persistSession, refreshStoredSession, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      signIn,
      signUp,
      confirmSignUp,
      refreshSession,
      signOut
    }),
    [confirmSignUp, isLoading, refreshSession, session, signIn, signOut, signUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
