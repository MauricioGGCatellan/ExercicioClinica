import { getAuthToken, type AuthSession } from "./auth";

const API_BASE = "/api";

export async function login(
  email: string,
  password: string
): Promise<AuthSession> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? "Falha ao autenticar");
  }

  return {
    token: data.token,
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email ?? email,
      role: data.user.role,
    },
  };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Usuário não autenticado");
  }

  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data
        ? String(data.error)
        : `Erro HTTP ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}