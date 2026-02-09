export function getToken() {
  return localStorage.getItem("token") || "";
}
export function setToken(t) {
  localStorage.setItem("token", t);
}
export function clearToken() {
  localStorage.removeItem("token");
}

async function request(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token && !path.startsWith("/api/stream")) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && opts.body) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `http_${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  seed: (email, password) =>
    request("/api/admin/seed", { method: "POST", body: JSON.stringify({ email, password }) }),

  getBoard: (dateKey) => request(`/api/board/${dateKey}`),

  createCard: (dateKey, data) =>
    request(`/api/board/${dateKey}/cards`, { method: "POST", body: JSON.stringify(data) }),

  patchCard: (id, data) =>
    request(`/api/cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteCard: (id) => request(`/api/cards/${id}`, { method: "DELETE" })
};

export function connectStream(onEvent) {
  const token = getToken();
  const es = new EventSource(`/api/stream?access_token=${encodeURIComponent(token)}`);
  es.addEventListener("board_update", (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  });
  return () => es.close();
}
