export type ApiError = Error & {
  status?: number;
  code?: string;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const code = data?.error ? String(data.error) : undefined;
    const err: ApiError = new Error(code || `http_${res.status}`);
    err.status = res.status;
    err.code = code;
    throw err;
  }

  return data as T;
}
