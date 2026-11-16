export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "patient" | "professional";
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

const SESSION_KEY = "clinic_auth_session";

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getAuthSession()?.token ?? null;
}

export function getAuthUser(): AuthUser | null {
  return getAuthSession()?.user ?? null;
}

export function setAuthSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(SESSION_KEY);
}