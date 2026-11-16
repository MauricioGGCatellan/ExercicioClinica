import type { AuthSession } from "./auth";

const API_BASE = "/api";

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Falha ao autenticar");
  }

  return {
    token: data.token,
    user: {
      id: data.user.id,
      name: data.user.name,
      email,
      role: data.user.role,
    },
  };
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const token = localStorage.getItem("clinic_auth_session")
    ? JSON.parse(localStorage.getItem("clinic_auth_session") as string)?.token
    : null;

  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}