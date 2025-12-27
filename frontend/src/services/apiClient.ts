import { API_BASE_URL } from "../config";

interface ApiError extends Error {
  response?: Response;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      detail = undefined;
    }

    const error: ApiError = new Error(
      detail ?? `Request failed with status ${response.status}`
    );
    error.response = response;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function buildUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}${
    path.startsWith("/") ? path : `/${path}`
  }`;
}

export const apiClient = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(buildUrl(path), {
      method: "GET",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    return handleResponse<T>(response);
  },
  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    });
    return handleResponse<T>(response);
  },
};
