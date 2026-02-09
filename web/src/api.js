function getToken() {
  return localStorage.getItem("token") || "";
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const err = new Error("api_error");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  async seed(email, password) {
    return req("/api/admin/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  },
  async login(email, password) {
    return req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  },
  async getBoard(dateKey) {
    return req(`/api/board/${dateKey}`);
  },
  async createCard(dateKey, payload) {
    return req(`/api/board/${dateKey}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  async patchCard(id, payload) {
    return req(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  async deleteCard(id) {
    return req(`/api/cards/${id}`, { method: "DELETE" });
  },
  async listComments(cardId) {
    return req(`/api/cards/${cardId}/comments`);
  },
  async addComment(cardId, payload) {
    return req(`/api/cards/${cardId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  async listAttachments(cardId) {
    return req(`/api/cards/${cardId}/attachments`);
  },
  async uploadAttachment(cardId, file) {
    const token = getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/cards/${cardId}/attachments`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error("upload_error");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  async deleteAttachment(attId) {
    return req(`/api/attachments/${attId}`, { method: "DELETE" });
  }
};

export function connectStream(onMessage) {
  const token = getToken();
  if (!token) return () => {};
  const es = new EventSource(`/api/stream?access_token=${encodeURIComponent(token)}`);
  es.addEventListener("board_update", () => onMessage?.());
  es.onerror = () => {};
  return () => es.close();
}
