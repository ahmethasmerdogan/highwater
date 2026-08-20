"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, tokens, type Role, type User } from "@/lib/api";

interface LoginResponse {
  requires_2fa: boolean;
  challenge_token: string | null;
  access_token: string | null;
  refresh_token: string | null;
  totp_setup: { secret: string; provisioning_uri: string } | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Parola adımı. 2FA zorunlu olduğu için her zaman bir challenge döner. */
  startLogin: (email: string, password: string) => Promise<LoginResponse>;
  /** TOTP adımı. Başarılı olursa oturum açılır. */
  completeLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    if (!tokens.access()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api.get<User>("/auth/me"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) tokens.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const startLogin = useCallback(async (email: string, password: string) => {
    return api.post<LoginResponse>("/auth/login", { email, password });
  }, []);

  const completeLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const data = await api.post<{ access_token: string; refresh_token: string }>("/auth/2fa", {
        challenge_token: challengeToken,
        code,
      });
      tokens.set(data.access_token, data.refresh_token);
      await loadUser();
      router.push("/");
    },
    [loadUser, router],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh();
    try {
      if (refreshToken) await api.post("/auth/logout", { refresh_token: refreshToken });
    } catch {
      /* çıkış her hâlükârda yereldedir */
    }
    tokens.clear();
    setUser(null);
    router.push("/giris");
  }, [router]);

  const can = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.role === "ADMIN") return true;
      return roles.includes(user.role);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, startLogin, completeLogin, logout, refresh: loadUser, can }),
    [user, loading, startLogin, completeLogin, logout, loadUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return context;
}
