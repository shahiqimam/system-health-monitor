const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const TOKEN_KEY = 'pulsewatch.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get: (): string | null => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const toMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return fallback;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      tokenStore.clear();
    }
    throw new ApiError(toMessage(payload, response.statusText), response.status);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const queryString = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
};
