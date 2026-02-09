import axios from "axios";

const API = "http://localhost:4001";

export function api(token) {
  return axios.create({
    baseURL: API,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

export function connectStream(token, onMessage) {
  const es = new EventSource(`${API}/api/stream?access_token=${token}`);
  es.onmessage = onMessage;
  return () => es.close();
}
