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

  const contentType = String(res.headers.get("content-type") || "");
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const err: ApiError = new Error("invalid_json");
      err.status = res.status;
      err.code = contentType.includes("text/html") ? "unexpected_html" : "invalid_json";
      throw err;
    }
  } else {
    if (res.ok) {
      const err: ApiError = new Error("empty_response");
      err.status = res.status;
      err.code = "empty_response";
      throw err;
    }
  }

  if (!res.ok) {
    const code = data?.error ? String(data.error) : undefined;
    const err: ApiError = new Error(code || `http_${res.status}`);
    err.status = res.status;
    err.code = code;
    if (typeof window !== "undefined") {
      if (res.status === 401) {
        window.location.assign("/login");
      } else if (res.status === 403 && code === "forbidden") {
        window.location.assign("/login");
      }
    }
    throw err;
  }

  return data as T;
}
